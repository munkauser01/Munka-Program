const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Node-API keeps this small addon compatible with Node and Electron without a
// runtime-dependent node-gyp rebuild. Only macOS developers/CI need clang.
function buildMacOverlay({ arch = process.arch } = {}) {
  if (process.platform !== 'darwin') throw Error('Build the native Mac overlay on macOS or the Mac CI runner.');
  if (!['arm64', 'x64'].includes(arch)) throw Error('Choose arm64 (Apple Silicon) or x64 (Intel).');
  if (arch !== process.arch) throw Error('Build the Mac overlay on a runner matching its target architecture.');
  const root = path.resolve(__dirname, '..');
  const native = path.join(root, 'electron', 'native');
  const source = path.join(native, 'mac-overlay.mm');
  const binary = path.join(native, `mac-overlay-${arch}.node`);
  const work = path.join(root, 'work');
  let include;
  try { include = require('node-api-headers').include_dir; }
  catch { throw Error('Install the locked development dependencies before building the Mac overlay.'); }
  if (typeof include !== 'string' || !fs.existsSync(path.join(include, 'node_api.h'))) {
    throw Error('The installed Node-API headers are missing. Reinstall the locked development dependencies.');
  }
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(native, { recursive: true });
  const stage = fs.mkdtempSync(path.join(work, 'mac-overlay-'));
  const temporary = path.join(stage, path.basename(binary));
  try {
    execFileSync('xcrun', [
      '--sdk', 'macosx', 'clang++', '-std=c++17', '-fobjc-arc',
      '-fvisibility=hidden', '-O2', '-Wall', '-Wextra',
      '-bundle', '-undefined', 'dynamic_lookup',
      '-arch', arch === 'x64' ? 'x86_64' : 'arm64', '-mmacosx-version-min=11.0',
      '-DNAPI_VERSION=8', '-DNODE_GYP_MODULE_NAME=mac_overlay',
      '-I', include, '-framework', 'AppKit', '-framework', 'CoreGraphics',
      source, '-o', temporary,
    ], { cwd: root, stdio: 'inherit' });
    if (!fs.statSync(temporary).size) throw Error('The Mac native overlay compiler produced an empty module.');
    fs.copyFileSync(temporary, binary);
    return binary;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try { console.log('Built Mac overlay:', buildMacOverlay({ arch: process.argv[2] || process.arch })); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildMacOverlay };
