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
  shell,
  powerMonitor,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const root = path.join(__dirname, "..");
const capabilities = require('./platform-policy.cjs').platformPolicy();
const { widgetBounds } = require('./widget-bounds.cjs');
const { wallpaperContent, matchMonitor } = require('./wallpaper-model.cjs');
const { createOverlayController } = require('./overlay-controller.cjs');
const { createMacOverlayController } = require('./mac-overlay-controller.cjs');
const { EDGES, overlayLayer, overlayWindowOptions, resizedOverlay, stayInBackground } = require('./overlay-policy.cjs');
let overlayController;
let aiService;
let calendarService, syllabusService;
let accessMode = !app.isPackaged && process.env.MUNKA_TEST_DATA && process.env.MUNKA_TEST_AUTH_PANEL !== 'true' ? 'local' : 'locked';
const overlayResize = new Map();
let wallpaperKey = '', wallpaperGeneration = 0;
let main,
  pendingTask,
  mainRendererReady = false,
  widget,
  projectsWidget,
  tray,
  state,
  domain,
  quitting = false,
  store;
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
if (process.platform === 'win32') app.setAppUserModelId("app.munka.planner");
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
  if (accessMode === 'locked') return;
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
  if (typeof id === "string" && state.tasks.some((task) => task.id === id))
    pendingTask = id;
  if (!main || main.isDestroyed()) createMain();
  main.show();
  main.focus();
  if (pendingTask && mainRendererReady && accessMode !== 'locked') {
    main.webContents.send("open-task", pendingTask);
    pendingTask = undefined;
  }
}
function createMain() {
  mainRendererReady = false;
  main = new BrowserWindow(options({ show: !process.env.MUNKA_TEST_DATA && !process.argv.includes('--background') }));
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
    if (!quitting && stayInBackground(state.preferences)) {
      e.preventDefault();
      main.hide();
    }
  });
}
function safeBounds(b) {
  return widgetBounds(b, screen.getAllDisplays(), screen.getPrimaryDisplay());
}
function overlaySurfaces() {
  return [widget, projectsWidget].filter(win => win && !win.isDestroyed());
}
function nativeOverlayUpdate() {
  if (quitting || !capabilities.overlays) return;
  if (!overlayController) {
    const callbacks = {
      onError(error) {
        if (quitting || !state || state.preferences.overlayError === error.message) return;
        state.preferences.overlayError = error.message; saveInternal();
      },
      onReady() {
        if (state?.preferences.overlayError) { state.preferences.overlayError = ''; saveInternal(); }
      },
    };
    overlayController = process.platform === 'darwin'
      ? createMacOverlayController(callbacks)
      : createOverlayController({ ...callbacks,
        script: app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'overlay.ps1') : path.join(__dirname, 'overlay.ps1') });
  }
  overlayController.update(overlaySurfaces().filter(win => win.munkaOverlayReady).map(win => {
    if (process.platform === 'darwin') return { win,
      surface: win === projectsWidget ? 'projects' : 'daily', layer: overlayLayer(state.preferences) };
    const handle = win.getNativeWindowHandle();
    return {
      surface: win === projectsWidget ? 'projects' : 'daily',
      handle: (handle.length === 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0))).toString(),
      layer: overlayLayer(state.preferences),
    };
  }));
}
function rememberOverlay(win, surface) {
  if (win.isDestroyed()) return;
  const key = surface === 'projects' ? 'projectsWidgetBounds' : 'widgetBounds';
  const bounds = safeBounds(win.getBounds());
  if (JSON.stringify(bounds) !== JSON.stringify(win.getBounds())) win.setBounds(bounds);
  if (JSON.stringify(state.preferences[key]) !== JSON.stringify(bounds)) {
    state.preferences[key] = bounds; saveInternal();
  }
}
function createOverlay(surface, bounds) {
  const isProject = surface === 'projects';
  const win = new BrowserWindow(options({
    ...overlayWindowOptions(bounds, isProject ? 'Munka projects overlay' : 'Munka daily overlay'),
    ...(process.platform === 'darwin' ? { type: 'panel', acceptFirstMouse: true } : {}),
  }));
  secure(win);
  let timer;
  const remember = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!overlayResize.has(surface)) rememberOverlay(win, surface);
    }, 450);
  };
  win.on('move', remember);
  win.on('resize', remember);
  win.on('moved', remember);
  win.on('resized', remember);
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.munkaOverlayReady = true;
    nativeOverlayUpdate();
    // Show without taking focus away from the planner or whatever the user is typing.
    if (!process.env.MUNKA_TEST_DATA) win.showInactive();
    rememberOverlay(win, surface);
    nativeOverlayUpdate();
  });
  // AppKit can reorder a panel when shown or focused. Restore the selected
  // native level without activating the planner or changing mouse behavior.
  if (process.platform === 'darwin') {
    win.on('show', () => { if (win.munkaOverlayReady) nativeOverlayUpdate(); });
    win.on('focus', () => { if (win.munkaOverlayReady) nativeOverlayUpdate(); });
  }
  win.webContents.on('render-process-gone', () => {
    state.preferences.overlayError = `An overlay stopped responding. Use Recover widgets in the Munka ${process.platform === 'darwin' ? 'menu bar' : 'tray menu'}.`;
    saveInternal();
  });
  win.loadFile(path.join(root, 'src/index.html'), { query: { widget: isProject ? 'projects' : '1' } }).catch(() => {
    if (win.isDestroyed() || accessMode === 'locked') return;
    state.preferences.overlayError = `An overlay could not load. Use Recover widgets in the Munka ${process.platform === 'darwin' ? 'menu bar' : 'tray menu'}.`;
    saveInternal();
  });
  win.on('close', () => {
    rememberOverlay(win, surface);
    if (!quitting) state.preferences[isProject ? 'widgetProjects' : 'widget'] = false;
    saveInternal();
  });
  win.on('closed', () => {
    clearTimeout(timer); overlayResize.delete(surface);
    if (isProject && projectsWidget === win) projectsWidget = null;
    if (!isProject && widget === win) widget = null;
    nativeOverlayUpdate(); updateTray();
  });
  return win;
}
function syncWidget() {
  if (!capabilities.overlays) return;
  if (accessMode === 'locked') {
    if (widget && !widget.isDestroyed()) widget.destroy();
    if (projectsWidget && !projectsWidget.isDestroyed()) projectsWidget.destroy();
    widget = null; projectsWidget = null;
    nativeOverlayUpdate(); updateTray();
    return;
  }
  syncProjectsWidget();
  if (!state.preferences.widget) {
    if (widget) widget.destroy();
  } else {
    if (!widget || widget.isDestroyed()) widget = createOverlay('daily', safeBounds(state.preferences.widgetBounds));
    widgetMaterial(widget);
  }
  nativeOverlayUpdate(); updateTray();
}
function widgetMaterial(win) {
  win.setBackgroundColor('#00000000');
  // AppKit does not resign an already-key panel when focusability is disabled.
  // Click-through must release both keyboard and mouse input.
  if (process.platform === 'darwin' && state.preferences.widgetClickThrough && win.isFocused()) win.blur();
  win.setIgnoreMouseEvents(state.preferences.widgetClickThrough === true, { forward: true });
  // Focus remains available for keyboard navigation; click-through removes focus
  // only until the explicit tray recovery command restores interaction.
  win.setFocusable(state.preferences.widgetClickThrough !== true);
  win.setSkipTaskbar(true);
  win.setAlwaysOnTop(overlayLayer(state.preferences) === 'topmost');
}
function syncProjectsWidget() {
  if (state.preferences.widgetProjects === false) {
    if (projectsWidget) { projectsWidget.destroy(); projectsWidget = null; }
    return;
  }
  if (!projectsWidget) {
    const daily = safeBounds(state.preferences.widgetBounds);
    const bounds = safeBounds(state.preferences.projectsWidgetBounds || { ...daily, x: daily.x + daily.width + 20 });
    projectsWidget = createOverlay('projects', bounds);
  }
  widgetMaterial(projectsWidget);
}
function setOverlayPreference(key, value) {
  if (!capabilities.overlays) return;
  if (accessMode === 'locked') { showMain(); return; }
  state.preferences[key] = value;
  if ((key === 'widget' || key === 'widgetProjects') && value) state.preferences.background = true;
  syncWidget(); saveInternal();
}
function recoverOverlays() {
  if (accessMode === 'locked') { showMain(); return false; }
  state.preferences.widgetClickThrough = false;
  if (!state.preferences.widget && !state.preferences.widgetProjects) state.preferences.widget = true;
  state.preferences.background = true;
  syncWidget();
  for (const win of overlaySurfaces()) {
    const surface = win === projectsWidget ? 'projects' : 'daily';
    win.setBounds(safeBounds(win.getBounds()));
    if (win.webContents.isCrashed()) win.reload();
    win.showInactive(); rememberOverlay(win, surface);
  }
  nativeOverlayUpdate(); overlayController?.recover(); saveInternal();
  return true;
}
function updateTray() {
  if (!tray || tray.isDestroyed() || !state) return;
  if (!capabilities.overlays) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Munka', click: () => showMain() },
      { type: 'separator' },
      { label: 'Quit Munka', click: () => { quitting = true; app.quit(); } },
    ]));
    return;
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Munka', click: () => showMain() },
    { type: 'separator' },
    { label: 'Daily tasks overlay', type: 'checkbox', checked: !!state.preferences.widget, click: item => setOverlayPreference('widget', item.checked) },
    { label: 'Projects overlay', type: 'checkbox', checked: !!state.preferences.widgetProjects, click: item => setOverlayPreference('widgetProjects', item.checked) },
    { label: 'Layer', submenu: [
      { label: 'On desktop · behind apps', type: 'radio', checked: overlayLayer(state.preferences) === 'desktop', click: () => setOverlayPreference('widgetLayer', 'desktop') },
      { label: 'Keep above apps', type: 'radio', checked: overlayLayer(state.preferences) === 'topmost', click: () => setOverlayPreference('widgetLayer', 'topmost') },
    ] },
    { label: 'Click through overlays', type: 'checkbox', checked: !!state.preferences.widgetClickThrough, click: item => setOverlayPreference('widgetClickThrough', item.checked) },
    { label: 'Recover widgets · restore clicks and position', click: recoverOverlays },
    { type: 'separator' },
    { label: 'Quit Munka — stops overlays and reminders', click: () => { quitting = true; app.quit(); } },
  ]));
}
function senderAllowed(e) {
  return (
    [main, widget, projectsWidget].some(
      (w) => w && !w.isDestroyed() && w.webContents === e.sender,
    ) && e.senderFrame === e.sender.mainFrame
  );
}
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    if (!senderAllowed(e)) throw Error("Untrusted request");
    if (accessMode === 'locked' && !['version','ready'].includes(name) && !(name === 'desktop' && args[0] === 'quit'))
      throw Error('Sign in or choose Use locally to open your planner.');
    return fn(...args);
  });
}
function wallpaperDisplay() {
  const id = state.preferences.wallpaperDisplay;
  const display = id ? screen.getAllDisplays().find(d => String(d.id) === id) : screen.getPrimaryDisplay();
  if (!display) throw Error('The selected wallpaper display is disconnected. Choose a connected display.');
  return display;
}
function wallpaperData() {
  return wallpaperContent(state, domain.dateKey());
}
async function renderWallpaper(file, display, content) {
  if (fs.statSync(file).size > 30 * 1024 * 1024) throw Error('Choose a background smaller than 30 MB.');
  const w = new BrowserWindow({ ...display.bounds, useContentSize:true, frame:false, show:false,
    webPreferences:{offscreen:true, contextIsolation:true, nodeIntegration:false, sandbox:true} });
  try {
    await w.loadFile(path.join(root, 'src/wallpaper.html'));
    const data = { ...content, background:fs.readFileSync(file).toString('base64'),
      mime:path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
      logo:fs.readFileSync(path.join(root, 'assets/munka.png')).toString('base64') };
    await w.webContents.executeJavaScript('window.paint(' + JSON.stringify(data) + ')');
    const image = await w.webContents.capturePage();
    const physical = screen.dipToScreenRect(null, display.bounds);
    return image.resize({width:physical.width, height:physical.height}).toPNG();
  } finally { w.destroy(); }
}
async function updateWallpaper() {
  if (!capabilities.wallpaper) return;
  if (accessMode === 'locked') return;
  if (!state.preferences.wallpaper || wallpaperBusy || !state.preferences.wallpaperBackground) return;
  wallpaperBusy = true;
  const generation = wallpaperGeneration;
  try {
    const display = wallpaperDisplay(), content = wallpaperData(), file = state.preferences.wallpaperBackground;
    const key = JSON.stringify({ content, file, modified:fs.statSync(file).mtimeMs, display:display.bounds, scale:display.scaleFactor });
    if (key === wallpaperKey) return;
    const monitors = JSON.parse(await ps(['-Action','get']));
    const monitor = matchMonitor(monitors, screen.dipToScreenRect(null, display.bounds));
    const image = await renderWallpaper(file, display, content);
    if (!state.preferences.wallpaper || generation !== wallpaperGeneration) return;
    const out = path.join(app.getPath('userData'), 'munka-wallpaper.png');
    fs.writeFileSync(out, image);
    await ps(['-Action','set','-ImagePath',out,'-MonitorId',monitor.Id]);
    wallpaperKey = key;
    if (state.preferences.wallpaperError) { state.preferences.wallpaperError='';saveInternal(); }
  } catch (e) {
    if (state.preferences.wallpaperError !== e.message) {
      state.logs.push({id:domain.uid(), at:new Date().toISOString(), message:e.message});
      state.preferences.wallpaperError=e.message;saveInternal();
    }
  } finally { wallpaperBusy = false; }
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
  // Retire credentials for the old sync and hosted-AI sign-ins. Planner records stay untouched.
  for (const oldSession of ['session.enc', 'ai-session.enc']) {
    try { fs.rmSync(path.join(app.getPath('userData'), oldSession), { force: true }); }
    catch { startupLog('legacy-session-cleanup-unavailable', { file: oldSession }); }
  }
  try {
    const saved = fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, 'utf8')) : null;
    state = saved ? domain.validateBackup(saved) : domain.initialState();
    if (saved && saved.preferences?.widgetOverlayVersion !== 1) {
      // Older releases had one master widget switch: do not turn projects back
      // on when someone deliberately switched the old master control off.
      if (saved.preferences?.widget === false) state.preferences.widgetProjects = false;
      state.preferences.widgetLayer = saved.preferences?.alwaysOnTop ? 'topmost' : 'desktop';
    }
    state.preferences.widgetOverlayVersion = 1;
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
  handle("version", () => ({ version: require('../package.json').version, build: capabilities.platform === 'darwin' ? 'Mac beta' : 'Desktop beta', platform: process.platform, capabilities, theme: state.preferences.theme, testProfile: !!process.env.MUNKA_TEST_DATA, authPanelTest: process.env.MUNKA_TEST_AUTH_PANEL === 'true' }));
  const commitExtension = next => {
    if (accessMode === 'locked') throw Error('Open your planner before saving changes.');
    next = domain.validateBackup(next);
    if (JSON.stringify(next).length > 20 * 1024 * 1024) throw Error('Planner exceeds 20 MB. Archive older data first.');
    const before = state;
    state = {...next, revision: state.revision + 1};
    try { persist(); } catch(error) { state = before; throw error; }
    broadcast(); syncWidget();
  };
  calendarService = require('./calendar-service.cjs').createCalendarService({
    directory:app.getPath('userData'),safeStorage,getState:()=>state,commit:next=>{
      if (accessMode !== 'account') throw Error('Sign in to refresh connected calendars.');
      commitExtension(next);
    },
    clientIds:require('../package.json').calendarClientIds || {},openExternal:url=>shell.openExternal(url),
  });
  const accountConfig = require('../package.json').munkaAccount;
  let plannerAccountId = null;
  const localPlannerStore = store;
  async function changeAccess(mode, accountId = null) {
    const nextId = mode === 'account' ? accountId : null;
    if (mode === 'account' && !/^[a-f0-9-]{36}$/i.test(nextId || '')) throw Error('The account identity is invalid.');
    if (mode !== 'locked' && nextId !== plannerAccountId) {
      const nextStore = nextId ? path.join(app.getPath('userData'), 'planner-account-' + nextId + '.json') : localPlannerStore;
      const saved = fs.existsSync(nextStore) ? JSON.parse(fs.readFileSync(nextStore,'utf8')) : null;
      const nextState = saved ? domain.validateBackup(saved) : domain.initialState();
      store = nextStore; state = nextState; plannerAccountId = nextId;
      broadcast();
    }
    accessMode = mode;
    if (mode === 'locked') {
      aiService?.cancel();
      if (main && !main.isDestroyed()) main.webContents.send('access-change', { mode });
    }
    syncWidget();
  }
  const accountService = require('./account-service.cjs').createAccountService({
    url: accountConfig.url,
    publishableKey: accountConfig.publishableKey,
    file: path.join(app.getPath('userData'), 'munka-account.enc'),
    safeStorage,
    openExternal: url => shell.openExternal(url),
    onSignedOut: () => { if (accessMode === 'account') changeAccess('locked').catch(error=>startupLog('account-lock-failed')); },
  });
  async function requireAccount() {
    if (accessMode !== 'account') throw Error('Sign in to your Munka account to use this feature.');
    const verified = await accountService.status();
    if (!verified.signedIn) { changeAccess('locked'); throw Error('Sign in again to continue.'); }
  }
  ipcMain.handle('account', async (event, action, data) => {
    if (!senderAllowed(event) || event.sender !== main?.webContents)
      return {ok:false,error:'Open the full planner to use Munka account.'};
    if (!['status','providers','signIn','register','signOut','google','cancel','useLocal','lock'].includes(action))
      return {ok:false,error:'Unknown account action.'};
    try {
      if (action === 'useLocal') { accountService.cancel(); await changeAccess('local'); return {ok:true,value:{signedIn:false,mode:'local'}}; }
      if (action === 'lock') { accountService.cancel(); await changeAccess('locked'); return {ok:true,value:{signedIn:false,mode:'locked'}}; }
      const value = await accountService[action](data);
      if (['status','signIn','register','google'].includes(action) && value.signedIn) await changeAccess('account',value.id);
      if (action === 'status' && !value.signedIn && accessMode === 'account') await changeAccess('locked');
      if (action === 'signOut') await changeAccess('locked');
      return {ok:true,value:{...value,mode:accessMode}};
    }
    catch (error) { return {ok:false,error:error.message}; }
  });
  handle('local-planner', () => fs.existsSync(localPlannerStore) ? domain.validateBackup(JSON.parse(fs.readFileSync(localPlannerStore,'utf8'))) : domain.initialState());
  ipcMain.handle('cloud', async (event,action,data,user) => {
    if(!senderAllowed(event)||event.sender!==main?.webContents||accessMode!=='account')return {ok:false,error:'Sign in in the full planner to sync.'};
    try{return {ok:true,value:await accountService.cloud(action,data,user)};}
    catch(error){return {ok:false,error:error.message,code:error.code};}
  });
  syllabusService = require('./syllabus-service.cjs').createSyllabusService({
    directory:app.getPath('userData'),getState:()=>state,commit:commitExtension,
    chooseFile:async()=>{const r=await dialog.showOpenDialog(main,{filters:[{name:'Syllabus or coursework',extensions:['pdf','docx','txt']}],properties:['openFile']});return r.canceled?null:r.filePaths[0];},
  });
  for (const [channel,service,allowed] of [['calendars',calendarService,['status','connect','refresh','disconnect','cancel']],['syllabus',syllabusService,['choose','add','source','undo','cancel']]]) {
    ipcMain.handle(channel,async(event,action,data)=>{
      if(!senderAllowed(event)||event.sender!==main?.webContents)return {ok:false,error:'Open the full planner to use this feature.'};
      try {
        if(!allowed.includes(action))throw Error('Unknown action.');
        if (accessMode === 'locked') throw Error('Sign in or choose Use locally to open your planner.');
        if (channel === 'calendars' && action !== 'cancel') await requireAccount();
        const value=channel==='calendars' ? await service[action](data?.provider,data?.selected) : await service[action](data);
        return {ok:true,value};
      } catch(error){return {ok:false,error:error.message};}
    });
  }
  const refreshConnectedCalendars = () => { if (accessMode === 'account') calendarService.refreshAll(); };
  setInterval(refreshConnectedCalendars,15*60000).unref();
  setTimeout(refreshConnectedCalendars,2000).unref();
  powerMonitor.on('resume',refreshConnectedCalendars);
  const aiSessionFile = path.join(app.getPath('userData'), 'ai-session.enc');
  const legacyAI = !app.isPackaged && process.env.MUNKA_AI_LEGACY === 'true';
  const createAI = legacyAI ? require('./ai-service.cjs').createAIService : require('./managed-ai-service.cjs').createManagedAIService;
  const aiOptions = {
    file: path.join(app.getPath('userData'), 'ai-settings.json'), safeStorage, getState: () => state,
    url: (!app.isPackaged && process.env.MUNKA_AI_URL) || require('../package.json').munkaAIUrl || '',
    getSession: () => {
      try { return safeStorage.isEncryptionAvailable() && fs.existsSync(aiSessionFile)
        ? JSON.parse(safeStorage.decryptString(fs.readFileSync(aiSessionFile))) : null; } catch { return null; }
    },
    saveSession: value => {
      if (!safeStorage.isEncryptionAvailable()) throw Error('Windows encryption is unavailable. Sign-in cannot be saved.');
      fs.writeFileSync(aiSessionFile + '.tmp', safeStorage.encryptString(JSON.stringify(value)));
      fs.renameSync(aiSessionFile + '.tmp', aiSessionFile);
    },
    clearSession: () => { if (fs.existsSync(aiSessionFile)) fs.unlinkSync(aiSessionFile); },
    appendTasks: drafts => {
      if (accessMode !== 'account') throw Error('Sign in to save a Munka AI proposal.');
      const previous = state;
      const tasks = drafts.map(draft => domain.task({ ...draft, aiDrafted: true }));
      state = { ...state, tasks: [...state.tasks, ...tasks], revision: state.revision + 1 };
      try { persist(); } catch { state = previous; throw Error('The plan could not be saved. Nothing was added. Try again.'); }
      // No automation execution or writes to any other entity through this path.
      try { broadcast(); syncWidget(); } catch { /* Tasks are already durably committed. */ }
      return { count: tasks.length, ids: tasks.map(t => t.id) };
    },
  };
  aiService = createAI(aiOptions);
  if (!legacyAI && !aiOptions.url) {
    try {
      aiService = await require('./owner-ai-service.cjs').createOwnerAIService({
        directory:app.getPath('userData'), safeStorage, getState:aiOptions.getState, appendTasks:aiOptions.appendTasks,
      }) || aiService;
    } catch {
      const fallbackStatus=aiService.status;
      aiService.status=async()=>({...await fallbackStatus(),notice:'AI setup on this PC needs repair. Your planner and saved deadlines still work.'});
      startupLog('owner-ai-setup-unavailable');
    }
  }
  ipcMain.handle('ai', async (event, action, data) => {
    if (!senderAllowed(event) || event.sender !== main?.webContents) throw Error('AI is available only in the main planner.');
    if (!['status','configure','disconnect','propose','approve','cancel','deadlines'].includes(action) || typeof aiService[action] !== 'function') throw Error('Unknown AI action.');
    try {
      if (accessMode === 'locked') throw Error('Sign in or choose Use locally to open your planner.');
      if (['configure','propose','approve'].includes(action)) await requireAccount();
      if (action === 'status' && accessMode === 'local') return {ok:true,value:{managed:true,provider:'managed',signedIn:false,configured:false,available:false,limit:3,maxTasks:5,used:0,remaining:null,notice:'Sign in to use Munka AI. Saved deadline summaries work locally.'}};
      return {ok:true, value:await aiService[action](data)};
    }
    catch (error) { return {ok:false, error:error.message}; }
  });
  handle("ready", () => {
    mainRendererReady = true;
    startupLog("main-renderer-ready");
    if (accessMode === 'locked') return;
    const id = pendingTask;
    pendingTask = undefined;
    return id;
  });
  handle("save", (next, revision, expectedAccount) => {
    if(expectedAccount!==undefined && expectedAccount!==(accessMode==='account'?plannerAccountId:null))
      throw Error('Your account changed. Reopen the planner before saving.');
    if (revision !== state.revision)
      throw Error(
        "Your planner changed in another window. Your view has refreshed; please try again.",
      );
    next = domain.validateBackup(next);
    if (JSON.stringify(next).length > 20 * 1024 * 1024)
      throw Error("Planner exceeds 20 MB. Export and archive older data.");
    // OS login registration only changes through the dedicated verified action.
    next.events = [...next.events.filter(e => !e.externalCalendar), ...state.events.filter(e => e.externalCalendar)];
    next.preferences.launchAtLogin = state.preferences.launchAtLogin === true;
    next.preferences.widgetOverlayVersion = 1;
    if ((!state.preferences.widget && next.preferences.widget) || (!state.preferences.widgetProjects && next.preferences.widgetProjects)) next.preferences.background = true;
    const previous = state;
    state = { ...next, revision: state.revision + 1 };
    try { persist(); } catch(error) { state = previous; throw error; }
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
    if (!capabilities.overlays && !['displays', 'open', 'test-notification'].includes(action))
      throw Error('This desktop integration is not available in the core Mac beta.');
    if (action === 'widget-hit-test') {
      if (!value || !['daily', 'projects'].includes(value.surface) || typeof value.interactive !== 'boolean') throw Error('Invalid overlay hit test.');
      const win = value.surface === 'projects' ? projectsWidget : widget;
      if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(state.preferences.widgetClickThrough === true || !value.interactive, { forward: true });
      return true;
    }
    if (action === 'widget-adjust') {
      if (!value || !['daily', 'projects'].includes(value.surface) || !['move', 'resize'].includes(value.mode) ||
        ![value.dx, value.dy].every(n => Number.isInteger(n) && Math.abs(n) <= 10)) throw Error('Invalid overlay adjustment.');
      const win = value.surface === 'projects' ? projectsWidget : widget;
      if (!win || win.isDestroyed()) throw Error('This overlay is turned off.');
      if (state.preferences.widgetClickThrough) throw Error('Turn off click through before adjusting.');
      const bounds = win.getBounds();
      if (value.mode === 'move') { bounds.x += value.dx; bounds.y += value.dy; }
      else { bounds.width += value.dx; bounds.height += value.dy; }
      win.setBounds(safeBounds(bounds));
      rememberOverlay(win, value.surface);
      return true;
    }
    if (action === 'widget-recover') return recoverOverlays();
    if (action === 'widget-off') {
      if (!['daily', 'projects'].includes(value)) throw Error('Choose a valid overlay.');
      setOverlayPreference(value === 'projects' ? 'widgetProjects' : 'widget', false);
      return true;
    }
    if (action === 'overlay-status') return { platform: process.platform, ready: overlayController?.ready === true, layer: overlayLayer(state.preferences), windows: overlayController?.windows || [], error: state.preferences.overlayError || '' };
    if (!capabilities.wallpaper && action.startsWith('wallpaper-'))
      throw Error('Wallpaper reminders are available in the Windows app.');
    if (action === 'launch-at-login') {
      if (typeof value !== 'boolean') throw Error('Choose whether Munka should start with Windows.');
      if (process.platform !== 'win32' || !app.isPackaged || process.env.MUNKA_TEST_DATA) throw Error('Start with Windows is available in the installed Windows app.');
      const login = { path: process.execPath, args: ['--background'] };
      app.setLoginItemSettings({ ...login, openAtLogin: value, enabled: value });
      const actual = app.getLoginItemSettings(login).openAtLogin;
      if (actual !== value) throw Error('Windows did not save the startup setting. Check Startup Apps in Windows Settings.');
      state.preferences.launchAtLogin = actual;
      saveInternal();
      return actual;
    }
    if (['widget-resize-start', 'widget-resize-update', 'widget-resize-end'].includes(action)) {
      if (!value || !['daily', 'projects'].includes(value.surface)) throw Error('Choose a valid overlay.');
      const win = value.surface === 'projects' ? projectsWidget : widget;
      if (!win || win.isDestroyed()) throw Error('This overlay is turned off.');
      if (action === 'widget-resize-start') {
        if (!EDGES.has(value.edge)) throw Error('Choose a valid resize edge.');
        if (state.preferences.widgetClickThrough) throw Error('Turn off click through before resizing.');
        const bounds = safeBounds(win.getBounds());
        overlayResize.set(value.surface, { win, bounds, cursor: screen.getCursorScreenPoint(), edge: value.edge, area: screen.getDisplayMatching(bounds).workArea, at: Date.now() });
        return true;
      }
      const resize = overlayResize.get(value.surface);
      if (!resize || resize.win !== win) return false;
      if (action === 'widget-resize-end' || Date.now() - resize.at > 30000) {
        overlayResize.delete(value.surface); rememberOverlay(win, value.surface); return true;
      }
      win.setBounds(resizedOverlay(resize, screen.getCursorScreenPoint(), resize.edge, resize.area));
      return true;
    }
    if (action === 'widget-size') {
      if (!value || !['daily', 'projects'].includes(value.surface) || !['compact', 'roomy'].includes(value.size)) throw Error('Invalid widget size');
      const isProject = value.surface === 'projects';
      state.preferences[isProject ? 'projectsWidgetSize' : 'widgetSize'] = value.size;
      const win = isProject ? projectsWidget : widget;
      const current = win?.getBounds() || safeBounds(state.preferences[isProject ? 'projectsWidgetBounds' : 'widgetBounds']);
      const size = value.size === 'roomy' ? { width: 440, height: isProject ? 480 : 620 } : { width: 360, height: isProject ? 320 : 480 };
      const bounds = safeBounds({ ...current, ...size });
      state.preferences[isProject ? 'projectsWidgetBounds' : 'widgetBounds'] = bounds;
      if (win) win.setBounds(bounds);
      saveInternal();
      return true;
    }
    const placementWindow = value === 'projects' ? projectsWidget : widget;
    if (action === 'widget-position' && placementWindow) {
      Menu.buildFromTemplate(screen.getAllDisplays().map((display, index) => ({
        label: `Display ${index + 1}`,
        submenu: ['Top left', 'Top right', 'Bottom left', 'Bottom right'].map(label => ({
          label,
          click: () => {
            if (!placementWindow || placementWindow.isDestroyed()) return;
            const a = display.workArea;
            const b = widgetBounds({ ...placementWindow.getBounds(), x: a.x, y: a.y }, [display], display);
            b.x = label.endsWith('right') ? a.x + a.width - b.width : a.x;
            b.y = label.startsWith('Bottom') ? a.y + a.height - b.height : a.y;
            placementWindow.setBounds(b);
            state.preferences[value === 'projects' ? 'projectsWidgetBounds' : 'widgetBounds'] = b;
            saveInternal();
          },
        })),
      }))).popup({ window: placementWindow });
      return;
    }
    if (action === "open") {
      showMain(value);
      return;
    }
    if (action === "displays")
      return screen.getAllDisplays().map((d, i) => ({
        id: String(d.id),
        name: `Display ${i + 1} · ${d.size.width} × ${d.size.height}`,
      }));
    if (action === 'wallpaper-preview') {
      let file = state.preferences.wallpaperBackground;
      if (!file || !fs.existsSync(file)) {
        const choice = await dialog.showOpenDialog(main, {title:'Choose an image for the wallpaper preview', properties:['openFile'], filters:[{name:'Background image',extensions:['png','jpg','jpeg']}]});
        if (choice.canceled) return null;
        file = choice.filePaths[0];
      }
      return (await renderWallpaper(file, wallpaperDisplay(), wallpaperData())).toString('base64');
    }
    if (action === "wallpaper-enable") {
      const choice = await dialog.showMessageBox(main, {
        type: "question",
        buttons: ["Cancel", "Choose background"],
        defaultId: 0,
        cancelId: 0,
        message: "Enable wallpaper reminders?",
        detail:
          "Munka will replace the selected display’s wallpaper. Windows slideshows will be paused. Original static backgrounds are saved and restored when disabled. Slideshow timing and order cannot be restored automatically.",
      });
      if (choice.response !== 1) return false;
      const r = await dialog.showOpenDialog(main, {
        properties: ["openFile"],
        filters: [
          { name: "Background image", extensions: ["png", "jpg", "jpeg"] },
        ],
      });
      if (r.canceled) return false;
      if (!state.preferences.wallpaperOriginal) {
        const originals = JSON.parse(await ps(['-Action','get']));
        const folder = path.join(app.getPath('userData'),'wallpaper-originals');
        fs.mkdirSync(folder,{recursive:true});
        originals.forEach((item,index) => {
          if (item.Path && fs.existsSync(item.Path)) {
            const copy=path.join(folder,'display-'+index+path.extname(item.Path));
            fs.copyFileSync(item.Path,copy);item.Path=copy;
          }
        });
        state.preferences.wallpaperOriginal = JSON.stringify(originals);
      }
      wallpaperGeneration++; wallpaperKey='';
      state.preferences.wallpaperBackground = r.filePaths[0];
      state.preferences.wallpaper = true;
      saveInternal();
      await updateWallpaper();
      return true;
    }
    if (action === "wallpaper-disable") {
      wallpaperGeneration++;wallpaperKey='';
      state.preferences.wallpaper = false;
      saveInternal();
      // Let any in-flight Windows write settle before restoring the original.
      while (wallpaperBusy) await new Promise(resolve => setTimeout(resolve,50));
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
        throw Error("System notifications are unavailable.");
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
  updateTray();
  tray.on("double-click", () => showMain());
  screen.on("display-removed", () => {
    overlayResize.clear();
    if (widget) rememberOverlay(widget, 'daily');
    if (projectsWidget) rememberOverlay(projectsWidget, 'projects');
    nativeOverlayUpdate();
  });
  screen.on('display-metrics-changed', () => {
    overlayResize.clear();
    if (widget) rememberOverlay(widget, 'daily');
    if (projectsWidget) rememberOverlay(projectsWidget, 'projects');
    nativeOverlayUpdate();
  });
  if (process.platform === 'darwin') {
    powerMonitor.on('resume', nativeOverlayUpdate);
    powerMonitor.on('unlock-screen', nativeOverlayUpdate);
    screen.on('display-added', nativeOverlayUpdate);
  }
  setInterval(() => {
    if (accessMode === 'locked') return;
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
      n.on("click", () => showMain(grouped ? undefined : due[0].id));
      n.show();
      for (const t of due) t.notifiedFor = t.reminder;
      saveInternal();
    }
    if (state.logs.length !== beforeRules) saveInternal();
    lastTick = Date.now();
  }, 15000).unref();
  updateWallpaper();
  setInterval(updateWallpaper, 60000).unref();
});
app.on("window-all-closed", () => {
  if (process.platform !== 'darwin' && !stayInBackground(state?.preferences)) app.quit();
});
app.on('activate', () => { if (app.isReady() && state) showMain(); });
app.on("before-quit", () => {
  quitting = true;
  aiService?.cancel();
  calendarService?.cancel();
  syllabusService?.cancel();
  overlayController?.stop();
});

