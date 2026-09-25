// install_python_deps.js — Production-Gated Python Dependency Installer
// Implements BUG-108: Ensures Render production builds fail loudly if pip fails,
// while allowing local developers without Python to install Node modules smoothly with a clear warning.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isProduction =
  process.env.RENDER === 'true' ||
  process.env.RENDER === '1' ||
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RENDER_SERVICE_ID);

console.log(`[YOLO-Build] Checking Python environment for YOLO microservice (isProduction: ${isProduction})...`);

const yoloDir = path.resolve(__dirname, '../../../yolo-service');
const reqFile = path.resolve(yoloDir, 'requirements.txt');

if (!fs.existsSync(reqFile)) {
  const msg = `[YOLO-Build] requirements.txt not found at: ${reqFile}`;
  if (isProduction) {
    console.error(`[BUILD FATAL] ${msg}`);
    process.exit(1);
  } else {
    console.warn(`[DEV NOTICE] ${msg}. Skipping.`);
    process.exit(0);
  }
}

// Helper to check if a command is runnable
function canRunCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

// Detect python executable
let pythonCmd = null;
if (canRunCommand('python3')) {
  pythonCmd = 'python3';
} else if (canRunCommand('python')) {
  pythonCmd = 'python';
}

if (!pythonCmd) {
  const noPythonMsg =
    'Python/pip is not installed or not in system PATH. YOLO microservice dependencies cannot be installed.';
  if (isProduction) {
    console.error(`[BUILD FATAL] ${noPythonMsg} In production (Render), Python is required for AI phone detection.`);
    process.exit(1);
  } else {
    console.warn(
      `\n⚠️  [DEV NOTICE] ${noPythonMsg}\n   Local development can continue, but real-time AI phone detection will be inactive locally.\n`
    );
    process.exit(0);
  }
}

// Create virtual environment in yoloDir/.venv if possible
const venvDir = path.resolve(yoloDir, '.venv');
const venvPipLinux = path.resolve(venvDir, 'bin', 'pip');
const venvPipWin = path.resolve(venvDir, 'Scripts', 'pip.exe');
const venvPip = process.platform === 'win32' ? venvPipWin : venvPipLinux;

if (!fs.existsSync(venvPip)) {
  console.log(`[YOLO-Build] Creating virtual environment at: ${venvDir}...`);
  try {
    execSync(`${pythonCmd} -m venv "${venvDir}"`, { stdio: 'inherit' });
  } catch (venvErr) {
    console.warn(`[YOLO-Build] Notice: venv module not available or failed (${venvErr.message}). Using system pip.`);
  }
}

let pipExec = null;
let extraFlags = '';
if (fs.existsSync(venvPip)) {
  pipExec = `"${venvPip}"`;
  console.log(`[YOLO-Build] Using isolated virtual environment pip: ${pipExec}`);
} else {
  if (canRunCommand('pip3')) pipExec = 'pip3';
  else if (canRunCommand('pip')) pipExec = 'pip';
  else pipExec = `${pythonCmd} -m pip`;

  // Check if --break-system-packages is supported for modern Debian/Ubuntu
  try {
    const helpOutput = execSync(`${pipExec} help install`, { stdio: 'pipe' }).toString();
    if (helpOutput.includes('--break-system-packages')) {
      extraFlags = ' --break-system-packages';
    }
  } catch (_) {}
  console.log(`[YOLO-Build] Using system pip: "${pipExec}" with flags: "${extraFlags}"`);
}

console.log('[YOLO-Build] Installing CPU-optimized PyTorch and requirements...');

try {
  // 1. Install CPU-only PyTorch first to prevent downloading 2.5GB CUDA GPU wheels on Render
  console.log('[YOLO-Build] Step 1/2: Installing PyTorch CPU wheel...');
  execSync(
    `${pipExec} install --no-cache-dir${extraFlags} torch torchvision --index-url https://download.pytorch.org/whl/cpu`,
    { stdio: 'inherit' }
  );

  // 2. Install remaining requirements (fastapi, uvicorn, ultralytics, pillow, numpy, python-multipart)
  console.log('[YOLO-Build] Step 2/2: Installing YOLO service requirements...');
  execSync(`${pipExec} install --no-cache-dir${extraFlags} -r "${reqFile}"`, { stdio: 'inherit' });

  console.log('✅ [YOLO-Build] All Python YOLO microservice dependencies installed successfully!\n');
  process.exit(0);
} catch (err) {
  if (isProduction) {
    console.error('\n❌ [BUILD FATAL] Failed to install Python dependencies for YOLO microservice in production:');
    console.error(err.message);
    console.error('Deployment aborted to prevent silent proctoring failures in production.\n');
    process.exit(1);
  } else {
    console.warn(
      `\n⚠️  [DEV NOTICE] Python dependencies installation encountered an error:\n   ${err.message}\n   Continuing local development setup (AI phone detection may be offline).\n`
    );
    process.exit(0);
  }
}
