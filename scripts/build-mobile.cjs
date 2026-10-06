// Static allowlist build. No Electron code, secrets, accounts or planner data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const output = path.join(root, 'outputs', 'mobile-beta-' + pkg.version);
require('./prepare-assets.cjs'); require('./prepare-calendar.cjs');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(output, 'src/vendor'), { recursive: true });
fs.mkdirSync(path.join(output, 'assets/navigation'), { recursive: true });
const files = [];
function copy(from, to) { fs.copyFileSync(path.join(root, from), path.join(output, to)); files.push(to); }
for (const name of fs.readdirSync(path.join(root, 'src'))) {
  if (/\.(mjs|css)$/.test(name) || name === 'index.html') copy('src/' + name, 'src/' + name);
}
copy('src/vendor/ical.mjs', 'src/vendor/ical.mjs'); copy('src/vendor/ical-LICENSE', 'src/vendor/ical-LICENSE');
copy('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'src/vendor/supabase.js');
copy('node_modules/@supabase/supabase-js/LICENSE', 'src/vendor/supabase-LICENSE');
for (const name of fs.readdirSync(path.join(root, 'assets/navigation')).filter(name => name.endsWith('.svg'))) copy('assets/navigation/' + name, 'assets/navigation/' + name);
copy('assets/munka.png', 'assets/munka.png');
// Public publishable key only; validate rather than copying arbitrary config.
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(pkg.munkaAccount?.publishableKey || '') || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(pkg.munkaAccount?.url || '')) throw Error('Invalid public Supabase configuration.');
fs.writeFileSync(path.join(output, 'src/web-config.mjs'), 'export const webConfig = Object.freeze(' + JSON.stringify({version:pkg.version,...pkg.munkaAccount}) + ');\n');
// Resize the existing approved logo, without replacing or redrawing the artwork.
const iconEnvironment = { ...process.env }; delete iconEnvironment.ELECTRON_RUN_AS_NODE;
require('node:child_process').execFileSync(require('electron'), [path.join(__dirname, 'prepare-mobile-icons.cjs'), output], { env: iconEnvironment, stdio:'inherit' });
files.push('assets/app-192.png', 'assets/app-512.png');
const manifest = { id:'/', name:'Munka', short_name:'Munka', description:'Your personal planner for school, work and everyday life.',
  start_url:'/src/index.html', scope:'/', display:'standalone', background_color:'#f8f9f7', theme_color:'#f1f4ee',
  icons:[192,512].map(size=>({src:`/assets/app-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'})) };
fs.writeFileSync(path.join(output,'manifest.webmanifest'),JSON.stringify(manifest,null,2));
files.push('manifest.webmanifest');
// A root launcher preserves the offline shell's paths and manifest scope.
fs.writeFileSync(path.join(output,'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=/src/index.html"><title>Munka</title></head><body><a href="/src/index.html">Open Munka</a></body></html>');
files.push('index.html');
// Content hash makes every asset change a new immutable app-shell cache.
const revision = crypto.createHash('sha256');
for (const file of [...files].sort()) revision.update(file).update(fs.readFileSync(path.join(output,file)));
const cacheName = 'munka-shell-' + pkg.version + '-' + revision.digest('hex').slice(0,12);
const paths = files.filter(file=>!file.endsWith('LICENSE')).map(file=>'/' + file);
let worker = fs.readFileSync(path.join(root,'src/service-worker.template.js'),'utf8');
worker = worker.replace('__CACHE_NAME__', JSON.stringify(cacheName)).replace('__APP_SHELL__', JSON.stringify(paths));
fs.writeFileSync(path.join(output,'sw.js'), worker);
const headers = {
  'Cache-Control':'no-cache',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' " + pkg.munkaAccount.url + "; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
};
fs.writeFileSync(path.join(output,'vercel.json'), JSON.stringify({headers:[{source:'/(.*)',headers:Object.entries(headers).map(([key,value])=>({key,value}))}]},null,2));
fs.writeFileSync(path.join(output,'_headers'), '/*\n' + Object.entries(headers).map(([key,value])=>'  '+key+': '+value).join('\n')+'\n');
const artifactFiles = [...files,'sw.js','vercel.json','_headers'].sort().map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex')}));
fs.writeFileSync(path.join(output,'build.json'), JSON.stringify({version:pkg.version,cacheName,cloudSync:false,backgroundAlerts:false,files:artifactFiles},null,2));
console.log('Mobile beta built: ' + output);
