import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { platformCapabilities } from '../src/platform.mjs';
import { desktopView } from '../src/desktop-view.mjs';
const require=createRequire(import.meta.url),{platformPolicy}=require('../electron/platform-policy.cjs');
test('platform policy agrees between renderer and main; Mac supports overlays without Windows integrations',()=>{
  for(const platform of ['win32','darwin','linux','web'])assert.deepEqual(platformCapabilities(platform),platformPolicy(platform));
  assert.equal(platformPolicy('darwin').overlays,true);assert.equal(platformPolicy('darwin').wallpaper,false);
  assert.equal(platformPolicy('darwin').launchAtLogin,false);assert.equal(platformPolicy('win32').launchAtLogin,true);
  assert.equal(platformPolicy('darwin').notifications,true);assert.equal(platformPolicy('win32').overlays,true);
});

test('Mac desktop controls expose both overlays and recovery without Windows-only controls',()=>{
  const render=platform=>desktopView({state:{preferences:{widget:true,widgetProjects:true,widgetLayer:'desktop'}},displays:[],capabilities:platformCapabilities(platform),heading:title=>title,toggle:(key,label)=>`<button data-toggle="${key}">${label}</button>`,appearance:()=>'',esc:value=>String(value)});
  const mac=render('darwin');
  for(const key of ['widget','widgetProjects','widgetClickThrough','background'])assert.match(mac,new RegExp(`data-toggle="${key}"`));
  assert.match(mac,/id="widget-layer"/);assert.match(mac,/data-action="widget-recover"/);assert.match(mac,/menu bar/);
  assert.doesNotMatch(mac,/wallpaper-heading|wallpaper-preview|data-toggle="launchAtLogin"|Start with Windows/);
  const windows=render('win32');assert.match(windows,/wallpaper-heading/);assert.match(windows,/data-toggle="launchAtLogin"/);
});
test('Mac packaging includes architecture-specific artifacts and launcher uses Electron package path',()=>{
  const pkg=require('../package.json');assert.deepEqual(pkg.build.mac.target,['zip','dmg']);
  assert.match(pkg.build.mac.artifactName,/\$\{arch\}/);
  assert.match(fs.readFileSync(new URL('../scripts/launch.cjs',import.meta.url),'utf8'),/const executable = require\('electron'\)/);
  const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
  assert.doesNotMatch(preload,/require\(['"]\.\//); // Sandboxed preload supports only built-in modules.
});
