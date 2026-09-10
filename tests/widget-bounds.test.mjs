import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { widgetBounds } = createRequire(import.meta.url)('../electron/widget-bounds.cjs');
const primary = { workArea: { x: 0, y: 0, width: 1280, height: 720 } };
const left = { workArea: { x: -1920, y: 0, width: 1920, height: 1080 } };
test('widget keeps a chosen position on a monitor left of primary', () => {
  const b = { x: -1700, y: 100, width: 360, height: 460 };
  assert.deepEqual(widgetBounds(b, [left, primary], primary), b);
});
test('disconnected monitor and oversized bounds recover inside primary work area', () => {
  const b = widgetBounds({ x: -1700, y: 100, width: 5000, height: 5000 }, [primary], primary);
  assert.deepEqual(b, { x: 0, y: 0, width: 1280, height: 720 });
});
test('scaling or work area change keeps all widget controls reachable', () => {
  assert.deepEqual(widgetBounds({ x: 1200, y: 650, width: 360, height: 460 }, [primary], primary), { x: 920, y: 260, width: 360, height: 460 });
  assert.deepEqual(widgetBounds({ x: NaN }, [primary], primary), { x: 30, y: 30, width: 360, height: 460 });
});
