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

// Internal health tracking state
let yoloHealthStatus = {
  status: 'starting', // 'online' | 'starting' | 'critical'
  online: false,
  modelLoaded: false,
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
  return { ...yoloHealthStatus };
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
        url,
        lastChecked: new Date().toISOString(),
        error: data.model_loaded === true ? null : 'Model checkpoint is currently loading...',
      };
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  };

  try {
    yoloHealthStatus = await tryPing(baseUrl);
    if (previousStatus !== 'online' && yoloHealthStatus.status === 'online') {
      console.log(`[YOLO] ✓ YOLO phone detection service is ONLINE and healthy at ${baseUrl}/health (model_loaded: true)`);
    }
    return yoloHealthStatus;
  } catch (primaryErr) {
    // If primary URL failed and wasn't localhost, try localhost fallback
    if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
      try {
        yoloHealthStatus = await tryPing('http://localhost:8001');
        if (previousStatus !== 'online' && yoloHealthStatus.status === 'online') {
          console.log(`[YOLO] ✓ YOLO phone detection service is ONLINE and healthy at http://localhost:8001/health (model_loaded: true)`);
        }
        return yoloHealthStatus;
      } catch (_) {}
    }

    yoloHealthStatus = {
      status: isStartingYolo ? 'starting' : 'critical',
      online: false,
      modelLoaded: false,
      url: baseUrl,
      lastChecked: new Date().toISOString(),
      error: primaryErr.message,
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

    // If offline and using local daemon, attempt auto-restart with a 60s cooldown
    if (!health.online && !getEffectiveYoloUrl().includes('https://')) {
      const now = Date.now();
      if (now - lastRestartAttempt > 60000 && !isStartingYolo) {
        lastRestartAttempt = now;
        console.warn('[YOLO] Periodic check detected daemon offline. Attempting auto-restart...');
        startLocalYoloService();
      }
    }
  }, 30000);
};

/**
 * Asynchronously spawn the local YOLO microservice daemon
 */
const startLocalYoloService = () => {
  if (yoloProcess || isStartingYolo) return;
  isStartingYolo = true;
  yoloHealthStatus.status = 'starting';
  yoloHealthStatus.error = 'Daemon is starting...';

  const yoloDir = path.resolve(__dirname, '../../../yolo-service');
  const venvPythonWin = path.resolve(yoloDir, '.venv', 'Scripts', 'python.exe');
  const venvPythonLinux = path.resolve(yoloDir, '.venv', 'bin', 'python');

  const pythonCmd = fs.existsSync(venvPythonWin)
    ? venvPythonWin
    : (fs.existsSync(venvPythonLinux)
      ? venvPythonLinux
      : (process.platform === 'win32' ? 'python' : 'python3'));

  console.log(`[YOLO] Attempting to auto-start YOLO microservice daemon using: ${pythonCmd}`);
  try {
    const yoloEnv = { ...process.env, PORT: '8001', YOLO_PORT: '8001' };
    yoloProcess = spawn(pythonCmd, ['app.py'], {
      cwd: yoloDir,
      env: yoloEnv,
      stdio: 'pipe',
      detached: false,
    });

    yoloProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[YOLO-Service] ${msg}`);
    });

    yoloProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.debug(`[YOLO-Service] ${msg}`);
    });

    yoloProcess.on('exit', (code) => {
      console.warn(`[YOLO-Service] Process exited with code ${code}`);
      yoloProcess = null;
      isStartingYolo = false;
      yoloHealthStatus = {
        status: 'critical',
        online: false,
        modelLoaded: false,
        url: getEffectiveYoloUrl(),
        lastChecked: new Date().toISOString(),
        error: `Process exited with code ${code}`,
      };
    });

    yoloProcess.on('error', (err) => {
      console.error(`[CRITICAL] [YOLO] Failed to spawn YOLO service: ${err.message}`);
      yoloProcess = null;
      isStartingYolo = false;
      yoloHealthStatus = {
        status: 'critical',
        online: false,
        modelLoaded: false,
        url: getEffectiveYoloUrl(),
        lastChecked: new Date().toISOString(),
        error: err.message,
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
    isStartingYolo = false;
    yoloHealthStatus = {
      status: 'critical',
      online: false,
      modelLoaded: false,
      url: getEffectiveYoloUrl(),
      lastChecked: new Date().toISOString(),
      error: err.message,
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
  const baseUrl = getEffectiveYoloUrl();

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
        timeout: 5000,
      });
    } catch (netErr) {
      // If primary URL failed and wasn't localhost, try localhost:8001 fallback
      if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
        console.debug('[YOLO] Primary URL failed (' + netErr.message + '), trying localhost:8001 fallback...');
        const fallbackForm = createForm();
        try {
          response = await fetch('http://localhost:8001/detect', {
            method: 'POST',
            body: fallbackForm,
            headers: fallbackForm.getHeaders(),
            timeout: 5000,
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
      console.error('[YOLO] Service response not OK:', response ? response.status : 'no response');
      return { phoneDetected: false };
    }

    const data = await response.json();
    if (data.phoneDetected) {
      console.warn(`[YOLO] 📱 Phone detected! Confidence: ${data.confidence}. Detections:`, data.detections);
    } else {
      console.log(`[YOLO] Frame analyzed: no phone detected`);
    }

    return {
      phoneDetected: data.phoneDetected === true,
      confidence: data.confidence,
      detections: data.detections || [],
    };
  } catch (err) {
    console.error('[YOLO] Detection error:', err.message);
    return { phoneDetected: false };
  }
};

module.exports = {
  detectPhone,
  startLocalYoloService,
  checkYoloHealth,
  getYoloHealthStatus,
};

