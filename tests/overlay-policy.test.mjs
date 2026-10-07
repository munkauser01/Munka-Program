import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initialState, validateBackup } from '../src/domain.mjs';
const { resizedOverlay, overlayLayer, stayInBackground } = createRequire(import.meta.url)('../electron/overlay-policy.cjs');
const area = { x: -1280, y: 0, width: 1280, height: 900 };

test('resize respects the left-hand monitor and keeps the opposite corner fixed', () => {
  const start = { bounds: {x:-1000,y:50,width:360,height:460}, cursor:{x:-1000,y:50} };
  assert.deepEqual(resizedOverlay(start, {x:-1500,y:-100}, 'nw', area), {x:-1280,y:0,width:640,height:510});
  assert.deepEqual(resizedOverlay(start, {x:500,y:1000}, 'se', area), {x:-1000,y:50,width:1000,height:850});
  assert.throws(() => resizedOverlay(start,{x:NaN,y:20},'se',area));
});
test('shrinking an overlay keeps its controls reachable', () => {
  const start = { bounds:{x:-1000,y:50,width:360,height:460},cursor:{x:0,y:0} };
  assert.deepEqual(resizedOverlay(start,{x:1000,y:1000},'nw',area),{x:-930,y:250,width:290,height:260});
});
test('independent enabled overlays keep the process available after planner close', () => {
  assert.equal(stayInBackground({background:false,widget:false,widgetProjects:true}),true);
  assert.equal(stayInBackground({background:false,widget:false,widgetProjects:false}),false);
  assert.equal(overlayLayer({widgetLayer:'desktop',alwaysOnTop:true}),'desktop');
});
test('older backups gain seamless appearance without losing explicit off switches or their old design', () => {
  const saved=initialState(); delete saved.preferences.widgetSurface;
  saved.preferences.widget=false; saved.preferences.widgetProjects=false; saved.preferences.widgetDesign='sage';
  const migrated=validateBackup(saved);
  assert.equal(migrated.preferences.widgetSurface,'seamless');
  assert.equal(migrated.preferences.widget,false);
  assert.equal(migrated.preferences.widgetProjects,false);
  assert.equal(migrated.preferences.widgetDesign,'sage');
  migrated.preferences.widgetSurface='panel';
  assert.equal(validateBackup(migrated).preferences.widgetSurface,'panel');
});
