// Real renderer and IPC; synthetic account and disposable planner records.
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
process.env.MUNKA_TEST_DATA = path.resolve('work/navigation-' + Date.now());
process.env.MUNKA_TEST_AUTH_PANEL = 'true';
const { app, BrowserWindow } = require('electron');
require('../electron/account-service.cjs').createAccountService = ({ onSignedOut }) => {
  let signedIn = false;
  const status = async () => ({ signedIn, id: signedIn ? 'f1111111-1111-4111-8111-111111111111' : null, email: signedIn ? 'test@example.com' : null, secure: true });
  return { status, providers: async () => ({ google: false }), cancel: () => ({}),
    cloud: async action => action === 'calendar_list' ? {calendars:[],events:[]} : action === 'invitation_list' ? [] : {revision:0,body:null},
    signIn: async () => { signedIn = true; return status(); }, register: async () => ({ confirmationRequired: true }),
    signOut: async () => { signedIn = false; onSignedOut(); return status(); } };
};
require('../electron/main.cjs');
const delay = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    let w;
    for (let n = 0; n < 100; n++) { w = BrowserWindow.getAllWindows().find(x => /index.html$/.test(x.webContents.getURL())); if (w && !w.webContents.isLoading()) break; await delay(100); }
    assert.ok(w); w.webContents.setBackgroundThrottling(false);
    const js = code => w.webContents.executeJavaScript(code);
    const run = async code => { const result = await js(code); await delay(200); return result; };
    const wait = async selector => { for (let n = 0; n < 100; n++) { if (await js(`!!document.querySelector(${JSON.stringify(selector)})`)) return; await delay(100); } throw Error('Missing ' + selector); };
    const errors = []; w.webContents.on('console-message', (_e, _l, message) => { if (/Uncaught|Refused to/.test(message)) errors.push(message); });
    const dir = path.resolve('outputs/navigation-' + require('../package.json').version); fs.mkdirSync(dir, { recursive: true });
    const shot = async (name, width, height) => { w.setContentSize(width, height); await delay(350); assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'), name + ' overflow'); fs.writeFileSync(path.join(dir, name + '.png'), (await w.webContents.capturePage()).toPNG()); };
    await wait('.account-entry'); await run("document.querySelector('#munka-local').click()"); await wait('.shell');
    await run(`(async()=>{const s=await window.munka.load();s.preferences.widget=false;s.preferences.widgetProjects=false;s.preferences.theme='light';await window.munka.save(s,s.revision)})()`);
    assert.deepEqual(await js("Array.from(document.querySelectorAll('.sidebar nav .nav-group')).map(g=>Array.from(g.querySelectorAll('button')).map(b=>b.dataset.view))"), [['today'],['calendar','tasks','courses','projects'],['habits','review','desktop']]);
    assert.equal(await js("document.querySelectorAll('.sidebar nav .nav-divider').length"), 2);
    assert.equal(await js("document.querySelector('h1').textContent"), 'Home');
    for (const view of ['calendar','tasks','courses','projects','habits','review','desktop','today']) {
      await run(`document.querySelector('.sidebar [data-view=${view}]').click()`);
      assert.equal(await js("document.querySelector('.sidebar [aria-current=page]').dataset.view"), view);
    }
    assert.ok(await js("Array.from(document.querySelectorAll('.sidebar nav .nav-icon')).every(i=>i.complete&&i.naturalWidth===24)"));
    await run("document.querySelector('#account-menu-toggle').click()");
    assert.equal(await js("document.querySelector('.account-popover strong').textContent"), 'Local planner');
    await shot('home-local-menu', 1440, 900);
    await run("document.querySelector('h1').click()"); assert.equal(await js("document.querySelector('.account-menu').open"), false);
    w.show(); w.focus(); await run("document.querySelector('#account-menu-toggle').focus()");
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'}); w.webContents.sendInputEvent({type:'char',keyCode:'\r'}); w.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'}); await delay(200);
    assert.equal(await js("document.querySelector('.account-menu').open"), true, await js("JSON.stringify({active:document.activeElement.id,focus:document.hasFocus(),summary:document.querySelector('#account-menu-toggle').outerHTML})"));
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); w.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'}); await delay(200);
    assert.equal(await js("document.querySelector('.account-menu').open"), false); assert.equal(await js('document.activeElement.id'), 'account-menu-toggle');
    await run("document.querySelector('#account-menu-toggle').click();document.querySelector('.account-popover [data-view=settings]').click()");
    await wait('.settings'); assert.equal(await js("document.querySelector('.account-menu').open"), false);
    await run("document.querySelector('#account-menu-toggle').click();document.querySelector('.account-popover [data-action=munka-account]').click()"); await wait('.account-entry');
    await run("document.querySelector('#entry-switch').click()"); assert.ok(await js("document.querySelector('#entry-form [name=email]')&&document.querySelector('#entry-form [name=password]')"));
    await run("document.querySelector('#entry-switch').click();document.querySelector('[name=email]').value='test@example.com';document.querySelector('[name=password]').value='synthetic-password';document.querySelector('#entry-form').requestSubmit()"); await wait('.shell');
    assert.equal(await js("document.querySelector('#account-menu-toggle').textContent.trim()"), 'TE');
    await run("document.querySelector('#account-menu-toggle').click()");
    assert.equal(await js("document.querySelector('.account-popover-identity p').textContent"), 'test@example.com');
    await shot('account-menu-small', 1000, 650);
    assert.ok(await js("document.querySelector('.account-popover').getBoundingClientRect().right<=innerWidth&&document.querySelector('.account-popover').getBoundingClientRect().bottom<=innerHeight"));
    await run("document.querySelector('.account-popover [data-action=munka-account]').click()"); await wait('#munka-signout');
    await run("document.querySelector('#close-drawer').click();document.querySelector('.sidebar [data-view=today]').click();(async()=>{const s=await window.munka.load();s.preferences.theme='dark';await window.munka.save(s,s.revision)})()");
    await run("document.querySelector('#account-menu-toggle').click()"); await shot('home-dark-menu', 1280, 720);
    assert.equal(await js("getComputedStyle(document.querySelector('.nav-icon')).filter"), 'invert(1)');
    await run("document.querySelector('.account-popover [data-action=munka-signout]').click()"); await wait('.account-entry');
    assert.match(await js("window.munka.load().then(()=> 'allowed',e=>e.message)"), /Sign in|Use locally/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({passed:true,checks:['navigation groups and routes','Figma SVGs loaded','local and signed-in account menu','keyboard, Escape and outside click','settings and account details','signup entry','sign-out gate','small/light/dark layout'],screenshots:dir,disposableProfile:process.env.MUNKA_TEST_DATA}));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { app.quit(); }
});
