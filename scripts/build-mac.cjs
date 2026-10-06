// Build on macOS so native optional dependencies and DMG tooling match the host.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'darwin') {
  console.error('Build the Mac beta on a Mac or with the included macOS CI workflow. Windows cannot verify Mac native dependencies or create the signed distribution.');
  process.exit(1);
}
const arch = process.argv[2] || process.arch;
if (!['arm64', 'x64'].includes(arch)) throw Error('Choose arm64 (Apple Silicon) or x64 (Intel).');
if (arch !== process.arch) throw Error('Use a matching Mac/CI runner for this architecture so native dependencies are correct.');
require('./prepare-assets.cjs'); require('./prepare-calendar.cjs');
fs.mkdirSync(path.join(root, 'work'), { recursive: true });
const stage = fs.mkdtempSync(path.join(root, 'work', 'mac-package-'));
try {
  for (const folder of ['src', 'electron', 'assets']) fs.cpSync(path.join(root, folder), path.join(stage, folder), { recursive: true });
  const iconEnvironment = { ...process.env }; delete iconEnvironment.ELECTRON_RUN_AS_NODE;
  execFileSync(require('electron'), [path.join(__dirname, 'prepare-mobile-icons.cjs'), stage], { env: iconEnvironment, stdio: 'inherit' });
  fs.mkdirSync(path.join(stage, 'server'));
  fs.copyFileSync(path.join(root, 'server/ai-planner.mjs'), path.join(stage, 'server/ai-planner.mjs'));
  fs.copyFileSync(path.join(root, 'pnpm-lock.yaml'), path.join(stage, 'pnpm-lock.yaml'));
  fs.writeFileSync(path.join(stage, 'pnpm-workspace.yaml'), 'packages:\n  - .\n');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  delete pkg.scripts;
  pkg.build.electronVersion = require('electron/package.json').version;
  pkg.build.electronDist = path.join(root, 'node_modules/electron/dist');
  pkg.build.directories.output = process.env.MUNKA_BUILD_OUTPUT || path.join(root, 'outputs', 'mac-beta-' + pkg.version);
  pkg.build.npmRebuild = false;
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  execFileSync('pnpm', ['install', '--prod', '--frozen-lockfile', '--ignore-scripts', '--config.node-linker=hoisted'], { cwd: stage, stdio: 'inherit' });
  delete pkg.devDependencies;
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  execFileSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--projectDir', stage, '--mac', 'zip', 'dmg', '--' + arch, '--publish', 'never'],
    { cwd: root, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  const output = pkg.build.directories.output;
  const artifacts = fs.readdirSync(output).filter(name => /\.(zip|dmg)$/.test(name)).map(name => {
    const bytes = fs.readFileSync(path.join(output, name));
    return { name, bytes: bytes.length, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') };
  });
  if (!artifacts.length) throw Error('No Mac beta artifacts were created.');
  fs.writeFileSync(path.join(output, `build-${arch}.json`), JSON.stringify({ version: pkg.version, arch, signed: false, notarized: false, macRuntimeValidated: false, artifacts }, null, 2));
} finally {
  if (stage.startsWith(path.join(root, 'work') + path.sep) && path.basename(stage).startsWith('mac-package-')) fs.rmSync(stage, { recursive: true, force: true });
}
