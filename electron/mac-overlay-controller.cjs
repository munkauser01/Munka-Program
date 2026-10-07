const { loadMacOverlay } = require('./mac-overlay-native.cjs');

// Work only with live BrowserWindows owned by this process. AppKit work stays
// on Electron's main thread; no helper process or desktop permissions are used.
function createMacOverlayController({ loadBinding = loadMacOverlay, onError = () => {}, onReady = () => {} } = {}) {
  let binding, wanted = [], windows = [], stopped = false, ready = false;
  function apply() {
    if (stopped) return;
    if (!wanted.length) { windows = []; ready = false; return; }
    try {
      binding ||= loadBinding();
      const placed = [];
      for (const { win, surface, layer } of wanted) {
        if (win.isDestroyed()) continue;
        const handle = win.getNativeWindowHandle();
        binding.apply(handle, layer);
        placed.push({ surface, layer, ...binding.inspect(handle),
          visible: win.isVisible(), focusable: win.isFocusable() });
      }
      windows = placed;
      const becameReady = !ready;
      ready = placed.length > 0;
      if (ready && becameReady) onReady();
    } catch (error) {
      ready = false; windows = [];
      onError(Error('Mac desktop placement is unavailable. Use Recover widgets in the Munka menu bar.'));
    }
  }
  return {
    update(next) { if (stopped) return; wanted = next; apply(); },
    recover() { if (stopped) return; binding = undefined; ready = false; apply(); },
    get ready() { return ready; },
    get windows() {
      if (!binding || stopped || !ready) return [];
      return wanted.filter(({ win }) => !win.isDestroyed()).map(({ win, surface, layer }) => {
        try { return { surface, layer, ...binding.inspect(win.getNativeWindowHandle()),
          visible: win.isVisible(), focusable: win.isFocusable() }; }
        catch { return { surface, layer, error: 'Window placement is unavailable.' }; }
      });
    },
    stop() { stopped = true; wanted = []; windows = []; ready = false; binding = undefined; },
  };
}

module.exports = { createMacOverlayController };
