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

// Detect python & pip executables
let pipCmd = null;
if (canRunCommand('pip3')) {
  pipCmd = 'pip3';
} else if (canRunCommand('pip')) {
  pipCmd = 'pip';
} else if (canRunCommand('python3 -m pip')) {
  pipCmd = 'python3 -m pip';
} else if (canRunCommand('python -m pip')) {
  pipCmd = 'python -m pip';
}

if (!pipCmd) {
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

console.log(`[YOLO-Build] Using pip installer: "${pipCmd}"`);
console.log('[YOLO-Build] Installing CPU-optimized PyTorch and requirements...');

try {
  // 1. Install CPU-only PyTorch first to prevent downloading 2.5GB CUDA GPU wheels on Render
  console.log('[YOLO-Build] Step 1/2: Installing PyTorch CPU wheel...');
  execSync(
    `${pipCmd} install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu`,
    { stdio: 'inherit' }
  );

  // 2. Install remaining requirements (fastapi, uvicorn, ultralytics, pillow, numpy, python-multipart)
  console.log('[YOLO-Build] Step 2/2: Installing YOLO service requirements...');
  execSync(`${pipCmd} install --no-cache-dir -r "${reqFile}"`, { stdio: 'inherit' });

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
