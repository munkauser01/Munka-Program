// Electron screen work areas and window bounds both use device-independent pixels.
function widgetBounds(bounds, displays, primary) {
  const valid = bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k]));
  const area = (valid && displays.find(d => bounds.x >= d.workArea.x && bounds.x < d.workArea.x + d.workArea.width && bounds.y >= d.workArea.y && bounds.y < d.workArea.y + d.workArea.height) || primary).workArea;
  const width = Math.min(area.width, Math.max(290, valid ? bounds.width : 360));
  const height = Math.min(area.height, Math.max(260, valid ? bounds.height : 460));
  return {
    x: Math.round(Math.max(area.x, Math.min(valid ? bounds.x : area.x + 30, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(valid ? bounds.y : area.y + 30, area.y + area.height - height))),
    width: Math.round(width), height: Math.round(height),
  };
}
module.exports = { widgetBounds };
