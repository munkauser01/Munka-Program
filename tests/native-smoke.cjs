// Run with Electron, not node. Uses a disposable planner inside the workspace.
const path = require("node:path"),
  fs = require("node:fs");
process.env.MUNKA_TEST_DATA = path.resolve("work/native-smoke-" + Date.now());
const { app, BrowserWindow } = require("electron");
require("../electron/main.cjs");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    let w;
    for (let i = 0; i < 100; i++) {
      w = BrowserWindow.getAllWindows()[0];
      if (w && !w.webContents.isLoading()) break;
      await delay(100);
    }
    await delay(500);
    w.webContents.setBackgroundThrottling(false);
    w.showInactive();
    await w.webContents.insertCSS("*{animation:none!important}");
    const errors = [];
    w.webContents.on("console-message", (_e, _level, message) => {
      if (message.includes("Error")) errors.push(message);
    });
    await w.webContents.executeJavaScript(
      `(async()=>{let s=await window.munka.load();s.preferences.theme='light';s.preferences.background=false;await window.munka.save(s,s.revision);return true})()`,
    );
    await w.reload();
    await delay(800);
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-action="sample"]')?.click()`,
    );
    await delay(300);
    const count = await w.webContents.executeJavaScript(
      `document.querySelectorAll('.task-row').length`,
    );
    if (count < 4) throw Error("Sample onboarding did not populate tasks");
    await w.webContents.executeJavaScript(
      `document.querySelector('#quick-add input').value='Native persistence check';document.querySelector('#quick-add').requestSubmit()`,
    );
    await delay(300);
    let stored = JSON.parse(
      fs.readFileSync(
        path.join(process.env.MUNKA_TEST_DATA, "planner.json"),
        "utf8",
      ),
    );
    if (!stored.tasks.some((t) => t.title === "Native persistence check"))
      throw Error("Native save failed");
    await w.reload();
    await delay(500);
    const persisted = await w.webContents.executeJavaScript(
      `document.body.innerText.includes('Native persistence check')`,
    );
    if (!persisted) throw Error("Reload lost saved task");
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-action="new-task"]').click();document.querySelector('#detail-form [name=title]').value='Task details smoke';document.querySelector('#detail-form').requestSubmit()`,
    );
    await delay(300);
    if (
      !JSON.parse(
        fs.readFileSync(
          path.join(process.env.MUNKA_TEST_DATA, "planner.json"),
          "utf8",
        ),
      ).tasks.some((t) => t.title === "Task details smoke")
    )
      throw Error("Task form failed");
    await w.webContents.executeJavaScript(
      `(async()=>{const s=await window.munka.load();s.tasks=s.tasks.filter(t=>!['Native persistence check','Task details smoke'].includes(t.title));await window.munka.save(s,s.revision);document.querySelector('#toast').classList.remove('visible')})()`,
    );
    const out = path.resolve(".impeccable/review");
    fs.mkdirSync(out, { recursive: true });
    w.setContentSize(1380, 900);
    await delay(200);
    fs.writeFileSync(
      path.join(out, "desktop.png"),
      (await w.webContents.capturePage()).toPNG(),
    );
    w.setContentSize(900, 760);
    await delay(200);
    fs.writeFileSync(
      path.join(out, "small-desktop.png"),
      (await w.webContents.capturePage()).toPNG(),
    );
    w.setContentSize(1380, 900);
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-action="new-task"]').focus();document.querySelector('[data-action="new-task"]').click()`,
    );
    await delay(200);
    const dialogOk = await w.webContents.executeJavaScript(
      `document.querySelector('.drawer').getAttribute('role')==='dialog'&&document.querySelector('#app').inert`,
    );
    if (!dialogOk) throw Error("Dialog accessibility failed");
    await w.webContents.executeJavaScript(
      `document.getAnimations().forEach(a=>a.finish())`,
    );
    await w.webContents.insertCSS(
      ".drawer{animation:none!important;opacity:1!important;transform:none!important}",
    );
    await delay(300);
    fs.writeFileSync(
      path.join(out, "task-details.png"),
      (await w.webContents.capturePage()).toPNG(),
    );
    await w.webContents.executeJavaScript(
      `document.querySelector('#close-drawer').click()`,
    );
    if (
      !(await w.webContents.executeJavaScript(
        `document.activeElement.dataset.action==='new-task'`,
      ))
    )
      throw Error("Drawer focus did not return");
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-complete]').focus();document.querySelector('[data-complete]').click()`,
    );
    await delay(200);
    if (
      !(await w.webContents.executeJavaScript(
        `document.activeElement.dataset.complete||document.activeElement.closest('#quick-add')`,
      ))
    )
      throw Error("Task completion focus lost");
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-view="settings"]').click();document.querySelector('[data-toggle="dev"]').click()`,
    );
    await delay(200);
    const dev = await w.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-view="dev"]'))`,
    );
    if (!dev) throw Error("Dev mode did not reveal tools");
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-view="calendar"]').click()`,
    );
    await delay(100);
    if (
      (await w.webContents.executeJavaScript(
        `document.querySelectorAll('.calendar-cell').length`,
      )) !== 7
    )
      throw Error("Week calendar failed");
    await w.webContents.executeJavaScript(
      `(async()=>{const s=await window.munka.load();s.preferences.widget=true;await window.munka.save(s,s.revision)})()`,
    );
    await delay(600);
    if (BrowserWindow.getAllWindows().length < 2)
      throw Error("Widget did not open");
    const widget = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('widget=1'));
    const projectsWidget = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('widget=projects'));
    if (!projectsWidget) throw Error('Separate projects kiosk did not open');
    const dragRegions = await widget.webContents.executeJavaScript(`({
      header: getComputedStyle(document.querySelector('.widget-layout header')).getPropertyValue('-webkit-app-region'),
      button: getComputedStyle(document.querySelector('[data-action="widget-position"]')).getPropertyValue('-webkit-app-region')
    })`);
    if (dragRegions.header !== 'drag' || dragRegions.button !== 'no-drag')
      throw Error('Widget drag region blocks controls or is missing');
    const beforeMove = widget.getBounds();
    widget.setPosition(beforeMove.x + 10, beforeMove.y + 10);
    await delay(750);
    const savedBounds = await w.webContents.executeJavaScript(`window.munka.load().then(s => s.preferences.widgetBounds)`);
    if (savedBounds.x !== widget.getBounds().x || savedBounds.y !== widget.getBounds().y)
      throw Error('Widget position was not persisted');
    if (
      !(await widget.webContents.executeJavaScript(
        `document.body.innerText.includes('Your day, in sight.')`,
      ))
    )
      throw Error("Widget renderer failed");
    fs.writeFileSync(
      path.join(out, "widget.png"),
      (await widget.webContents.capturePage()).toPNG(),
    );
    const widgetTitle = await widget.webContents.executeJavaScript(
      `(()=>{const task=document.querySelector('[data-task]');const title=task.querySelector('.task-title').textContent;task.click();return title})()`,
    );
    await delay(300);
    const openedTitle = await w.webContents.executeJavaScript(
      `document.querySelector('#detail-form [name=title]')?.value`,
    );
    if (openedTitle !== widgetTitle)
      throw Error("Widget did not open the selected task in the main window");
    await w.webContents.executeJavaScript(
      `document.querySelector('#close-drawer').click()`,
    );
    const completedWidgetId = await widget.webContents.executeJavaScript(`(() => { const b = document.querySelector('[data-complete]:not(.done)'); const id = b.dataset.complete; b.click(); return id; })()`);
    await delay(400);
    const retained = await widget.webContents.executeJavaScript(`document.querySelector('[data-complete="${completedWidgetId}"]')?.classList.contains('done')`);
    if (!retained) throw Error('Completed task disappeared from widget');
    await w.webContents.executeJavaScript(`window.munka.desktop('widget-size',{surface:'daily',size:'roomy'})`);
    if (widget.getBounds().width < 400) throw Error('Roomy widget preset did not resize');
    await w.webContents.executeJavaScript(`window.munka.desktop('widget-size',{surface:'daily',size:'compact'})`);
    const paper = new BrowserWindow({width:1280,height:720,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    try {
      await paper.loadFile(path.resolve('src/wallpaper.html'));
      const fixture = require('../electron/wallpaper-model.cjs').wallpaperContent(JSON.parse(fs.readFileSync(path.join(process.env.MUNKA_TEST_DATA,'planner.json'),'utf8')),'Friday, Sep 11');
      const logo=fs.readFileSync(path.resolve('assets/munka.png')).toString('base64');
      const bg=require('electron').nativeImage.createFromBitmap(Buffer.alloc(4*16*16,240),{width:16,height:16}).toPNG().toString('base64');
      await paper.webContents.executeJavaScript('window.paint('+JSON.stringify({...fixture,logo,background:bg,mime:'image/png'})+')');
      const rendered=await paper.webContents.executeJavaScript(`({title:document.querySelector('h1')?.textContent,logo:document.querySelector('header img').naturalWidth,checks:document.querySelectorAll('.done .mark svg').length})`);
      if(rendered.title!=='Your day, in sight.' || !rendered.logo || !rendered.checks) throw Error('Wallpaper render failed');
      fs.writeFileSync(path.join(out,'wallpaper.png'),(await paper.webContents.capturePage()).toPNG());
    } finally { paper.destroy(); }
    await w.webContents.executeJavaScript(
      `(async()=>{const s=await window.munka.load();s.preferences.widget=false;await window.munka.save(s,s.revision)})()`,
    );
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          "native task save",
          "reload persistence",
          "task details form",
          "Dev Mode",
          "week calendar",
          "independent widget",
          "widget opens selected task",
        ],
        screenshots: out,
        consoleErrors: errors,
      }),
    );
    app.quit();
  } catch (e) {
    console.error(e.stack);
    app.exit(1);
  }
});

