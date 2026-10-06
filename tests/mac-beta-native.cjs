// Actual macOS runner smoke check with a disposable planner and synthetic auth.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(process.platform!=='darwin')throw Error('Run this check on macOS.');
process.env.MUNKA_TEST_DATA=path.resolve('work/mac-smoke-'+Date.now());
process.env.MUNKA_TEST_AUTH_PANEL='true';
require('../electron/account-service.cjs').createAccountService=()=>({status:async()=>({signedIn:false}),providers:async()=>({google:false,email:true}),cancel:()=>({})});
require('../electron/main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    let main;
    for(let i=0;i<100;i++){
      main=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('index.html'));
      if(main&&!main.webContents.isLoading())break;await pause(100);
    }
    assert.ok(main);const js=source=>main.webContents.executeJavaScript(source);
    await pause(300);
    assert.equal(await js("!!document.querySelector('#munka-local')"),true);
    await js("document.querySelector('#munka-local').click()");await pause(300);
    assert.equal(await js("document.querySelector('h1').textContent"),'Home');
    assert.equal(await js("document.querySelectorAll('[data-view=desktop]').length"),0);
    assert.equal(BrowserWindow.getAllWindows().length,1);
    const version=await js('window.munka.version()');assert.equal(version.platform,'darwin');
    assert.equal(version.capabilities.overlays,false);
    await js("document.querySelector('#quick-add [name=title]').value='Mac beta task';document.querySelector('#quick-add').requestSubmit()");await pause(350);
    let state=await js('window.munka.load()');assert.equal(state.tasks[0].title,'Mac beta task');
    await js("document.querySelector('[data-task]').click()");await pause(250);
    await js("document.querySelector('.drawer [name=title]').value='Edited Mac beta task';document.querySelector('#detail-form').requestSubmit()");await pause(350);
    state=await js('window.munka.load()');assert.equal(state.tasks[0].title,'Edited Mac beta task');
    await js("document.querySelector('[data-view=calendar]').click()");await pause(250);
    assert.equal(await js("!!document.querySelector('.calendar-workspace')"),true);
    await js("document.querySelector('[data-view=settings]').click()");await pause(250);
    assert.equal(await js("document.querySelectorAll('[data-view=desktop]').length"),0);
    const output=path.resolve('outputs/mac-native-'+process.arch);fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,checks:['login/local gate','no Windows overlays','task create and edit','calendar','platform-aware settings'],liveAuthentication:false},null,2));
    console.log(JSON.stringify({passed:true,platform:process.platform,arch:process.arch}));app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
