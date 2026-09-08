const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("munka", {
  load: () => ipcRenderer.invoke("load"),
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
