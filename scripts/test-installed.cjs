// Runs only on the disposable GitHub Windows runner; never installs on a developer PC.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
if (process.env.GITHUB_ACTIONS !== "true")
  throw Error(
    "Installed-app test requires a disposable GitHub Actions runner.",
  );
const root = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const installDir = path.join(root, "work", "installed-preview");
const profile = path.join(root, "work", "installed-profile");
function run(exe, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: "inherit" });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Process timed out"));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Exit code: " + code));
    });
  });
}
(async () => {
  await run(path.join(root, "outputs/release", `Munka Setup ${version}.exe`), [
    "/S",
    "/currentuser",
    "/D=" + installDir,
  ]);
  const exe = path.join(installDir, "Munka.exe");
  if (!fs.existsSync(exe))
    throw Error("Installer exited but expected application was not created.");
  if (
    !fs.existsSync(
      path.join(
        installDir,
        "resources/app.asar.unpacked/electron/wallpaper.ps1",
      ),
    )
  )
    throw Error("Wallpaper helper missing from installed package.");
  const child = spawn(exe, [], {
    windowsHide: true,
    env: { ...process.env, MUNKA_TEST_DATA: profile },
    stdio: "inherit",
  });
  try {
    const logFile = path.join(profile, "startup.log");
    let loaded = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw Error("Installed app exited before readiness.");
      if (
        fs.existsSync(logFile) &&
        fs.readFileSync(logFile, "utf8").includes('"event":"main-renderer-ready"')
      ) {
        loaded = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!loaded) throw Error("Installed renderer did not load.");
    await new Promise((resolve, reject) => {
      const second = spawn(exe, [], {
        windowsHide: true,
        env: { ...process.env, MUNKA_TEST_DATA: profile },
        stdio: "inherit",
      });
      const timer = setTimeout(() => {
        second.kill();
        reject(Error("Second instance did not exit"));
      }, 10000);
      second.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      second.once("exit", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error("Second launch failed"));
      });
    });
    if (child.exitCode !== null) throw Error("Primary instance disappeared.");
    console.log(
      JSON.stringify({
        installed: true,
        sandboxedStartup: true,
        singleInstance: true,
        wallpaperHelper: true,
      }),
    );
  } finally {
    child.kill();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
