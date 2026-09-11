const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("munka", {
  load: () => ipcRenderer.invoke("load"),
  version: () => ipcRenderer.invoke("version"),
  ready: () => ipcRenderer.invoke("ready"),
  onOpenTask: (callback) => {
    const listener = (_, id) => callback(id);
    ipcRenderer.on("open-task", listener);
    return () => ipcRenderer.removeListener("open-task", listener);
  },
  session: (action, data) => ipcRenderer.invoke("session", action, data),
  save: (state, revision) => ipcRenderer.invoke("save", state, revision),
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

