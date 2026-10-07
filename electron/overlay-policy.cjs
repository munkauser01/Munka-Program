const EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

function overlayLayer(preferences = {}) {
  if (['desktop', 'topmost'].includes(preferences.widgetLayer)) return preferences.widgetLayer;
  return preferences.alwaysOnTop ? 'topmost' : 'desktop';
}

function overlayWindowOptions(bounds, title) {
  return {
    ...bounds, title,
    minWidth: 290, minHeight: 260,
    frame: false, thickFrame: false, transparent: true,
    backgroundColor: '#00000000', hasShadow: false,
    skipTaskbar: true, show: false,
    movable: true,
    // Electron documents native resizing as unsupported for transparent windows.
    // Edge handles use setBounds instead, preserving the transparent surface.
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
  };
}

function resizedOverlay(start, cursor, edge, area) {
  if (!EDGES.has(edge)) throw Error('Choose a valid resize edge.');
  if (![start?.cursor?.x, start?.cursor?.y, cursor?.x, cursor?.y,
    start?.bounds?.x, start?.bounds?.y, start?.bounds?.width, start?.bounds?.height,
    area?.x, area?.y, area?.width, area?.height].every(Number.isFinite)) throw Error('Invalid resize coordinates.');
  const b = start.bounds;
  const dx = cursor.x - start.cursor.x, dy = cursor.y - start.cursor.y;
  let left = b.x, top = b.y, right = b.x + b.width, bottom = b.y + b.height;
  const minWidth = Math.min(290, area.width), minHeight = Math.min(260, area.height);
  if (edge.includes('w')) left = Math.max(area.x, Math.min(b.x + dx, right - minWidth));
  if (edge.includes('e')) right = Math.min(area.x + area.width, Math.max(right + dx, left + minWidth));
  if (edge.includes('n')) top = Math.max(area.y, Math.min(b.y + dy, bottom - minHeight));
  if (edge.includes('s')) bottom = Math.min(area.y + area.height, Math.max(bottom + dy, top + minHeight));
  return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
}

function stayInBackground(preferences = {}) {
  return preferences.background === true || preferences.widget === true || preferences.widgetProjects === true;
}

module.exports = { EDGES, overlayLayer, overlayWindowOptions, resizedOverlay, stayInBackground };
