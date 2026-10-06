// Real browser verification; only synthetic records and intercepted auth responses.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {serve}=require('../scripts/serve-mobile.cjs');
const output=path.resolve('outputs/mobile-check-'+require('../package.json').version);fs.mkdirSync(output,{recursive:true});
const server=http.createServer(serve);
const errors=[],checks=[];
let lastPage;
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:process.env.MUNKA_TEST_BROWSER||'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const user={id:'b48bc5d7-9d38-4444-8c91-daa843d56fd1',email:'beta@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-05T00:00:00Z'};
    await context.route('https://pkgoupnhdpdeluychmqr.supabase.co/auth/v1/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/signup'))return route.fulfill({json:{user,session:null}});
      if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
      if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
      const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
      return route.fulfill({json:{access_token:jwt,refresh_token:'synthetic-test-token',expires_in:3600,token_type:'bearer',user}});
    });
    await context.route('https://pkgoupnhdpdeluychmqr.supabase.co/rest/v1/rpc/munka_cloud',route=>route.fulfill({json:route.request().postDataJSON().p_action==='calendar_list'?{calendars:[],events:[]}:[]}));
    const page=await context.newPage();
    lastPage=page;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',msg=>{if(msg.type()==='error'&&/Refused|Content Security/.test(msg.text()))errors.push(msg.text());});
    async function screenshot(name){await page.evaluate(()=>Promise.allSettled(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished)));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
    async function fits(name){const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.content<=width.viewport+1,name+' overflow '+JSON.stringify(width));}
    await page.goto(origin+'/src/index.html');await page.locator('#munka-local').waitFor();await fits('login');await screenshot('phone-login');
    await page.locator('#entry-switch').click();await page.locator('#entry-email').fill(user.email);await page.locator('#entry-password').fill('synthetic-password-only');await page.locator('#entry-confirm').fill('synthetic-password-only');
    await page.locator('.entry-submit').click();await page.getByText('Check your email for a confirmation link.',{exact:false}).waitFor();checks.push('Signup confirmation keeps planner gated');
    await page.locator('#munka-local').click();await page.locator('#welcome-skip').click();await page.locator('#welcome-skip').waitFor({state:'hidden'});await page.locator('.mobile-nav').waitFor();
    await page.locator('#quick-add [name=title]').fill('Prepare the biology presentation');await page.locator('#quick-add [type=submit]').click();await page.getByText('Prepare the biology presentation',{exact:true}).first().waitFor();
    await fits('home');await screenshot('phone-home');
    await page.locator('[data-action=new-task]').first().click();await page.locator('.drawer [name=title]').fill('Review chapter notes');await page.locator('.drawer [name=notes]').fill('A synthetic task for mobile verification.');
    await fits('editor');await screenshot('phone-editor');await page.locator('.drawer [type=submit]').click();await page.locator('.drawer').waitFor({state:'detached'});checks.push('Touch capture and full-screen task editor save');
    await page.locator('.mobile-nav [data-view=calendar]').click();await fits('calendar');await screenshot('phone-calendar');
    for(const mode of ['day','week','month','agenda']){await page.locator(`[data-calendar-mode=${mode}]`).click();await fits('calendar '+mode);}checks.push('All calendar modes keep overflow within the calendar scroller');
    await page.locator('.mobile-nav [data-view=more]').click();await screenshot('phone-more');
    for(const view of ['courses','projects','habits','review','settings']){
      await page.locator(`[data-view=${view}]`).last().click();await fits(view);
      if(view==='settings'){assert.equal(await page.locator('[data-action=test-notification]').count(),0);await screenshot('phone-settings');}
      await page.locator('.mobile-nav [data-view=more]').click();
    }checks.push('All secondary destinations reachable; unavailable desktop settings omitted');
    await page.locator('.mobile-nav [data-view=tasks]').click();await page.locator('[data-task]').first().click();await page.locator('#close-drawer').click();
    await page.reload();await page.locator('#munka-local').click();await page.locator('.task-title').first().waitFor();assert.ok(await page.locator('.task-title').count()>=2);checks.push('Device records survive reload');
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);await page.reload();await page.locator('#munka-local').click();await page.locator('#quick-add [name=title]').fill('Offline capture');await page.locator('#quick-add [type=submit]').click();await page.getByText('Offline capture',{exact:true}).first().waitFor();
    await page.reload();await page.locator('#munka-local').click();await page.getByText('Offline capture',{exact:true}).first().waitFor();checks.push('Installed shell reloads offline and persists new tasks');
    await context.setOffline(false);
    for(const [name,width,height] of [['phone-small',320,720],['phone-landscape',844,390],['tablet',820,1180],['desktop',1440,900]]){await page.setViewportSize({width,height});await fits(name);await screenshot(name);}
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});await fits('dark');await screenshot('phone-dark');
    // Browser tokens must not land in device storage; signed-in records isolated from local.
    await page.locator('#account-menu-toggle').click();await page.locator('[data-action=munka-account]').last().click();await page.locator('#entry-email').fill(user.email);await page.locator('#entry-password').fill('synthetic-password-only');await page.locator('.entry-submit').click();await page.locator('.mobile-nav').waitFor();
    if(await page.locator('#welcome-skip').count())await page.locator('#welcome-skip').click();assert.equal(await page.locator('.task-title').count(),0);
    const keys=await page.evaluate(()=>Object.keys(localStorage));assert.ok(keys.every(key=>!key.startsWith('sb-')));checks.push('SDK email login works against intercepted API; no tokens persisted; account records isolated');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({passed:true,checks,errors,liveAuthentication:false,realPhoneValidated:false,macRuntimeValidated:false},null,2));
    console.log(JSON.stringify({passed:true,checks,output}));await context.close();
  }catch(error){console.error(JSON.stringify({errors,visible:lastPage?await lastPage.locator('body').innerText():''}));throw error;}
  finally{await browser.close();server.close();}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1;});
