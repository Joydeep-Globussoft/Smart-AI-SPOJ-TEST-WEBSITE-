// Malpractice Service -- YOLO phone detection proxy & daemon manager
// BUG-108: Non-blocking health checks, continuous periodic monitoring, and self-healing.
// BUG-110: YOLO_ENABLED kill switch -- on Render the daemon is OFF unless YOLO_ENABLED=true.
//          Locally (no RENDER env var) the default stays ON as before.
const fetch = require('node-fetch');
const FormData = require('form-data');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// -- BUG-110: YOLO_ENABLED kill switch -----------------------------------------
const IS_RENDER = Boolean(process.env.RENDER);
const YOLO_ENABLED =
  process.env.YOLO_ENABLED === 'true' ||
  (!IS_RENDER && process.env.YOLO_ENABLED !== 'false');

// -- BUG-110: Memory logging helper --------------------------------------------
const logNodeMemory = (label) => {
  const mem = process.memoryUsage();
  console.log(
    `[Memory] ${label || 'periodic'} | Node RSS: ${Math.round(mem.rss / 1024 / 1024)}MB` +
    ` | heapUsed: ${Math.round(mem.heapUsed / 1024 / 1024)}MB` +
    ` | heapTotal: ${Math.round(mem.heapTotal / 1024 / 1024)}MB` +
    ` | external: ${Math.round(mem.external / 1024 / 1024)}MB`
  );
};

// Log once at startup
logNodeMemory('startup');

// Log every 5 minutes
setInterval(() => { logNodeMemory('periodic-5min'); }, 5 * 60 * 1000);

// -- Disabled status template --------------------------------------------------
const DISABLED_STATUS = {
  status: 'disabled',
  online: false,
  modelLoaded: false,
  permanentFailure: false,
  restartAttempts: 0,
  maxRestartAttempts: 0,
  url: null,
  lastChecked: null,
  error: null,
  disabled: true,
  recentLogs: [],
};

if (!YOLO_ENABLED) {
  console.log(
    '[YOLO] WARNING: YOLO phone detection is DISABLED.' +
    (IS_RENDER
      ? ' Running on Render without YOLO_ENABLED=true -- daemon will NOT spawn (OOM prevention).'
      : ' YOLO_ENABLED=false set locally.') +
    ' Set YOLO_ENABLED=true in Render Environment to re-enable.'
  );

  module.exports = {
    detectPhone: async (_imageBuffer) => ({ phoneDetected: false, disabled: true }),
    startLocalYoloService: () => {},
    checkYoloHealth: async () => Object.assign({}, DISABLED_STATUS),
    getYoloHealthStatus: () => Object.assign({}, DISABLED_STATUS),
    manualResetYoloService: () => Object.assign({}, DISABLED_STATUS, {
      error: 'YOLO is disabled on this instance. Set YOLO_ENABLED=true to enable.'
    }),
    YOLO_ENABLED: false,
  };
} else {
  // ============================================================================
  // YOLO ENABLED -- everything below only runs when YOLO_ENABLED is true
  // ============================================================================

  let yoloProcess = null;
  let isStartingYolo = false;
  let periodicHealthTimer = null;
  let lastRestartAttempt = 0;

  const MAX_RESTART_ATTEMPTS = 5;
  let restartAttemptsCount = 0;
  let isPermanentFailure = false;

  let yoloHealthStatus = {
    status: 'starting',
    online: false,
    modelLoaded: false,
    permanentFailure: false,
    restartAttempts: 0,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    url: null,
    lastChecked: null,
    error: null,
  };

  let recentYoloLogs = [];

  const getEffectiveYoloUrl = () =>
    (process.env.YOLO_SERVICE_URL || 'http://localhost:8001').replace(/\/detect\/?$/, '');

  const getYoloHealthStatus = () => ({
    ...yoloHealthStatus,
    restartAttempts: restartAttemptsCount,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    recentLogs: [...recentYoloLogs],
  });

  const getBackoffDelayMs = (attempts) =>
    Math.min(300000, 30000 * Math.pow(2, Math.max(0, attempts - 1)));

  const recordYoloLog = (prefix, msg) => {
    if (!msg) return;
    recentYoloLogs.push(`[${new Date().toISOString()}] ${prefix} ${msg}`);
    if (recentYoloLogs.length > 25) recentYoloLogs.shift();
  };

  const checkYoloHealth = async () => {
    const baseUrl = getEffectiveYoloUrl();
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
      restartAttemptsCount = 0;
      isPermanentFailure = false;
      if (previousStatus !== 'online' && yoloHealthStatus.status === 'online') {
        console.log(`[YOLO] YOLO phone detection service is ONLINE at ${baseUrl}/health`);
      }
      return yoloHealthStatus;
    } catch (primaryErr) {
      if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
        try {
          yoloHealthStatus = await tryPing('http://localhost:8001');
          restartAttemptsCount = 0;
          isPermanentFailure = false;
          if (previousStatus !== 'online' && yoloHealthStatus.status === 'online') {
            console.log('[YOLO] YOLO phone detection service is ONLINE at http://localhost:8001/health');
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
          ? `PERMANENT FAILURE: Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded.`
          : primaryErr.message,
      };
      return yoloHealthStatus;
    }
  };

  // Forward reference needed for circular dependency between startLocalYoloService & startPeriodicHealthMonitor
  let startLocalYoloService;

  const startPeriodicHealthMonitor = () => {
    if (periodicHealthTimer) return;
    periodicHealthTimer = setInterval(async () => {
      const health = await checkYoloHealth();

      // BUG-110: Log Python process RSS for memory visibility in Render Logs
      if (yoloProcess && yoloProcess.pid) {
        try {
          const statusText = fs.readFileSync(`/proc/${yoloProcess.pid}/status`, 'utf8');
          const vmRssLine = statusText.split('\n').find(l => l.startsWith('VmRSS:'));
          if (vmRssLine) {
            const kbMatch = vmRssLine.match(/(\d+)/);
            if (kbMatch) {
              console.log(`[Memory] YOLO Python process (pid ${yoloProcess.pid}) RSS: ${Math.round(parseInt(kbMatch[1]) / 1024)}MB`);
            }
          }
        } catch (_) {}
      }

      if (!health.online && !getEffectiveYoloUrl().includes('https://') && !isPermanentFailure) {
        const now = Date.now();
        const requiredDelay = getBackoffDelayMs(restartAttemptsCount);
        if (now - lastRestartAttempt >= requiredDelay && !isStartingYolo) {
          if (restartAttemptsCount >= MAX_RESTART_ATTEMPTS) {
            isPermanentFailure = true;
            console.error(
              `\n[CRITICAL FATAL] [YOLO] Daemon reached maximum auto-restart attempts (${MAX_RESTART_ATTEMPTS}/${MAX_RESTART_ATTEMPTS}).` +
              `\n   Halting automatic retry loop to prevent resource thrashing.` +
              `\n   PERMANENT FAILURE state. Manual Admin intervention required.\n`
            );
            yoloHealthStatus.status = 'critical';
            yoloHealthStatus.permanentFailure = true;
            yoloHealthStatus.error = `PERMANENT FAILURE: Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded.`;
            return;
          }
          restartAttemptsCount++;
          lastRestartAttempt = now;
          console.warn(`[YOLO] Auto-restart attempt ${restartAttemptsCount}/${MAX_RESTART_ATTEMPTS}...`);
          startLocalYoloService();
        }
      }
    }, 30000);
  };

  const manualResetYoloService = () => {
    console.log('[YOLO] Manual reset triggered by Admin. Resetting restart counter...');
    if (yoloProcess) {
      try { yoloProcess.kill('SIGTERM'); } catch (_) {}
      yoloProcess = null;
    }
    isStartingYolo = false;
    restartAttemptsCount = 0;
    isPermanentFailure = false;
    lastRestartAttempt = 0;
    yoloHealthStatus.status = 'starting';
    yoloHealthStatus.permanentFailure = false;
    yoloHealthStatus.error = 'Daemon is restarting...';
    startLocalYoloService();
    return getYoloHealthStatus();
  };

  startLocalYoloService = () => {
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

    console.log(`[YOLO] Starting YOLO daemon: ${pythonCmd}`);
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
        if (msg) { console.log(`[YOLO-Service] ${msg}`); recordYoloLog('[stdout]', msg); }
      });

      yoloProcess.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) { console.error(`[YOLO-Service stderr] ${msg}`); recordYoloLog('[stderr]', msg); }
      });

      yoloProcess.on('exit', (code) => {
        console.warn(`[YOLO-Service] Process exited with code ${code}`);
        recordYoloLog('[HOST]', `Process exited with code ${code}`);
        yoloProcess = null;
        isStartingYolo = false;
        const lastErr = recentYoloLogs.slice(-3).map(l => l.replace(/^\[.*?\]\s*/, '')).join(' | ');
        yoloHealthStatus = {
          status: 'critical', online: false, modelLoaded: false,
          url: getEffectiveYoloUrl(), lastChecked: new Date().toISOString(),
          error: `Process exited with code ${code}${lastErr ? `: ${lastErr}` : ''}`,
          recentLogs: [...recentYoloLogs],
        };
      });

      yoloProcess.on('error', (err) => {
        console.error(`[CRITICAL] [YOLO] Failed to spawn: ${err.message}`);
        recordYoloLog('[HOST]', `Spawn error: ${err.message}`);
        yoloProcess = null; isStartingYolo = false;
        yoloHealthStatus = {
          status: 'critical', online: false, modelLoaded: false,
          url: getEffectiveYoloUrl(), lastChecked: new Date().toISOString(),
          error: err.message, recentLogs: [...recentYoloLogs],
        };
      });

      const startupDelays = [2000, 4000, 7000, 11000, 15000];
      startupDelays.forEach((delay, idx) => {
        setTimeout(async () => {
          if (yoloHealthStatus.status === 'online') return;
          const health = await checkYoloHealth();
          if (health.online && health.modelLoaded) {
            isStartingYolo = false;
          } else if (idx === startupDelays.length - 1 && !health.online) {
            isStartingYolo = false;
            console.error(`[CRITICAL] [YOLO] Failed to respond to startup health check at ${getEffectiveYoloUrl()}/health`);
          }
        }, delay);
      });

      startPeriodicHealthMonitor();
    } catch (err) {
      console.error('[CRITICAL] [YOLO] Error launching YOLO process:', err);
      recordYoloLog('[HOST]', `Launch exception: ${err.message}`);
      isStartingYolo = false;
      yoloHealthStatus = {
        status: 'critical', online: false, modelLoaded: false,
        url: getEffectiveYoloUrl(), lastChecked: new Date().toISOString(),
        error: err.message, recentLogs: [...recentYoloLogs],
      };
    }
  };

  process.on('exit', () => {
    if (yoloProcess) yoloProcess.kill();
    if (periodicHealthTimer) clearInterval(periodicHealthTimer);
  });

  const detectPhone = async (imageBuffer) => {
    const isLocalRunning = yoloProcess !== null || yoloHealthStatus.online;
    const baseUrl = isLocalRunning ? 'http://localhost:8001' : getEffectiveYoloUrl();

    const createForm = () => {
      const form = new FormData();
      form.append('image', imageBuffer, { filename: 'frame.jpg', contentType: 'image/jpeg' });
      return form;
    };

    try {
      let response;
      const primaryForm = createForm();
      try {
        response = await fetch(`${baseUrl}/detect`, {
          method: 'POST', body: primaryForm, headers: primaryForm.getHeaders(), timeout: 30000,
        });
      } catch (netErr) {
        if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
          console.debug('[YOLO] Primary URL failed, trying localhost:8001 fallback...');
          const fallbackForm = createForm();
          try {
            response = await fetch('http://localhost:8001/detect', {
              method: 'POST', body: fallbackForm, headers: fallbackForm.getHeaders(), timeout: 30000,
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
        console.warn(`[YOLO] Phone detected! Confidence: ${data.confidence}.`);
      } else {
        console.log('[YOLO] Frame analyzed: no phone detected');
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
    YOLO_ENABLED: true,
  };
}
