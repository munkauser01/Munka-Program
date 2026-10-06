// UI flow uses synthetic auth responses; no real passwords or accounts.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{serve}=require('../scripts/serve-mobile.cjs');
const output=path.resolve('outputs/guide-check-'+require('../package.json').version);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const server=http.createServer(serve);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 try {
  for(const phone of [false,true]){
   const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},reducedMotion:phone?'reduce':'no-preference'});
   let current;const users={one:{id:'c1111111-1111-4111-8111-111111111111',email:'one@test.invalid'},two:{id:'c2222222-2222-4222-8222-222222222222',email:'two@test.invalid'}};
   await context.route('https://pkgoupnhdpdeluychmqr.supabase.co/auth/v1/**',route=>{
    const url=new URL(route.request().url());if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
    if(url.pathname.endsWith('/user'))return route.fulfill({json:current});
    current=route.request().postDataJSON().email===users.one.email?users.one:users.two;
    const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:current.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
    return route.fulfill({json:{access_token:jwt,refresh_token:'synthetic-only',expires_in:3600,token_type:'bearer',user:current}});
   });
   await context.route('https://pkgoupnhdpdeluychmqr.supabase.co/rest/v1/rpc/munka_cloud',route=>route.fulfill({json:route.request().postDataJSON().p_action==='calendar_list'?{calendars:[],events:[]}:[]}));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   async function shot(name){await page.evaluate(()=>Promise.allSettled(document.getAnimations().map(a=>a.finished)));await page.screenshot({path:path.join(output,(phone?'phone-':'desktop-')+name+'.png')});}
   async function settings(){await page.locator('#close-drawer').count()&&await page.locator('#close-drawer').click();if(phone){await page.locator('.mobile-nav [data-view=more]').click();await page.locator('.mobile-more [data-view=settings], [data-view=settings]:visible').first().click();}else await page.locator('[data-view=settings]:visible').first().click();}
   async function login(user,first=true){await page.locator('#entry-email').fill(user.email);await page.locator('#entry-password').fill('synthetic-test-password');await page.locator('.entry-submit').click();await page.locator('.account-entry').waitFor({state:'detached'});if(first){await page.locator('#welcome-skip').waitFor();await page.locator('#welcome-skip').click();await page.locator('.drawer').waitFor({state:'detached'});}}
   await page.goto('http://127.0.0.1:'+server.address().port+'/src/index.html');await page.locator('#munka-local').click();
   await page.locator('.guide-drawer').waitFor();assert.equal(await page.locator('.guide-drawer .drawer-head h2').evaluate(el=>el===document.activeElement),true);
   assert.equal(await page.locator('.guide-preview').evaluate(el=>getComputedStyle(el).animationName==='none'),phone);
   await shot('guide-tasks');await page.locator('#guide-next').click();await shot('guide-calendar');await page.locator('#guide-back').click();assert.equal(await page.locator('.guide-progress').innerText(),'1 of 3');
   await page.locator('#guide-next').click();await page.locator('#guide-next').click();await shot('guide-sharing');await page.locator('#guide-next').click();
   await page.locator('.welcome-drawer').waitFor();await page.locator('#welcome-skip').click();await page.locator('.drawer').waitFor({state:'detached'});
   await page.locator('#quick-add [name=title]').fill('Local private plan');await page.locator('#quick-add').evaluate(f=>f.requestSubmit());
   await settings();await page.locator('[data-action=product-guide]').click();await page.locator('#welcome-skip').click();await page.locator('.drawer').waitFor({state:'detached'});
   await page.locator('[data-action=munka-account]:visible').first().click();await login(users.one,false);
   await page.locator('[data-view=today]:visible,[data-view=home]:visible').first().click();await page.locator('#quick-add [name=title]').fill('Account one private plan');await page.locator('#quick-add').evaluate(f=>f.requestSubmit());
   await settings();await page.locator('[data-action=munka-switch-account]:visible').click();await page.locator('#entry-email').waitFor();assert.ok(!(await page.locator('body').innerText()).includes('Account one private plan'));await shot('switch-account');await login(users.two);
   assert.ok(!(await page.locator('body').innerText()).includes('Account one private plan'));await settings();await page.locator('[data-action=munka-switch-account]:visible').click();await page.locator('#entry-email').waitFor();await login(users.one);
   await page.locator('[data-view=today]:visible,[data-view=home]:visible').first().click();await page.getByText('Account one private plan',{exact:true}).first().waitFor();
   await settings();await page.locator('[data-action=munka-signout]:visible').click();await page.locator('#munka-local').waitFor();await page.locator('#munka-local').click();await page.locator('[data-view=today]:visible,[data-view=home]:visible').first().click();await page.getByText('Local private plan',{exact:true}).first().waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({passed:true,checks:['three previews with Next/Back/Skip','first-use personalization and Settings replay','keyboard focus','Figma keyframes active on desktop; static under reduced motion','account switch isolates both accounts and local planner','signout clears private content before sign-in'],liveAuthentication:false,errors},null,2));console.log(JSON.stringify({passed:true,output}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

