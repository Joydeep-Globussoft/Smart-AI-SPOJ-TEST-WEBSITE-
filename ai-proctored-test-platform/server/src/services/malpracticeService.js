// Malpractice Service — YOLO phone detection proxy & daemon manager
// Calls the Python YOLO microservice (yolo-service/) for server-side phone detection
// Implements BUG-108: Non-blocking health checks, continuous periodic monitoring, and self-healing.
const fetch = require('node-fetch');
const FormData = require('form-data');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let yoloProcess = null;
let isStartingYolo = false;
let periodicHealthTimer = null;
let lastRestartAttempt = 0;

// Retry ceiling & Circuit-breaker configuration
const MAX_RESTART_ATTEMPTS = 5;
let restartAttemptsCount = 0;
let isPermanentFailure = false;

// Internal health tracking state
let yoloHealthStatus = {
  status: 'starting', // 'online' | 'starting' | 'critical'
  online: false,
  modelLoaded: false,
  permanentFailure: false,
  restartAttempts: 0,
  maxRestartAttempts: MAX_RESTART_ATTEMPTS,
  url: null,
  lastChecked: null,
  error: null,
};

/**
 * Resolve the effective base URL of the YOLO service
 */
const getEffectiveYoloUrl = () => {
  return (process.env.YOLO_SERVICE_URL || 'http://localhost:8001').replace(/\/detect\/?$/, '');
};

/**
 * Synchronous getter for current YOLO health status (used by API endpoints)
 */
const getYoloHealthStatus = () => {
  return {
    ...yoloHealthStatus,
    restartAttempts: restartAttemptsCount,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    recentLogs: [...recentYoloLogs],
  };
};

/**
 * Compute exponential backoff delay in ms based on restart attempt count
 */
const getBackoffDelayMs = (attempts) => {
  // Attempt 1: 30s, Attempt 2: 60s, Attempt 3: 120s, Attempt 4: 240s, Attempt 5: 300s
  return Math.min(300000, 30000 * Math.pow(2, Math.max(0, attempts - 1)));
};

/**
 * Reset retry counters and clear permanent failure state (manual admin intervention)
 */
const manualResetYoloService = () => {
  console.log('[YOLO] Manual reset triggered by Admin. Resetting restart counter and attempting startup...');
  restartAttemptsCount = 0;
  isPermanentFailure = false;
  lastRestartAttempt = 0;
  yoloHealthStatus.permanentFailure = false;
  yoloHealthStatus.error = null;
  startLocalYoloService();
  return getYoloHealthStatus();
};

/**
 * Query the YOLO service /health endpoint and update state
 */
const checkYoloHealth = async () => {
  let baseUrl = getEffectiveYoloUrl();
  const previousStatus = yoloHealthStatus.status;

  const tryPing = async (url) => {
    const res = await fetch(`${url}/health`, { timeout: 3000 });
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.model_loaded === true ? 'online' : 'starting',
        online: true,
        modelLoaded: data.model_loaded === true,
        permanentFailure: false,
        restartAttempts: 0,
        maxRestartAttempts: MAX_RESTART_ATTEMPTS,
        url,
        lastChecked: new Date().toISOString(),
        error: data.model_loaded === true ? null : 'Model checkpoint is currently loading...',
      };
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  };

  try {
    yoloHealthStatus = await tryPing(baseUrl);
    // On verified success, reset error count
    restartAttemptsCount = 0;
    isPermanentFailure = false;
    if (previousStatus !== 'online' && yoloHealthStatus.status === 'online') {
      console.log(`[YOLO] ✓ YOLO phone detection service is ONLINE and healthy at ${baseUrl}/health (model_loaded: true)`);
    }
    return yoloHealthStatus;
  } catch (primaryErr) {
    // If primary URL failed and wasn't localhost, try localhost fallback
    if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
      try {
        yoloHealthStatus = await tryPing('http://localhost:8001');
        restartAttemptsCount = 0;
        isPermanentFailure = false;
        if (previousStatus !== 'online' && yoloHealthStatus.status === 'online') {
          console.log(`[YOLO] ✓ YOLO phone detection service is ONLINE and healthy at http://localhost:8001/health (model_loaded: true)`);
        }
        return yoloHealthStatus;
      } catch (_) {}
    }

    yoloHealthStatus = {
      status: isPermanentFailure ? 'critical' : (isStartingYolo ? 'starting' : 'critical'),
      online: false,
      modelLoaded: false,
      permanentFailure: isPermanentFailure,
      restartAttempts: restartAttemptsCount,
      maxRestartAttempts: MAX_RESTART_ATTEMPTS,
      url: baseUrl,
      lastChecked: new Date().toISOString(),
      error: isPermanentFailure
        ? `PERMANENT FAILURE: Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded. Manual intervention required.`
        : primaryErr.message,
    };
    return yoloHealthStatus;
  }
};

/**
 * Start periodic continuous background health check (runs every 30 seconds)
 */
const startPeriodicHealthMonitor = () => {
  if (periodicHealthTimer) return;

  periodicHealthTimer = setInterval(async () => {
    const health = await checkYoloHealth();

    // If offline and not in permanent failure state, attempt bounded auto-restart with exponential backoff
    if (!health.online && !getEffectiveYoloUrl().includes('https://') && !isPermanentFailure) {
      const now = Date.now();
      const requiredDelay = getBackoffDelayMs(restartAttemptsCount);

      if (now - lastRestartAttempt >= requiredDelay && !isStartingYolo) {
        if (restartAttemptsCount >= MAX_RESTART_ATTEMPTS) {
          isPermanentFailure = true;
          console.error(
            `\n🚨 [CRITICAL FATAL] [YOLO] Daemon reached maximum auto-restart attempts (${MAX_RESTART_ATTEMPTS}/${MAX_RESTART_ATTEMPTS}).` +
            `\n   Halting automatic retry loop to prevent resource thrashing.` +
            `\n   Service is in PERMANENT FAILURE state. Manual Admin intervention required.\n`
          );
          yoloHealthStatus.status = 'critical';
          yoloHealthStatus.permanentFailure = true;
          yoloHealthStatus.error = `PERMANENT FAILURE: Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded. Manual intervention required.`;
          return;
        }

        restartAttemptsCount++;
        lastRestartAttempt = now;
        console.warn(
          `[YOLO] Auto-restart attempt ${restartAttemptsCount}/${MAX_RESTART_ATTEMPTS} (next backoff: ${Math.round(getBackoffDelayMs(restartAttemptsCount) / 1000)}s)...`
        );
        startLocalYoloService();
      }
    }
  }, 30000);
};

let recentYoloLogs = [];

/**
 * Helper to record logs in ring buffer
 */
const recordYoloLog = (prefix, msg) => {
  if (!msg) return;
  recentYoloLogs.push(`[${new Date().toISOString()}] ${prefix} ${msg}`);
  if (recentYoloLogs.length > 25) recentYoloLogs.shift();
};

/**
 * Asynchronously spawn the local YOLO microservice daemon
 */
const startLocalYoloService = () => {
  if (yoloProcess || isStartingYolo || isPermanentFailure) return;
  isStartingYolo = true;
  yoloHealthStatus.status = 'starting';
  yoloHealthStatus.error = 'Daemon is starting...';

  const yoloDir = path.resolve(__dirname, '../../../yolo-service');
  const venvPythonWin = path.resolve(yoloDir, '.venv', 'Scripts', 'python.exe');
  const venvPythonLinux = path.resolve(yoloDir, '.venv', 'bin', 'python');

  let pythonCmd = 'python3';
  if (fs.existsSync(venvPythonLinux)) {
    pythonCmd = venvPythonLinux;
  } else if (fs.existsSync(venvPythonWin)) {
    pythonCmd = venvPythonWin;
  } else if (process.platform === 'win32') {
    pythonCmd = 'python';
  }

  console.log(`[YOLO] Attempting to auto-start YOLO microservice daemon using: ${pythonCmd}`);
  recordYoloLog('[HOST]', `Starting YOLO daemon via: ${pythonCmd}`);

  try {
    const pythonPathEntries = [
      process.env.PYTHONPATH,
      path.resolve(process.env.HOME || '/root', '.local/lib/python3.10/site-packages'),
      path.resolve(process.env.HOME || '/root', '.local/lib/python3.11/site-packages'),
      path.resolve(process.env.HOME || '/root', '.local/lib/python3.12/site-packages'),
    ].filter(Boolean);

    const yoloEnv = {
      ...process.env,
      PORT: '8001',
      YOLO_PORT: '8001',
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: pythonPathEntries.join(process.platform === 'win32' ? ';' : ':'),
    };
    yoloProcess = spawn(pythonCmd, ['app.py'], {
      cwd: yoloDir,
      env: yoloEnv,
      stdio: 'pipe',
      detached: false,
    });

    yoloProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) {
        console.log(`[YOLO-Service] ${msg}`);
        recordYoloLog('[stdout]', msg);
      }
    });

    yoloProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) {
        console.error(`[YOLO-Service stderr] ${msg}`);
        recordYoloLog('[stderr]', msg);
      }
    });

    yoloProcess.on('exit', (code) => {
      console.warn(`[YOLO-Service] Process exited with code ${code}`);
      recordYoloLog('[HOST]', `Process exited with code ${code}`);
      yoloProcess = null;
      isStartingYolo = false;
      const lastErr = recentYoloLogs.slice(-3).map(l => l.replace(/^\[.*?\]\s*/, '')).join(' | ');
      yoloHealthStatus = {
        status: 'critical',
        online: false,
        modelLoaded: false,
        url: getEffectiveYoloUrl(),
        lastChecked: new Date().toISOString(),
        error: `Process exited with code ${code}${lastErr ? `: ${lastErr}` : ''}`,
        recentLogs: [...recentYoloLogs],
      };
    });

    yoloProcess.on('error', (err) => {
      console.error(`[CRITICAL] [YOLO] Failed to spawn YOLO service: ${err.message}`);
      recordYoloLog('[HOST]', `Spawn error: ${err.message}`);
      yoloProcess = null;
      isStartingYolo = false;
      yoloHealthStatus = {
        status: 'critical',
        online: false,
        modelLoaded: false,
        url: getEffectiveYoloUrl(),
        lastChecked: new Date().toISOString(),
        error: err.message,
        recentLogs: [...recentYoloLogs],
      };
    });

    // ── Non-blocking Startup Polling Check (Background async) ─────────────
    const startupDelays = [2000, 4000, 7000, 11000, 15000];
    startupDelays.forEach((delay, idx) => {
      setTimeout(async () => {
        if (yoloHealthStatus.status === 'online') return;
        const health = await checkYoloHealth();
        if (health.online && health.modelLoaded) {
          isStartingYolo = false;
        } else if (idx === startupDelays.length - 1 && !health.online) {
          isStartingYolo = false;
          console.error(
            `[CRITICAL] [YOLO] YOLO phone detection microservice failed to respond to startup health check at ${getEffectiveYoloUrl()}/health! Real-time phone detection is currently UNAVAILABLE.`
          );
        }
      }, delay);
    });

    // Start continuous 30s background health monitor
    startPeriodicHealthMonitor();

  } catch (err) {
    console.error(`[CRITICAL] [YOLO] Error launching YOLO process:`, err);
    recordYoloLog('[HOST]', `Launch exception: ${err.message}`);
    isStartingYolo = false;
    yoloHealthStatus = {
      status: 'critical',
      online: false,
      modelLoaded: false,
      url: getEffectiveYoloUrl(),
      lastChecked: new Date().toISOString(),
      error: err.message,
      recentLogs: [...recentYoloLogs],
    };
  }
};

// Auto-cleanup on node exit
process.on('exit', () => {
  if (yoloProcess) yoloProcess.kill();
  if (periodicHealthTimer) clearInterval(periodicHealthTimer);
});

/**
 * Send a webcam frame to the YOLO service for phone detection.
 * @param {Buffer} imageBuffer - Raw image buffer from candidate webcam
 * @returns {{ phoneDetected: boolean, confidence?: number, detections?: Array }}
 */
const detectPhone = async (imageBuffer) => {
  const isLocalRunning = yoloProcess !== null || yoloHealthStatus.online;
  const baseUrl = isLocalRunning ? 'http://localhost:8001' : getEffectiveYoloUrl();

  const createForm = () => {
    const form = new FormData();
    form.append('image', imageBuffer, {
      filename: 'frame.jpg',
      contentType: 'image/jpeg',
    });
    return form;
  };

  try {
    let response;
    const primaryForm = createForm();
    try {
      response = await fetch(`${baseUrl}/detect`, {
        method: 'POST',
        body: primaryForm,
        headers: primaryForm.getHeaders(),
        timeout: 15000,
      });
    } catch (netErr) {
      if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
        console.debug('[YOLO] Primary URL failed (' + netErr.message + '), trying localhost:8001 fallback...');
        const fallbackForm = createForm();
        try {
          response = await fetch('http://localhost:8001/detect', {
            method: 'POST',
            body: fallbackForm,
            headers: fallbackForm.getHeaders(),
            timeout: 15000,
          });
        } catch (fallbackErr) {
          startLocalYoloService();
          throw fallbackErr;
        }
      } else {
        startLocalYoloService();
        throw netErr;
      }
    }

    if (!response || !response.ok) {
      const statusText = response ? `HTTP ${response.status}` : 'no response';
      console.error('[YOLO] Service response not OK:', statusText);
      return { phoneDetected: false, error: `Service response not OK: ${statusText}` };
    }

    const data = await response.json();
    if (data.phoneDetected) {
      console.warn(`[YOLO] 📱 Phone detected! Confidence: ${data.confidence}. Detections:`, data.detections);
    } else {
      console.log(`[YOLO] Frame analyzed: no phone detected`);
    }

    return {
      phoneDetected: data.phoneDetected === true,
      confidence: data.confidence ?? 0,
      detections: data.detections || [],
    };
  } catch (err) {
    console.error('[YOLO] Detection error:', err.message);
    return { phoneDetected: false, error: err.message };
  }
};

module.exports = {
  detectPhone,
  startLocalYoloService,
  checkYoloHealth,
  getYoloHealthStatus,
  manualResetYoloService,
};

