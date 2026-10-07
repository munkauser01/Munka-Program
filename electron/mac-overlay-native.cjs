const fs = require('node:fs');
const path = require('node:path');

// A build-time Node-API addon supplies AppKit window levels without requiring
// Xcode, a shell helper, or any native compilation on an installed user's Mac.
function loadMacOverlay({ platform = process.platform, arch = process.arch, loadBinding = require } = {}) {
  if (platform !== 'darwin') throw Error('Native Mac widget placement requires macOS.');
  if (!['arm64', 'x64'].includes(arch)) throw Error('Unsupported Mac widget architecture.');
  const binary = path.join(__dirname, 'native', `mac-overlay-${arch}.node`);
  // Electron resolves unpacked native addons itself. The explicit path also
  // supports runtimes/tools that do not apply Electron's ASAR require patch.
  const unpacked = binary.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
  const filename = unpacked !== binary && fs.existsSync(unpacked) ? unpacked : binary;
  let binding;
  try { binding = loadBinding(filename); }
  catch (cause) {
    throw Error('Mac desktop placement is unavailable. Reinstall the Mac build or build its native overlay before launching from source.', { cause });
  }
  if (typeof binding?.apply !== 'function' || typeof binding?.inspect !== 'function') {
    throw Error('The Mac native overlay module is incompatible with this Munka build.');
  }
  return {
    apply(handle, layer) {
      if (!Buffer.isBuffer(handle) || handle.length !== 8) throw Error('Pass a live Mac widget native handle Buffer.');
      if (!['desktop', 'topmost'].includes(layer)) throw Error('Choose the desktop or topmost Mac widget layer.');
      return binding.apply(handle, layer);
    },
    inspect(handle) {
      if (!Buffer.isBuffer(handle) || handle.length !== 8) throw Error('Pass a live Mac widget native handle Buffer.');
      return binding.inspect(handle);
    },
  };
}

module.exports = { loadMacOverlay };
