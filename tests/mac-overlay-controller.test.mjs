import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createMacOverlayController } = createRequire(import.meta.url)('../electron/mac-overlay-controller.cjs');

function windowFixture(number) {
  const state = { destroyed: false, visible: true, focusable: true, ignore: false, level: 0 };
  const handle = Buffer.alloc(8); handle.writeBigUInt64LE(BigInt(number));
  return { state, handle, win: {
    isDestroyed: () => state.destroyed, isVisible: () => state.visible, isFocusable: () => state.focusable,
    getNativeWindowHandle() { assert.equal(state.destroyed, false, 'Destroyed windows must never be dereferenced'); return handle; },
  } };
}

test('Mac placement uses only owned live window handles and reports live Electron/AppKit state', () => {
  const daily = windowFixture(1), projects = windowFixture(2), placed = [];
  const lookup = handle => handle === daily.handle ? daily.state : projects.state;
  const binding = {
    apply(handle, layer) { placed.push([handle, layer]); lookup(handle).level = layer === 'desktop' ? -2147483602 : 3; },
    inspect(handle) { const state = lookup(handle); return { level: state.level, ignoresMouseEvents: state.ignore, allSpaces: true }; },
  };
  let readyCalls = 0, loads = 0;
  const controller = createMacOverlayController({ loadBinding: () => { loads++; return binding; }, onReady: () => readyCalls++ });
  controller.update([{ win: daily.win, surface: 'daily', layer: 'desktop' }, { win: projects.win, surface: 'projects', layer: 'topmost' }]);
  assert.equal(loads, 1); assert.equal(readyCalls, 1); assert.equal(controller.ready, true);
  assert.deepEqual(placed, [[daily.handle, 'desktop'], [projects.handle, 'topmost']]);
  daily.state.ignore = true; daily.state.focusable = false; projects.state.visible = false;
  assert.deepEqual(controller.windows.map(({surface,ignoresMouseEvents,focusable,visible}) => ({surface,ignoresMouseEvents,focusable,visible})), [
    {surface:'daily',ignoresMouseEvents:true,focusable:false,visible:true}, {surface:'projects',ignoresMouseEvents:false,focusable:true,visible:false},
  ]);
  daily.state.destroyed = true;
  controller.update([{ win: daily.win, surface: 'daily', layer: 'desktop' }, { win: projects.win, surface: 'projects', layer: 'desktop' }]);
  assert.deepEqual(controller.windows.map(window => window.surface), ['projects']); assert.deepEqual(placed.at(-1), [projects.handle, 'desktop']);
  controller.update([]); assert.equal(controller.ready, false); assert.deepEqual(controller.windows, []);
  controller.stop(); controller.update([{ win: projects.win, surface: 'projects', layer: 'topmost' }]); controller.recover();
  assert.equal(controller.ready, false); assert.deepEqual(controller.windows, []); assert.equal(loads, 1);
});

test('Mac native load and placement failures remain recoverable and do not expose native diagnostics', () => {
  const daily = windowFixture(1), errors = [];
  let mode = 'load-fails', loads = 0, readyCalls = 0;
  const controller = createMacOverlayController({
    loadBinding() {
      loads++; if (mode === 'load-fails') throw Error('Private native loader details');
      return { apply() { if (mode === 'apply-fails') throw Error('Private native apply details'); }, inspect() { return { level: -2147483602 }; } };
    }, onError: error => errors.push(error), onReady: () => readyCalls++,
  });
  controller.update([{ win: daily.win, surface: 'daily', layer: 'desktop' }]);
  assert.equal(controller.ready, false); assert.deepEqual(controller.windows, []);
  assert.match(errors[0].message, /Mac desktop placement is unavailable/); assert.doesNotMatch(errors[0].message, /Private/);
  mode = 'apply-fails'; controller.recover(); assert.equal(controller.ready, false); assert.equal(errors.length, 2); assert.deepEqual(controller.windows, []);
  mode = 'ready'; controller.recover(); assert.equal(controller.ready, true); assert.equal(readyCalls, 1); assert.equal(loads, 3);
  assert.equal(controller.windows[0].surface, 'daily');
  controller.recover(); assert.equal(controller.ready, true); assert.equal(readyCalls, 2, 'Recovery must clear stale renderer errors even when native placement was already ready'); assert.equal(loads, 4);
  controller.stop(); controller.recover(); assert.equal(loads, 4);
});
