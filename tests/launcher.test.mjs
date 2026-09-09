import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';

const source = fs.readFileSync(new URL('../scripts/launch.cjs', import.meta.url), 'utf8');
test('launcher preserves spaced paths, clears Electron node mode, and reports failed exits', () => {
  const child = new EventEmitter();
  let invocation;
  const process = { platform: 'win32', env: { ELECTRON_RUN_AS_NODE: '1', OTHER: 'kept' } };
  const errors = [];
  vm.runInNewContext(source, {
    __dirname: 'C:\\Desktop\\Munka Work\\scripts',
    process,
    console: { error: (message) => errors.push(message) },
    require(name) {
      if (name === 'node:path') return path.win32;
      if (name === 'node:fs') return { existsSync: () => true };
      if (name === 'node:child_process') return { spawn: (...args) => { invocation = args; return child; } };
      throw Error(name);
    },
  });
  assert.equal(invocation[1].length, 1);
  assert.equal(invocation[1][0], 'C:\\Desktop\\Munka Work');
  assert.equal(invocation[2].cwd, invocation[1][0]);
  assert.equal(invocation[2].env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(invocation[2].env.OTHER, 'kept');
  child.emit('exit', 49, null);
  assert.equal(process.exitCode, 1);
  assert.equal(errors.length, 1);
});
