// Launch the actual packaged app with a disposable profile, then exercise its renderer.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), net = require('node:net');
const root = path.resolve(__dirname, '..'), arch = process.argv[2] || process.arch;
if (process.platform !== 'darwin' || arch !== process.arch) throw Error('Use a matching Mac runner.');
const pkg = require('../package.json'), output = path.join(root, 'outputs', 'mac-beta-' + pkg.version);
const executable = path.join(output, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Munka.app', 'Contents', 'MacOS', 'Munka');
if (!fs.existsSync(executable)) throw Error('Build the Mac app before testing it.');
const profile = fs.mkdtempSync(path.join(root, 'work', 'mac-packaged-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const environment = { ...process.env, MUNKA_TEST_DATA: profile, MUNKA_TEST_AUTH_PANEL: 'true' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port], { env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
  let failure = ''; child.stderr.on('data', chunk => { failure = (failure + chunk).slice(-3000); });
  child.on('error', error => { failure = error.message; });
  let socket;
  try {
    let page;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw Error('Packaged app exited before loading: ' + failure);
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.url.endsWith('index.html')); } catch {}
      if (page) break; await pause(150);
    }
    assert.ok(page, 'Packaged app must expose its planner renderer.');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), entry = pending.get(message.id);
      if (!entry) return; pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error || message.result?.exceptionDetails) entry.reject(Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      else entry.resolve(message.result?.result?.value);
    });
    const js = expression => new Promise((resolve, reject) => {
      const request = ++id, timer = setTimeout(() => { pending.delete(request); reject(Error('Packaged app evaluation timed out.')); }, 10000);
      pending.set(request, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: request, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    for (let i = 0; i < 80 && !(await js("!!document.querySelector('#munka-local')")); i++) await pause(150);
    assert.equal(await js("!!document.querySelector('#munka-local')"), true, 'Login gate must appear.');
    await js("document.querySelector('#munka-local').click()"); await pause(500);
    assert.equal(await js("document.querySelector('h1').textContent"), 'Home');
    const version = await js('window.munka.version()'); assert.equal(version.version, pkg.version); assert.equal(version.platform, 'darwin'); assert.equal(version.capabilities.overlays, false);
    await js("document.querySelector('#quick-add [name=title]').value='Packaged Mac task';document.querySelector('#quick-add').requestSubmit()"); await pause(450);
    assert.equal((await js('window.munka.load()')).tasks[0].title, 'Packaged Mac task');
    await js("document.querySelector('[data-view=calendar]').click()"); await pause(300);
    assert.equal(await js("!!document.querySelector('.calendar-workspace')"), true);
    await js("document.querySelector('[data-view=settings]').click()"); await pause(300);
    assert.equal(await js("document.querySelectorAll('[data-view=desktop]').length"), 0);
    const verification = { passed: true, packagedApp: true, version: pkg.version, arch, checks: ['actual packaged executable launches', 'login/local gate', 'task creation and save', 'calendar', 'Mac capabilities/settings'], liveAuthentication: false, physicalMacValidated: false };
    const evidence = path.join(root, 'outputs', 'mac-packaged-' + arch); fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify(verification, null, 2));
    const metadataPath = path.join(output, `build-${arch}.json`), metadata = JSON.parse(fs.readFileSync(metadataPath));
    metadata.macRuntimeValidated = true; metadata.validation = 'Packaged app on matching GitHub macOS runner; physical Mac acceptance pending.';
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(JSON.stringify(verification));
  } finally {
    socket?.close(); child.kill('SIGTERM'); await pause(500);
    if (profile.startsWith(path.join(root, 'work') + path.sep) && path.basename(profile).startsWith('mac-packaged-')) fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
