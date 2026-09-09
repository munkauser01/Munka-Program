const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  Notification,
  screen,
  nativeImage,
  safeStorage,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const root = path.join(__dirname, "..");
let main,
  widget,
  tray,
  state,
  domain,
  quitting = false,
  store,
  writeQueue = Promise.resolve();
let lastTick = Date.now(),
  wallpaperTimer,
  wallpaperBusy = false;
if (process.env.MUNKA_TEST_DATA)
  app.setPath("userData", process.env.MUNKA_TEST_DATA);
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else
  app.on("second-instance", () => {
    if (app.isReady() && state) showMain();
  });
function startupLog(event, details = {}) {
  // Runtime status only: never record task content, tokens, or launch arguments.
  try {
    const folder = app.getPath("userData");
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "startup.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024)
      fs.renameSync(file, file + ".previous");
    fs.appendFileSync(
      file,
      JSON.stringify({ at: new Date().toISOString(), event, ...details }) +
        "\n",
    );
  } catch {
    /* Logging must not prevent startup. */
  }
}
app.on("child-process-gone", (_event, details) =>
  startupLog("child-process-gone", {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
  }),
);
app.setAppUserModelId("app.munka.planner");
const ps = (args) =>
  new Promise((resolve, reject) =>
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        app.isPackaged
          ? path.join(
              process.resourcesPath,
              "app.asar.unpacked",
              "electron",
              "wallpaper.ps1",
            )
          : path.join(__dirname, "wallpaper.ps1"),
        ...args,
      ],
      { windowsHide: true },
      (e, out) =>
        e
          ? reject(
              Error(
                "Windows could not change the wallpaper. Your original background is preserved.",
              ),
            )
          : resolve(out.trim()),
    ),
  );
function persist() {
  const temp = store + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, store);
}
function broadcast() {
  for (const w of BrowserWindow.getAllWindows())
    if (!w.isDestroyed()) w.webContents.send("change", state);
}
function saveInternal() {
  state.revision++;
  persist();
  broadcast();
}
function options(extra = {}) {
  return {
    width: 1380,
    height: 900,
    minWidth: 760,
    minHeight: 580,
    backgroundColor: "#f8f8f3",
    icon: path.join(root, "assets", "munka.ico"),
    show: !process.env.MUNKA_TEST_DATA,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    ...extra,
  };
}
function secure(w) {
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(pathToFileURL(path.join(root, "src")).href))
      e.preventDefault();
  });
}
function showMain(id) {
  if (!main || main.isDestroyed()) createMain();
  main.show();
  main.focus();
  if (id) main.webContents.send("change", state);
}
function createMain() {
  main = new BrowserWindow(options());
  secure(main);
  main.webContents.on("render-process-gone", (_event, details) => {
    startupLog("main-renderer-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
    quitting = true;
    app.exit(1);
  });
  main.webContents.once("did-finish-load", () => startupLog("main-loaded"));
  main.loadFile(path.join(root, "src/index.html")).catch(() => {
    startupLog("main-load-failed");
    quitting = true;
    app.exit(1);
  });
  main.on("close", (e) => {
    if (!quitting && state.preferences.background) {
      e.preventDefault();
      main.hide();
    }
  });
}
function safeBounds(b) {
  const displays = screen.getAllDisplays();
  return b &&
    displays.some(
      (d) =>
        b.x + 80 > d.workArea.x &&
        b.x < d.workArea.x + d.workArea.width &&
        b.y + 40 > d.workArea.y &&
        b.y < d.workArea.y + d.workArea.height,
    )
    ? b
    : {
        ...screen.getPrimaryDisplay().workArea,
        x: screen.getPrimaryDisplay().workArea.x + 30,
        y: screen.getPrimaryDisplay().workArea.y + 30,
        width: 360,
        height: 460,
      };
}
function syncWidget() {
  if (!state.preferences.widget) {
    if (widget) {
      widget.destroy();
      widget = null;
    }
    return;
  }
  if (!widget) {
    widget = new BrowserWindow(
      options({
        ...safeBounds(state.preferences.widgetBounds),
        minWidth: 290,
        minHeight: 260,
        width: state.preferences.widgetBounds?.width || 360,
        height: state.preferences.widgetBounds?.height || 460,
        alwaysOnTop: !!state.preferences.alwaysOnTop,
        skipTaskbar: true,
      }),
    );
    secure(widget);
    widget.loadFile(path.join(root, "src/index.html"), {
      query: { widget: "1" },
    });
    widget.on("close", () => {
      widget = null;
      state.preferences.widget = false;
      saveInternal();
    });
    let timer;
    const remember = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (widget) {
          state.preferences.widgetBounds = widget.getBounds();
          saveInternal();
        }
      }, 500);
    };
    widget.on("moved", remember);
    widget.on("resized", remember);
  }
  widget.setAlwaysOnTop(!!state.preferences.alwaysOnTop);
}
function senderAllowed(e) {
  return (
    [main, widget].some(
      (w) => w && !w.isDestroyed() && w.webContents === e.sender,
    ) && e.senderFrame === e.sender.mainFrame
  );
}
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    if (!senderAllowed(e)) throw Error("Untrusted request");
    return fn(...args);
  });
}
async function updateWallpaper() {
  if (
    !state.preferences.wallpaper ||
    wallpaperBusy ||
    !state.preferences.wallpaperBackground
  )
    return;
  wallpaperBusy = true;
  try {
    const display =
      screen
        .getAllDisplays()
        .find((d) => String(d.id) === state.preferences.wallpaperDisplay) ||
      screen.getPrimaryDisplay();
    const w = new BrowserWindow({
      width: display.size.width,
      height: display.size.height,
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    try {
      await w.loadFile(path.join(root, "src/wallpaper.html"));
      const data = {
        background: fs
          .readFileSync(state.preferences.wallpaperBackground)
          .toString("base64"),
        mime:
          path.extname(state.preferences.wallpaperBackground).toLowerCase() ===
          ".png"
            ? "image/png"
            : "image/jpeg",
        tasks: state.tasks
          .filter((t) => t.status !== "Done")
          .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
          .slice(0, state.preferences.wallpaperCount || 5)
          .map((t) => ({
            title: state.preferences.privacy ? "Upcoming task" : t.title,
            date: t.date,
          })),
        position: state.preferences.wallpaperPosition,
      };
      await w.webContents.executeJavaScript(
        `window.paint(${JSON.stringify(data)})`,
      );
      const img = await w.webContents.capturePage();
      const out = path.join(app.getPath("userData"), "munka-wallpaper.png");
      fs.writeFileSync(out, img.toPNG());
      await ps([
        "-Action",
        "set",
        "-ImagePath",
        out,
        "-MonitorIndex",
        String(
          Math.max(
            0,
            screen.getAllDisplays().findIndex((d) => d.id === display.id),
          ),
        ),
      ]);
    } finally {
      w.destroy();
    }
  } catch (e) {
    state.logs.push({
      id: domain.uid(),
      at: new Date().toISOString(),
      message: e.message,
    });
    state.preferences.wallpaperError = e.message;
    saveInternal();
  } finally {
    wallpaperBusy = false;
  }
}
app.whenReady().then(async () => {
  if (!primaryInstance) return;
  startupLog("starting", {
    electron: process.versions.electron,
    packaged: app.isPackaged,
  });
  domain = await import(pathToFileURL(path.join(root, "src/domain.mjs")).href);
  store = path.join(app.getPath("userData"), "planner.json");
  fs.mkdirSync(path.dirname(store), { recursive: true });
  try {
    state = fs.existsSync(store)
      ? domain.validateBackup(JSON.parse(fs.readFileSync(store, "utf8")))
      : domain.initialState();
  } catch (e) {
    dialog.showErrorBox(
      "Munka could not open your planner",
      "Your data was not overwritten. Restore a valid backup before continuing. " +
        e.message,
    );
    app.quit();
    return;
  }
  const backupDir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  function backup() {
    if (fs.existsSync(store))
      fs.copyFileSync(
        store,
        path.join(backupDir, `planner-${Date.now()}.json`),
      );
    const files = fs.readdirSync(backupDir).sort();
    for (const f of files.slice(0, -14)) fs.unlinkSync(path.join(backupDir, f));
  }
  backup();
  setInterval(backup, 3600000).unref();
  handle("load", () => state);
  handle("session", async (action, data) => {
    const file = path.join(app.getPath("userData"), "session.enc");
    if (action === "clear") {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return true;
    }
    if (action === "save") {
      if (!safeStorage.isEncryptionAvailable()) return false;
      if (
        !data ||
        typeof data.token !== "string" ||
        typeof data.url !== "string"
      )
        throw Error("Invalid session");
      fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(data)));
      return true;
    }
    if (action === "load") {
      try {
        return fs.existsSync(file) && safeStorage.isEncryptionAvailable()
          ? JSON.parse(safeStorage.decryptString(fs.readFileSync(file)))
          : null;
      } catch {
        return null;
      }
    }
    throw Error("Unknown session action");
  });
  handle("save", (next, revision) => {
    if (revision !== state.revision)
      throw Error(
        "Your planner changed in another window. Your view has refreshed; please try again.",
      );
    next = domain.validateBackup(next);
    if (JSON.stringify(next).length > 20 * 1024 * 1024)
      throw Error("Planner exceeds 20 MB. Export and archive older data.");
    state = { ...next, revision: state.revision + 1 };
    persist();
    broadcast();
    syncWidget();
    clearTimeout(wallpaperTimer);
    wallpaperTimer = setTimeout(updateWallpaper, 600);
    return state;
  });
  handle("export", async (text, ext) => {
    if (!["json", "csv"].includes(ext) || typeof text !== "string")
      throw Error("Invalid export");
    const r = await dialog.showSaveDialog(main, {
      defaultPath: `Munka-${domain.dateKey()}.${ext}`,
      filters: [{ name: "Munka data", extensions: [ext] }],
    });
    if (!r.canceled) {
      fs.writeFileSync(r.filePath, text);
      return true;
    }
    return false;
  });
  handle("import", async () => {
    const r = await dialog.showOpenDialog(main, {
      filters: [{ name: "Planner files", extensions: ["json", "csv", "ics"] }],
      properties: ["openFile"],
    });
    if (r.canceled) return null;
    const file = r.filePaths[0];
    if (fs.statSync(file).size > 20 * 1024 * 1024)
      throw Error("Choose a file smaller than 20 MB.");
    return { name: path.basename(file), text: fs.readFileSync(file, "utf8") };
  });
  handle("desktop", async (action, value) => {
    if (action === "open") {
      showMain(value);
      return;
    }
    if (action === "displays")
      return screen.getAllDisplays().map((d, i) => ({
        id: String(d.id),
        name: `Display ${i + 1} · ${d.size.width} × ${d.size.height}`,
      }));
    if (action === "wallpaper-enable") {
      const choice = await dialog.showMessageBox(main, {
        type: "question",
        buttons: ["Cancel", "Choose background"],
        defaultId: 0,
        cancelId: 0,
        message: "Enable wallpaper reminders?",
        detail:
          "Munka will replace the selected display’s wallpaper. Windows slideshows will be paused. Your existing wallpaper will be saved and restored when you disable this feature.",
      });
      if (choice.response !== 1) return false;
      const r = await dialog.showOpenDialog(main, {
        properties: ["openFile"],
        filters: [
          { name: "Background image", extensions: ["png", "jpg", "jpeg"] },
        ],
      });
      if (r.canceled) return false;
      if (!state.preferences.wallpaperOriginal)
        state.preferences.wallpaperOriginal = await ps(["-Action", "get"]);
      state.preferences.wallpaperBackground = r.filePaths[0];
      state.preferences.wallpaper = true;
      saveInternal();
      await updateWallpaper();
      return true;
    }
    if (action === "wallpaper-disable") {
      if (state.preferences.wallpaperOriginal)
        await ps([
          "-Action",
          "restore",
          "-Snapshot",
          state.preferences.wallpaperOriginal,
        ]);
      state.preferences.wallpaper = false;
      state.preferences.wallpaperOriginal = "";
      saveInternal();
      return true;
    }
    if (action === "test-notification") {
      if (!Notification.isSupported())
        throw Error("Windows notifications are unavailable.");
      new Notification({
        title: "Munka reminders",
        body: "You’re ready to stay on track.",
        silent: !state.preferences.sound,
      }).show();
      return true;
    }
    if (action === "quit") {
      quitting = true;
      app.quit();
    }
    throw Error("Unknown desktop action");
  });
  createMain();
  syncWidget();
  tray = new Tray(
    nativeImage
      .createFromPath(path.join(root, "assets/munka.png"))
      .resize({ width: 24, height: 24 }),
  );
  tray.setToolTip("Munka · Your day, in sight");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Munka", click: () => showMain() },
      {
        label: "Quit Munka — stops reminders",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => showMain());
  screen.on("display-removed", () => {
    if (widget) widget.setBounds(safeBounds(widget.getBounds()));
  });
  setInterval(() => {
    const now = new Date();
    const beforeRules = state.logs.length;
    const due = state.tasks.filter(
      (t) =>
        t.status !== "Done" &&
        t.reminder &&
        new Date(t.reminder) <= now &&
        t.notifiedFor !== t.reminder,
    );
    for (const t of state.tasks)
      if (t.status !== "Done" && t.date && t.date <= domain.dateKey(now))
        domain.runRules(state, "due", t, now);
    if (
      due.length &&
      !domain.isQuiet(state.preferences, now) &&
      Notification.isSupported()
    ) {
      const grouped = due.length > 1 || Date.now() - lastTick > 90000;
      const body = state.preferences.privacy
        ? "Open Munka to see your reminders."
        : grouped
          ? `${due.length} reminder${due.length === 1 ? "" : "s"} waiting. Open your planner to catch up.`
          : due[0].title;
      const n = new Notification({
        title: grouped ? "Your Munka catch-up" : "Munka · Time to check in",
        body,
        silent: !state.preferences.sound,
      });
      n.on("click", () => showMain());
      n.show();
      for (const t of due) t.notifiedFor = t.reminder;
      saveInternal();
    }
    if (state.logs.length !== beforeRules) saveInternal();
    lastTick = Date.now();
  }, 15000).unref();
  setInterval(updateWallpaper, 60000).unref();
});
app.on("window-all-closed", () => {
  if (!state?.preferences.background) app.quit();
});
app.on("before-quit", () => {
  quitting = true;
});
