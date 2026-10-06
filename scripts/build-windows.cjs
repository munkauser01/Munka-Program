// Stage only application files so local records and scratch files cannot enter a release.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
require("./prepare-assets.cjs");
require("./prepare-calendar.cjs");
const root = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(root, "work"), { recursive: true });
const stage = fs.mkdtempSync(path.join(root, "work", "package-"));
// A nested workspace boundary keeps pnpm from changing the source checkout's dependencies.
fs.writeFileSync(path.join(stage, 'pnpm-workspace.yaml'), "packages:\n  - .\n");
fs.copyFileSync(
  path.join(root, "pnpm-lock.yaml"),
  path.join(stage, "pnpm-lock.yaml"),
);
for (const name of ["src", "electron", "assets"]) {
  fs.cpSync(path.join(root, name), path.join(stage, name), { recursive: true });
}
fs.mkdirSync(path.join(stage, 'server'));
fs.copyFileSync(path.join(root, 'server/ai-planner.mjs'), path.join(stage, 'server/ai-planner.mjs'));
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
delete pkg.scripts;
// Only the public service origin belongs in the installer. Server secrets never do.
const aiOrigin = process.env.MUNKA_AI_PUBLIC_URL || pkg.munkaAIUrl || '';
if (aiOrigin) {
  const { serviceURL } = require('../electron/managed-ai-service.cjs');
  pkg.munkaAIUrl = serviceURL(aiOrigin);
  if (!pkg.munkaAIUrl.startsWith('https://')) throw Error('A release AI service must use HTTPS.');
}
const calendarClientIds={...pkg.calendarClientIds};
for(const [provider,key] of [['google','MUNKA_GOOGLE_CLIENT_ID'],['outlook','MUNKA_OUTLOOK_CLIENT_ID']]) {
  const value=process.env[key];
  if(value){if(!/^[A-Za-z0-9._-]{1,300}$/.test(value))throw Error('Invalid public calendar client ID.');calendarClientIds[provider]=value;}
}
if(Object.keys(calendarClientIds).length)pkg.calendarClientIds=calendarClientIds;
pkg.build.directories.output = process.env.MUNKA_BUILD_OUTPUT || path.join(root, "outputs", "release");
pkg.build.electronDist = path.join(root, "node_modules", "electron", "dist");
pkg.build.electronVersion = require(
  path.join(root, "node_modules", "electron", "package.json"),
).version;
pkg.build.npmRebuild = false;
fs.writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(pkg, null, 2),
);
// Materialize the full production dependency tree in the clean staging directory.
// Resolving only top-level workspace symlinks can silently omit DOCX/PDF dependencies.
const pnpmArgs=['install','--prod','--frozen-lockfile','--ignore-scripts','--config.node-linker=hoisted'];
if(process.env.MUNKA_ALLOW_ONLINE_INSTALL!=='true')pnpmArgs.push('--offline');
if(process.env.MUNKA_PNPM_STORE)pnpmArgs.push('--store-dir',process.env.MUNKA_PNPM_STORE);
if(process.platform==='win32') {
  const args=['-NoProfile','-NonInteractive','-File',path.join(root,'scripts/install-package-dependencies.ps1')];
  if(process.env.MUNKA_PNPM_STORE)args.push('-StorePath',process.env.MUNKA_PNPM_STORE);
  execFileSync('powershell.exe',args,{cwd:stage,stdio:'inherit',windowsHide:true});
} else execFileSync('pnpm',pnpmArgs,{cwd:stage,stdio:'inherit'});
delete pkg.devDependencies;
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(pkg,null,2));
execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules", "electron-builder", "cli.js"),
    "--projectDir",
    stage,
    "--win",
    "nsis",
    "--publish",
    "never",
  ],
  { cwd: root, stdio: "inherit" },
);
