// Test the actual Windows executable without touching the user's planner profile.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const output=path.resolve(root,process.argv[2]||'outputs/release-'+pkg.version);
const executable=path.join(output,'win-unpacked/Munka.exe');
if(process.platform!=='win32'||!fs.existsSync(executable))throw Error('Build the Windows beta before testing it.');
const profile=fs.mkdtempSync(path.join(root,'work','windows-picker-'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const env={...process.env,MUNKA_TEST_DATA:profile,MUNKA_TEST_AUTH_PANEL:'true'};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let failure='',socket;child.stderr.on('data',chunk=>failure=(failure+chunk).slice(-1500));child.on('error',error=>failure=error.message);
  try{
    let page;for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error('Packaged app exited: '+failure);
      try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(item=>item.url.endsWith('index.html'));}catch{}
      if(page)break;await pause(100);
    }
    assert.ok(page,'Planner renderer must load');socket=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let sequence=0;const pending=new Map();
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);if(message.error||message.result?.exceptionDetails)entry.reject(Error(JSON.stringify(message.error||message.result.exceptionDetails)));else entry.resolve(message.result?.result?.value);});
    const js=expression=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Renderer evaluation timed out'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
    for(let i=0;i<80&&!(await js("!!document.querySelector('#munka-local')"));i++)await pause(100);
    assert.equal(await js("!!document.querySelector('#munka-local')"),true);
    await js("document.querySelector('#munka-local').click()");await pause(500);
    assert.equal((await js('window.munka.version()')).version,pkg.version);
    await js("document.querySelector('#welcome-skip')?.click()");await pause(200);
    await js("document.querySelector('[data-view=calendar]').click()");await pause(150);
    assert.equal(await js("!!document.querySelector('#calendar-picker-trigger')"),true);
    await js("document.querySelector('#calendar-picker-trigger').click()");
    assert.equal(await js("document.querySelector('#calendar-picker-trigger').getAttribute('aria-expanded')"),'true');
    await js("document.querySelector('[data-calendar-choice=personal]').click()");
    assert.equal(await js("document.querySelector('#calendar-picker-trigger').textContent.trim()"),'My planner');
    await js("document.querySelector('#calendar-quick-add [name=title]').value='Packaged picker task';document.querySelector('#calendar-quick-add').requestSubmit()");await pause(250);
    assert.equal((await js('window.munka.load()')).tasks.some(task=>task.title==='Packaged picker task'),true);
    assert.equal(await js("!!document.querySelector('[data-cal-action=share-current]')"),true);
    const evidence={passed:true,version:pkg.version,platform:'win32',checks:['actual executable and login/local gate','custom picker opens and selects personal planner','personal task creation','visible sharing action'],liveAuthentication:false};
    fs.writeFileSync(path.join(output,'packaged-picker-verification.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
  }finally{
    socket?.close();child.kill();await pause(300);
    const absolute=path.resolve(profile);if(absolute.startsWith(path.join(root,'work')+path.sep)&&path.basename(absolute).startsWith('windows-picker-'))fs.rmSync(absolute,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
