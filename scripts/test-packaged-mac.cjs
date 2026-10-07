// Launch the actual packaged app and inspect its native AppKit panels via IPC.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), net = require('node:net');
const root = path.resolve(__dirname, '..'), arch = process.argv[2] || process.arch;
if (process.platform !== 'darwin' || arch !== process.arch) throw Error('Use a matching Mac runner.');
const pkg = require('../package.json'), output = path.join(root, 'outputs', 'mac-beta-' + pkg.version);
const executable = path.join(output, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Munka.app', 'Contents', 'MacOS', 'Munka');
if (!fs.existsSync(executable)) throw Error('Build the Mac app before testing it.');
fs.mkdirSync(path.join(root, 'work'), { recursive: true });
const profile = fs.mkdtempSync(path.join(root, 'work', 'mac-packaged-'));
const evidence = path.join(root, 'outputs', 'mac-packaged-' + arch); fs.mkdirSync(evidence, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accepts, label) {
  let value;
  for (let i = 0; i < 100; i++) { value = await read(); if (accepts(value)) return value; await pause(100); }
  throw Error(label + ': ' + JSON.stringify(value));
}
async function connect(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), entry = pending.get(message.id);
    if (!entry) return; pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error || message.result?.exceptionDetails) entry.reject(Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else entry.resolve(message.result);
  });
  socket.addEventListener('close', () => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('Packaged renderer closed.')); } pending.clear(); });
  const request = (method, params) => new Promise((resolve, reject) => {
    const requestId = ++id, timer = setTimeout(() => { pending.delete(requestId); reject(Error('Packaged app evaluation timed out.')); }, 10000);
    pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  return { socket,
    js: async expression => (await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value,
    capture: async file => { const result = await request('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(evidence, file), Buffer.from(result.data, 'base64')); },
  };
}
async function launch() {
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const environment = { ...process.env, MUNKA_TEST_DATA: profile, MUNKA_TEST_AUTH_PANEL: 'true' }; delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port], { env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
  let failure = ''; const connections = [];
  child.stderr.on('data', chunk => { failure = (failure + chunk).slice(-3000); }); child.on('error', error => { failure = error.message; });
  const pages = async () => {
    if (child.exitCode !== null) throw Error('Packaged app exited before loading: ' + failure);
    try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { return []; }
  };
  const stop = async () => {
    for (const connection of connections) connection.socket.close();
    if (child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
    await Promise.race([exited, pause(3000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, pause(1000)]); }
  };
  try {
    const page = await until(async () => (await pages()).find(item => item.url.endsWith('index.html')), Boolean, 'Packaged planner renderer is missing');
    const main = await connect(page); connections.push(main);
    return { main, pages, stop,
      async surface(surface) {
        const page = await until(async () => (await pages()).find(item => item.url.endsWith(surface === 'daily' ? 'widget=1' : 'widget=projects')), Boolean, 'Packaged ' + surface + ' overlay is missing');
        const connection = await connect(page); connections.push(connection); return connection;
      },
    };
  } catch (error) { await stop(); throw error; }
}
function assertNative(status, layer) {
  assert.equal(status.platform, 'darwin'); assert.equal(status.ready, true); assert.equal(status.error, '');
  assert.deepEqual(status.windows.map(win => win.surface).sort(), ['daily', 'projects']);
  for (const win of status.windows) {
    assert.equal(win.layer, layer); assert.equal(win.allSpaces, true); assert.equal(win.nonactivating, true);
    assert.equal(win.level, layer === 'desktop' ? win.desktopLevel : win.floatingLevel);
    assert.ok(layer === 'desktop' ? win.level < win.normalLevel : win.level > win.normalLevel);
  }
}
(async () => {
  let run;
  try {
    run = await launch(); let { js } = run.main;
    await until(() => js("!!document.querySelector('#munka-local')"), Boolean, 'Login gate must appear');
    assert.equal((await run.pages()).some(page => /widget=/.test(page.url)), false, 'Locked planner must hide overlays');
    await js("document.querySelector('#munka-local').click()");
    await until(() => js("document.querySelector('h1')?.textContent"), title => title === 'Home', 'Home did not appear');
    const version = await js('window.munka.version()'); assert.equal(version.version, pkg.version); assert.equal(version.platform, 'darwin');
    assert.equal(version.capabilities.overlays, true); assert.equal(version.capabilities.wallpaper, false); assert.equal(version.capabilities.launchAtLogin, false);
    await js("document.querySelector('#quick-add [name=title]').value='Packaged Mac task';document.querySelector('#quick-add').requestSubmit()");
    await until(() => js('window.munka.load()'), state => state.tasks.some(task => task.title === 'Packaged Mac task'), 'Packaged task did not save');
    const { task, dateKey } = await import('../src/domain.mjs');
    const dailyTask = task({ title: 'Packaged overlay daily task', date: dateKey() });
    const projectTask = task({ title: 'Packaged overlay project task', date: dateKey(), project: 'mac-project' });
    await js(`(async()=>{const s=await window.munka.load();s.tasks.push(...${JSON.stringify([dailyTask,projectTask])});s.projects=[{id:'mac-project',name:'Mac project'}];Object.assign(s.preferences,{widget:true,widgetProjects:true,widgetLayer:'desktop',widgetClickThrough:false,widgetSurface:'seamless',privacy:false,theme:'light'});await window.munka.save(s,s.revision);await window.munka.desktop('widget-recover')})()`);
    const daily = await run.surface('daily'), projects = await run.surface('projects');
    const status = () => js("window.munka.desktop('overlay-status')");
    const nativeDesktop = await until(status, value => value.ready && value.windows.length === 2, 'Packaged AppKit addon did not load'); assertNative(nativeDesktop, 'desktop');
    await until(() => daily.js(`!!document.querySelector('[data-task="${dailyTask.id}"]')`), Boolean, 'Packaged daily task did not render');
    await until(() => projects.js(`!!document.querySelector('[data-task="${projectTask.id}"]')`), Boolean, 'Packaged project task did not render');
    await daily.capture('daily-desktop.png'); await projects.capture('projects-desktop.png');
    for (const [overlay, fixture] of [[daily, dailyTask], [projects, projectTask]]) {
      await overlay.js(`document.querySelector('[data-task="${fixture.id}"]').click()`);
      await until(() => js("document.querySelector('#detail-form [name=title]')?.value"), title => title === fixture.title, 'Packaged overlay did not open selected task');
      await js("document.querySelector('#close-drawer').click()");
      await overlay.js(`document.querySelector('[data-complete="${fixture.id}"]').click()`);
      await until(() => js('window.munka.load()'), state => state.tasks.find(item => item.id === fixture.id)?.status === 'Done', 'Packaged overlay completion did not save');
    }
    await js("document.querySelector('[data-view=calendar]').click()");
    await until(() => js("!!document.querySelector('.calendar-workspace')"), Boolean, 'Packaged calendar did not render');
    await js("document.querySelector('[data-view=desktop]').click()");
    assert.equal(await js("!!document.querySelector('#widget-layer')"), true);
    assert.equal(await js("!!document.querySelector('#wallpaper-heading')"), false); assert.equal(await js("!!document.querySelector('[data-toggle=launchAtLogin]')"), false);
    await run.main.capture('desktop-controls.png');
    await js("document.querySelector('#widget-layer').value='topmost';document.querySelector('#widget-layer').dispatchEvent(new Event('change'))");
    assertNative(await until(status, value => value.layer === 'topmost' && value.windows.every(win => win.layer === 'topmost'), 'Packaged floating placement failed'), 'topmost');
    await js("document.querySelector('[data-toggle=widgetClickThrough]').click()");
    await until(status, value => value.windows.length === 2 && value.windows.every(win => win.ignoresMouseEvents && !win.focusable), 'Packaged click-through did not reach AppKit');
    await js("window.munka.desktop('widget-recover')"); assert.equal((await js('window.munka.load()')).preferences.widgetClickThrough, false);
    await until(status, value => value.windows.every(win => !win.ignoresMouseEvents && win.focusable), 'Packaged recovery did not restore clicks');
    const initialDailyBounds = (await js('window.munka.load()')).preferences.widgetBounds;
    await daily.js("document.querySelector('.widget-customize').open=true;document.querySelector('[data-overlay-adjust=move]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    await until(() => js('window.munka.load()'), state => state.preferences.widgetBounds.x === initialDailyBounds.x + 10, 'Packaged keyboard move did not persist');
    await daily.js("document.querySelector('[data-overlay-adjust=resize]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    await until(() => js('window.munka.load()'), state => state.preferences.widgetBounds.width === initialDailyBounds.width + 10, 'Packaged keyboard resize did not persist');
    await js("window.munka.desktop('widget-size',{surface:'projects',size:'roomy'})");
    const preferences = (await js('window.munka.load()')).preferences; assert.equal(preferences.projectsWidgetBounds.width, 440);
    await run.stop(); run = await launch(); js = run.main.js;
    await until(() => js("!!document.querySelector('#munka-local')"), Boolean, 'Restart login gate did not appear');
    await js("document.querySelector('#munka-local').click()");
    await until(() => js('window.munka.load()'), state => state.tasks.some(item => item.id === dailyTask.id), 'Restart lost planner tasks');
    const restartedDaily = await run.surface('daily'), restartedProjects = await run.surface('projects');
    const restarted = await js('window.munka.load()');
    assert.deepEqual(restarted.preferences.widgetBounds, preferences.widgetBounds); assert.deepEqual(restarted.preferences.projectsWidgetBounds, preferences.projectsWidgetBounds);
    assert.equal(restarted.tasks.find(item => item.id === dailyTask.id).status, 'Done'); assert.equal(restarted.tasks.find(item => item.id === projectTask.id).status, 'Done');
    assertNative(await until(() => js("window.munka.desktop('overlay-status')"), value => value.ready && value.windows.length === 2, 'Restarted packaged native panels did not restore'), 'topmost');
    await restartedDaily.js("document.querySelector('[data-action=widget-off]').click()");
    await until(() => js('window.munka.load()'), state => !state.preferences.widget && state.preferences.widgetProjects, 'Daily off changed the project switch');
    assert.equal((await run.pages()).some(page => page.url.endsWith('widget=projects')), true);
    await restartedProjects.js("document.querySelector('[data-action=widget-off]').click()");
    await until(() => js('window.munka.load()'), state => !state.preferences.widget && !state.preferences.widgetProjects, 'Projects off did not persist');
    const verification = { passed: true, packagedApp: true, version: pkg.version, arch, checks: ['actual packaged executable and native AppKit addon', 'login/local gate hides locked overlays', 'task create and save', 'daily and project task actions', 'calendar and Mac controls', 'desktop and floating AppKit window levels', 'click-through and recovery', 'overlay bounds and completed tasks survive process restart', 'independent off switches'], nativeDesktop, liveAuthentication: false, physicalMacValidated: false };
    fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify(verification, null, 2));
    const metadataPath = path.join(output, `build-${arch}.json`), metadata = JSON.parse(fs.readFileSync(metadataPath));
    metadata.macRuntimeValidated = true; metadata.macOverlayValidated = true; metadata.validation = 'Packaged app and AppKit overlays on matching GitHub macOS runner; physical Mac acceptance pending.';
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2)); console.log(JSON.stringify(verification));
  } catch (error) {
    if (run) {
      try {
        fs.writeFileSync(path.join(evidence, 'failure.json'), JSON.stringify({ error: error.message, native: await run.main.js("window.munka.desktop('overlay-status')") }, null, 2));
        await run.main.capture('failure-planner.png');
      } catch {}
    }
    throw error;
  } finally {
    await run?.stop();
    if (profile.startsWith(path.join(root, 'work') + path.sep) && path.basename(profile).startsWith('mac-packaged-')) fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
