// Node passes the application directory as one argument, including spaces.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const executable = require('electron');
if (!fs.existsSync(executable)) {
  console.error('Munka runtime is missing. Install dependencies before launching.');
  process.exitCode = 1;
} else {
  if (process.platform === 'darwin') require('./build-mac-overlay.cjs').buildMacOverlay();
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [root], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error('Munka could not start: ' + error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (code !== 0 || signal) console.error('Munka stopped before a normal exit. Check the startup log for details.');
    process.exitCode = code === 0 && !signal ? 0 : 1;
  });
}
