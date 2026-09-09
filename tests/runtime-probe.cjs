// Minimal sandboxed runtime probe, independent of Munka's code and personal data.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
app.setPath("userData", path.resolve("work/runtime-probe-" + Date.now()));
const report = (event, detail) =>
  console.log(JSON.stringify({ event, detail }));
report("main-start", process.versions);
app.on("child-process-gone", (_event, details) =>
  report("child-process-gone", details),
);
app
  .whenReady()
  .then(async () => {
    report("ready");
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window.webContents.on("render-process-gone", (_event, details) =>
      report("renderer-gone", details),
    );
    await window.loadURL(
      "data:text/html,<title>Munka runtime check</title><p>Runtime ready</p>",
    );
    const result = await window.webContents.executeJavaScript(
      "document.body.innerText",
    );
    report("renderer-ready", result);
    app.exit(result === "Runtime ready" ? 0 : 1);
  })
  .catch((error) => {
    report("error", error.stack);
    app.exit(1);
  });
setTimeout(() => {
  report("timeout");
  app.exit(2);
}, 15000).unref();
