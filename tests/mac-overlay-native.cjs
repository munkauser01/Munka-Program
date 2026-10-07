// Run with Electron on a matching macOS runner after building the AppKit addon.
// Uses real BrowserWindows and AppKit inspection, plus a disposable planner.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow, Tray } = require('electron');
if (process.platform !== 'darwin') throw Error('Run the Mac overlay smoke test on macOS.');
process.env.MUNKA_TEST_DATA = path.resolve('work/mac-overlay-' + Date.now());
process.env.MUNKA_TEST_AUTH_PANEL = 'true';
require('../electron/account-service.cjs').createAccountService = () => ({ status: async () => ({ signedIn: false }), providers: async () => ({ google: false, email: true }), cancel: () => ({}) });
let trayMenu;
const originalSetContextMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function (menu) { trayMenu = menu; return originalSetContextMenu.call(this, menu); };
require('../electron/main.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accepts, label) {
  let value;
  for (let i = 0; i < 80; i++) { value = await read(); if (accepts(value)) return value; await pause(100); }
  throw Error(label + ': ' + JSON.stringify(value));
}
const bySurface = surface => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith(surface === 'daily' ? 'widget=1' : 'widget=projects'));
const findMenu = (label, menu = trayMenu) => menu?.items.find(item => item.label === label) || menu?.items.map(item => item.submenu && findMenu(label, item.submenu)).find(Boolean);
app.whenReady().then(async () => {
  const evidence = path.resolve('outputs/mac-overlay-' + process.arch);
  fs.mkdirSync(evidence, { recursive: true });
  let main;
  try {
    main = await until(() => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('index.html')), win => win && !win.webContents.isLoading(), 'Planner did not load');
    const js = code => main.webContents.executeJavaScript(code);
    await until(() => js("!!document.querySelector('#munka-local')"), Boolean, 'Local planner gate did not appear');
    // Overlays must not expose a locked account planner.
    assert.equal(bySurface('daily'), undefined); assert.equal(bySurface('projects'), undefined);
    await js("document.querySelector('#munka-local').click()");
    await until(() => js("document.querySelector('h1')?.textContent"), title => title === 'Home', 'Local planner did not open');
    const { task, dateKey } = await import('../src/domain.mjs');
    const dailyTask = task({ title: 'Mac overlay daily action', date: dateKey() });
    const projectTask = task({ title: 'Mac overlay project action', date: dateKey(), project: 'mac-project' });
    await js(`(async()=>{const s=await window.munka.load();s.tasks=${JSON.stringify([dailyTask, projectTask])};s.projects=[{id:'mac-project',name:'Mac overlay project'}];Object.assign(s.preferences,{widget:true,widgetProjects:true,widgetLayer:'desktop',widgetClickThrough:false,widgetSurface:'seamless',widgetInk:'dark',privacy:false,theme:'light',background:true});await window.munka.save(s,s.revision)})()`);
    const daily = await until(() => bySurface('daily'), win => win && !win.webContents.isLoading(), 'Daily overlay did not load');
    const projects = await until(() => bySurface('projects'), win => win && !win.webContents.isLoading(), 'Projects overlay did not load');
    const wjs = code => daily.webContents.executeJavaScript(code), pjs = code => projects.webContents.executeJavaScript(code);
    await until(() => wjs(`!!document.querySelector('[data-task="${dailyTask.id}"]')`), Boolean, 'Daily task is missing');
    await until(() => pjs(`!!document.querySelector('[data-task="${projectTask.id}"]')`), Boolean, 'Project task is missing');
    const status = () => js("window.munka.desktop('overlay-status')");
    function checkNativeLayer(result, layer) {
      assert.equal(result.platform, 'darwin'); assert.equal(result.ready, true); assert.equal(result.error, '');
      assert.deepEqual(result.windows.map(win => win.surface).sort(), ['daily', 'projects']);
      for (const win of result.windows) {
        assert.equal(win.layer, layer); assert.equal(win.allSpaces, true); assert.equal(win.nonactivating, true);
        assert.equal(win.level, layer === 'desktop' ? win.desktopLevel : win.floatingLevel);
        if (layer === 'desktop') assert.ok(win.level < win.normalLevel, 'AppKit desktop window must sit below ordinary app windows');
        else assert.ok(win.level > win.normalLevel, 'Floating overlay must sit above ordinary app windows');
      }
    }
    checkNativeLayer(await until(status, result => result.ready && result.windows.length === 2, 'AppKit overlay setup did not finish'), 'desktop');
    // Recover must show overlays without stealing focus from the planner.
    main.show(); main.focus();
    await until(() => main.isFocused(), Boolean, 'Planner could not take focus');
    await js("window.munka.desktop('widget-recover')"); await pause(250);
    assert.equal(main.isFocused(), true); assert.equal(daily.isVisible(), true); assert.equal(projects.isVisible(), true);
    checkNativeLayer(await status(), 'desktop');
    for (const win of [daily, projects]) {
      win.webContents.setBackgroundThrottling(false);
      await win.webContents.insertCSS('*{animation:none!important}');
      const controls = await win.webContents.executeJavaScript(`({handles:document.querySelectorAll('[data-resize-edge]').length,off:!!document.querySelector('[data-action="widget-off"]'),background:getComputedStyle(document.body).backgroundColor,drag:getComputedStyle(document.querySelector('.widget-layout header')).getPropertyValue('-webkit-app-region'),button:getComputedStyle(document.querySelector('[data-action="open-main"]')).getPropertyValue('-webkit-app-region')})`);
      assert.equal(controls.handles, 8); assert.equal(controls.off, true); assert.equal(controls.background, 'rgba(0, 0, 0, 0)');
      assert.equal(controls.drag, 'drag'); assert.equal(controls.button, 'no-drag'); assert.equal(win.isResizable(), false);
    }
    fs.writeFileSync(path.join(evidence, 'daily-desktop.png'), (await daily.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(evidence, 'projects-desktop.png'), (await projects.webContents.capturePage()).toPNG());
    assert.equal((await daily.webContents.capturePage()).toBitmap()[3], 0, 'Native daily surface must preserve transparency');
    // Use the real Electron input path for task controls, not just DOM click().
    async function nativeClick(win, selector) {
      win.focus(); await until(() => win.isFocused(), Boolean, 'Overlay could not take keyboard focus');
      checkNativeLayer(await status(), 'desktop');
      const point = await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control');el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`);
      await win.webContents.executeJavaScript(`window.munka.desktop('widget-hit-test',{surface:${JSON.stringify(win === daily ? 'daily' : 'projects')},interactive:true})`);
      win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    }
    main.hide();
    await nativeClick(daily, `[data-task="${dailyTask.id}"]`);
    await until(() => js("document.querySelector('#detail-form [name=title]')?.value"), title => title === dailyTask.title, 'Daily overlay did not open selected task');
    assert.equal(main.isVisible(), true); await until(() => main.isFocused(), Boolean, 'Task action did not restore planner focus');
    await js("document.querySelector('#close-drawer').click()");
    await nativeClick(projects, `[data-task="${projectTask.id}"]`);
    await until(() => js("document.querySelector('#detail-form [name=title]')?.value"), title => title === projectTask.title, 'Projects overlay did not open selected task');
    await js("document.querySelector('#close-drawer').click()");
    await nativeClick(daily, `[data-complete="${dailyTask.id}"]`);
    await until(() => js('window.munka.load()'), state => state.tasks.find(item => item.id === dailyTask.id)?.status === 'Done', 'Daily completion was not saved');
    await nativeClick(projects, `[data-complete="${projectTask.id}"]`);
    await until(() => js('window.munka.load()'), state => state.tasks.find(item => item.id === projectTask.id)?.status === 'Done', 'Project completion was not saved');
    // Verify persisted movement, resize handles and keyboard adjustment.
    const bounds = daily.getBounds(); daily.setPosition(bounds.x + 20, bounds.y + 20);
    await until(() => js('window.munka.load()'), state => state.preferences.widgetBounds?.x === daily.getBounds().x && state.preferences.widgetBounds?.y === daily.getBounds().y, 'Native movement was not saved');
    await wjs("document.querySelector('.widget-customize').open=true");
    const beforeKeyboard = daily.getBounds();
    await wjs("document.querySelector('[data-overlay-adjust=move]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    await until(() => daily.getBounds(), current => current.x === beforeKeyboard.x + 10, 'Keyboard movement did not change native position');
    await wjs("document.querySelector('[data-overlay-adjust=resize]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    await until(() => daily.getBounds(), current => current.width === beforeKeyboard.width + 10, 'Keyboard resize did not change native width');
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      assert.equal(await wjs(`window.munka.desktop('widget-resize-start',{surface:'daily',edge:'${edge}'})`), true);
      assert.equal(await wjs("window.munka.desktop('widget-resize-update',{surface:'daily'})"), true);
      assert.equal(await wjs("window.munka.desktop('widget-resize-end',{surface:'daily'})"), true);
    }
    await js("window.munka.desktop('widget-size',{surface:'projects',size:'roomy'})");
    assert.equal(projects.getBounds().width, 440);
    const persistedBounds = daily.getBounds();
    // Transparent space and global click-through must reach AppKit, with recovery.
    await wjs("window.munka.desktop('widget-hit-test',{surface:'daily',interactive:false})");
    assert.equal((await status()).windows.find(win => win.surface === 'daily').ignoresMouseEvents, true);
    await wjs("window.munka.desktop('widget-hit-test',{surface:'daily',interactive:true})");
    assert.equal((await status()).windows.find(win => win.surface === 'daily').ignoresMouseEvents, false);
    daily.focus(); await until(() => daily.isFocused(), Boolean, 'Panel did not focus before click-through');
    await js("document.querySelector('[data-view=desktop]').click();document.querySelector('[data-toggle=widgetClickThrough]').click()");
    await until(status, result => result.windows.length === 2 && result.windows.every(win => win.ignoresMouseEvents && !win.focusable), 'Click-through did not reach both native windows');
    assert.equal((await status()).windows.some(win => win.keyWindow), false, 'Click-through retained panel keyboard focus');
    await assert.rejects(wjs("window.munka.desktop('widget-adjust',{surface:'daily',mode:'move',dx:10,dy:0})"), /click through/i);
    const recovery = findMenu('Recover widgets · restore clicks and position'); assert.ok(recovery, 'Menu bar recovery command is missing');
    recovery.click(recovery); await pause(150);
    assert.equal((await js('window.munka.load()')).preferences.widgetClickThrough, false);
    assert.equal(daily.isFocusable(), true); assert.equal(projects.isFocusable(), true);
    // Toggle the placement using the same menu exposed to users.
    const above = findMenu('Keep above apps'); assert.ok(above); above.click(above);
    checkNativeLayer(await until(status, result => result.layer === 'topmost' && result.windows.every(win => win.layer === 'topmost'), 'Floating placement did not apply'), 'topmost');
    fs.writeFileSync(path.join(evidence, 'daily-floating.png'), (await daily.webContents.capturePage()).toPNG());
    const behind = findMenu('On desktop · behind apps'); assert.ok(behind); behind.click(behind);
    checkNativeLayer(await until(status, result => result.layer === 'desktop' && result.windows.every(win => win.layer === 'desktop'), 'Desktop placement did not apply'), 'desktop');
    // Close and reopen the planner through menu bar and Dock activation.
    main.close(); await pause(150); assert.equal(main.isDestroyed(), false); assert.equal(main.isVisible(), false);
    assert.equal(daily.isVisible(), true); assert.equal(projects.isVisible(), true);
    const open = findMenu('Open Munka'); assert.ok(open); open.click(open);
    await until(() => main.isFocused(), Boolean, 'Menu bar did not restore planner focus');
    main.hide(); app.emit('activate'); await until(() => main.isFocused(), Boolean, 'Dock activation did not restore planner focus');
    await wjs("document.querySelector('[data-action=widget-off]').click()");
    await until(() => daily.isDestroyed(), Boolean, 'Daily off did not destroy the window');
    let preferences = (await js('window.munka.load()')).preferences;
    assert.equal(preferences.widget, false); assert.equal(preferences.widgetProjects, true); assert.equal(projects.isDestroyed(), false);
    const dailyOn = findMenu('Daily tasks overlay'); assert.ok(dailyOn); dailyOn.click({ checked: true });
    const restored = await until(() => bySurface('daily'), win => win && !win.webContents.isLoading(), 'Menu bar did not recreate daily overlay');
    assert.deepEqual(restored.getBounds(), persistedBounds, 'Recreating daily overlay lost saved bounds');
    await pjs("document.querySelector('[data-action=widget-off]').click()");
    await until(() => projects.isDestroyed(), Boolean, 'Projects off did not destroy the window');
    preferences = (await js('window.munka.load()')).preferences;
    assert.equal(preferences.widget, true); assert.equal(preferences.widgetProjects, false); assert.equal(restored.isDestroyed(), false);
    const native = await status(); assert.equal(native.windows.length, 1); assert.equal(native.windows[0].surface, 'daily');
    let desktopScreenshot = false;
    try { execFileSync('/usr/sbin/screencapture', ['-x', path.join(evidence, 'mac-desktop.png')], { timeout: 3000 }); desktopScreenshot = fs.existsSync(path.join(evidence, 'mac-desktop.png')); } catch { /* Headless CI may not grant screen capture. Window captures above are required. */ }
    const verification = { passed: true, platform: process.platform, arch: process.arch, packagedApp: false, physicalMacValidated: false, liveAuthentication: false, desktopScreenshot, checks: ['locked planner hides overlays', 'daily and projects actions through Electron input', 'native AppKit desktop and floating window levels', 'nonactivating all-Spaces panels', 'transparent captures and eight resize controls', 'movement and resize persistence', 'native click-through and menu bar recovery', 'close-to-background, menu bar and Dock focus restoration', 'independent off switches and saved-bounds recreation'], native };
    fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify(verification, null, 2));
    console.log(JSON.stringify(verification)); app.quit();
  } catch (error) {
    if (main && !main.isDestroyed()) {
      try { fs.writeFileSync(path.join(evidence, 'failure.json'), JSON.stringify({ error: error.message, native: await main.webContents.executeJavaScript("window.munka.desktop('overlay-status')") }, null, 2)); } catch {}
    }
    console.error(error.stack); app.exit(1);
  }
});
