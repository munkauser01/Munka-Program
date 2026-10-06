import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { platformCapabilities } from '../src/platform.mjs';
const require=createRequire(import.meta.url),{platformPolicy}=require('../electron/platform-policy.cjs');
test('platform policy agrees between renderer and main; Mac disables Windows integrations',()=>{
  for(const platform of ['win32','darwin','linux','web'])assert.deepEqual(platformCapabilities(platform),platformPolicy(platform));
  assert.equal(platformPolicy('darwin').overlays,false);assert.equal(platformPolicy('darwin').wallpaper,false);
  assert.equal(platformPolicy('darwin').notifications,true);assert.equal(platformPolicy('win32').overlays,true);
});
test('Mac packaging includes architecture-specific artifacts and launcher uses Electron package path',()=>{
  const pkg=require('../package.json');assert.deepEqual(pkg.build.mac.target,['zip','dmg']);
  assert.match(pkg.build.mac.artifactName,/\$\{arch\}/);
  assert.match(fs.readFileSync(new URL('../scripts/launch.cjs',import.meta.url),'utf8'),/const executable = require\('electron'\)/);
  const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
  assert.doesNotMatch(preload,/require\(['"]\.\//); // Sandboxed preload supports only built-in modules.
});
