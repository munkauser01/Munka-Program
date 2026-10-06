const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("munka", {
  // Sandboxed preloads cannot require local modules. Keep this small mirror in
  // parity with platform-policy.cjs (covered by the platform beta test).
  capabilities: { platform: process.platform, desktop: true, overlays: process.platform === 'win32', wallpaper: process.platform === 'win32', notifications: true, syllabus: true, connections: true, ai: true },
  account: async (action, data) => {const r=await ipcRenderer.invoke('account',action,data);if(!r.ok)throw Error(r.error);return r.value;},
  cloud: async (action,data,user) => {const r=await ipcRenderer.invoke('cloud',action,data,user);if(!r.ok)throw Object.assign(Error(r.error),{code:r.code});return r.value;},
  localPlanner: () => ipcRenderer.invoke('local-planner'),
  onAccessChange: callback => { const listener = (_, value) => callback(value); ipcRenderer.on('access-change', listener); return () => ipcRenderer.removeListener('access-change', listener); },
  calendars: async (action,data) => {const r=await ipcRenderer.invoke('calendars',action,data);if(!r.ok)throw Error(r.error);return r.value;},
  syllabus: async (action,data) => {const r=await ipcRenderer.invoke('syllabus',action,data);if(!r.ok)throw Error(r.error);return r.value;},
  load: () => ipcRenderer.invoke("load"),
  version: () => ipcRenderer.invoke("version"),
  ready: () => ipcRenderer.invoke("ready"),
  onOpenTask: (callback) => {
    const listener = (_, id) => callback(id);
    ipcRenderer.on("open-task", listener);
    return () => ipcRenderer.removeListener("open-task", listener);
  },
  ai: async (action, data) => {
    const result = await ipcRenderer.invoke("ai", action, data);
    if (!result.ok) throw Error(result.error);
    return result.value;
  },
  save: (state, revision, accountId) => ipcRenderer.invoke("save", state, revision, accountId),
  exportFile: (text, extension) =>
    ipcRenderer.invoke("export", text, extension),
  importFile: () => ipcRenderer.invoke("import"),
  desktop: (action, value) => ipcRenderer.invoke("desktop", action, value),
  onChange: (callback) => {
    const listener = (_, s) => callback(s);
    ipcRenderer.on("change", listener);
    return () => ipcRenderer.removeListener("change", listener);
  },
});
