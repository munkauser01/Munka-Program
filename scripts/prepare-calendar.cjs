// Ship the same audited parser to the browser preview and the packaged renderer.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'src/vendor');
fs.mkdirSync(target, { recursive: true });
for (const [from, to] of [['dist/ical.js', 'ical.mjs'], ['LICENSE', 'ical-LICENSE']]) {
  fs.copyFileSync(path.join(root, 'node_modules/ical.js', from), path.join(target, to));
}
