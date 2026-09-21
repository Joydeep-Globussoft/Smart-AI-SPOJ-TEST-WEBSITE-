// Malpractice Service — YOLO phone detection proxy
// Calls the Python YOLO microservice (yolo-service/) for server-side phone detection
// Configured via YOLO_SERVICE_URL env var
const fetch = require('node-fetch');
const FormData = require('form-data');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let yoloProcess = null;
let isStartingYolo = false;

const startLocalYoloService = () => {
  if (yoloProcess || isStartingYolo) return;
  isStartingYolo = true;

  const yoloDir = path.resolve(__dirname, '../../../yolo-service');
  const venvPython = path.resolve(yoloDir, '.venv', 'Scripts', 'python.exe');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';

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
    });

    yoloProcess.on('error', (err) => {
      console.error(`[YOLO] Failed to spawn YOLO service: ${err.message}`);
      yoloProcess = null;
      isStartingYolo = false;
    });
  } catch (err) {
    console.error(`[YOLO] Error launching YOLO process:`, err);
    isStartingYolo = false;
  }
};

// Auto-cleanup on node exit
process.on('exit', () => { if (yoloProcess) yoloProcess.kill(); });

/**
 * Send a webcam frame to the YOLO service for phone detection.
 * @param {Buffer} imageBuffer - Raw image buffer from candidate webcam
 * @returns {{ phoneDetected: boolean, confidence?: number, detections?: Array }}
 */
const detectPhone = async (imageBuffer) => {
  let baseUrl = (process.env.YOLO_SERVICE_URL || 'http://localhost:8001').replace(/\/detect\/?$/, '');

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

module.exports = { detectPhone, startLocalYoloService };
