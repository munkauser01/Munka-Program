// Pointer capture survives window resizing; keyboard controls use the same
// bounded desktop actions. No renderer-supplied absolute screen coordinates.
export function resizeHandles() {
  return ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(edge =>
    `<div class="widget-resize-handle edge-${edge}" data-resize-edge="${edge}" aria-hidden="true"></div>`).join('');
}

export function bindOverlayControls({ bridge, surface, onError }) {
  for (const handle of document.querySelectorAll('[data-resize-edge]')) {
    handle.onpointerdown = async event => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      let ready = false, ended = false, pending = false;
      const finish = () => {
        ended = true;
        handle.onpointermove = handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = null;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        if (ready) bridge.desktop('widget-resize-end', { surface }).catch(onError);
      };
      handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = finish;
      handle.onpointermove = async move => {
        if (!move.buttons) return finish();
        if (!ready || pending || ended) return;
        pending = true;
        try { await bridge.desktop('widget-resize-update', { surface }); }
        catch (error) { onError(error); finish(); }
        finally { pending = false; }
      };
      try {
        await bridge.desktop('widget-resize-start', { surface, edge: handle.dataset.resizeEdge });
        ready = true;
        if (ended) await bridge.desktop('widget-resize-end', { surface });
      } catch (error) { onError(error); finish(); }
    };
  }
  for (const button of document.querySelectorAll('[data-overlay-adjust]')) {
    button.onkeydown = event => {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : 10;
      bridge.desktop('widget-adjust', { surface, mode: button.dataset.overlayAdjust, dx: direction[0] * step, dy: direction[1] * step }).catch(onError);
    };
  }
  // Transparent unused space should not act like a large invisible window.
  let lastInteractive;
  document.onmousemove = event => {
    const interactive = Boolean(event.target.closest('.widget-layout, .widget-resize-handle, #toast.visible'));
    if (interactive === lastInteractive) return;
    lastInteractive = interactive;
    bridge.desktop('widget-hit-test', { surface, interactive }).catch(onError);
  };
}
