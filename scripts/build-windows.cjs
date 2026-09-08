// Stage only application files so local records and scratch files cannot enter a release.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
require("./prepare-assets.cjs");
const root = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(root, "work"), { recursive: true });
const stage = fs.mkdtempSync(path.join(root, "work", "package-"));
fs.copyFileSync(
  path.join(root, "pnpm-lock.yaml"),
  path.join(stage, "pnpm-lock.yaml"),
);
for (const name of ["src", "electron", "assets"]) {
  fs.cpSync(path.join(root, name), path.join(stage, name), { recursive: true });
}
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
delete pkg.devDependencies;
delete pkg.scripts;
pkg.build.directories.output = path.join(root, "outputs", "release");
pkg.build.electronDist = path.join(root, "node_modules", "electron", "dist");
pkg.build.electronVersion = require(
  path.join(root, "node_modules", "electron", "package.json"),
).version;
pkg.build.npmRebuild = false;
fs.writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(pkg, null, 2),
);
execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules", "electron-builder", "cli.js"),
    "--projectDir",
    stage,
    "--win",
    "nsis",
  ],
  { cwd: root, stdio: "inherit" },
);
