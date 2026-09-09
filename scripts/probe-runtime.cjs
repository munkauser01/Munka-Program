const { spawn } = require("node:child_process");
const path = require("node:path");
const child = spawn(
  require("electron"),
  [path.resolve("tests/runtime-probe.cjs")],
  {
    cwd: path.resolve(__dirname, ".."),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
const timer = setTimeout(() => child.kill(), 20000);
child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  clearTimeout(timer);
  console.log(JSON.stringify({ exitCode: code, signal }));
  process.exitCode = code === 0 ? 0 : 1;
});
