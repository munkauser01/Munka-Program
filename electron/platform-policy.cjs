function platformPolicy(platform = process.platform) {
  const windows = platform === 'win32';
  const desktop = ['win32', 'darwin', 'linux'].includes(platform);
  return { platform, desktop, overlays: windows, wallpaper: windows,
    notifications: desktop, syllabus: desktop, connections: desktop, ai: desktop,
    storageLabel: desktop ? 'this computer' : 'this device', shortcut: platform === 'darwin' ? '⌘ K' : 'Ctrl K' };
}
module.exports = { platformPolicy };
