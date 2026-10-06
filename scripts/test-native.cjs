// Require both a successful process exit and the smoke test's completion evidence.
const { spawn } = require("node:child_process");
const path = require("node:path");
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require("electron"),
  [process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../tests/native-smoke.cjs")],
  {
    cwd: path.resolve(__dirname, ".."),
    windowsHide: true,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let passed = false;
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
  passed = output.includes('"passed":true');
});
child.stderr.pipe(process.stderr);
const timer = setTimeout(() => {
  console.error("Native smoke test exceeded 60 seconds.");
  child.kill();
}, 60000);
child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  clearTimeout(timer);
  console.log(
    JSON.stringify({ nativeExitCode: code, signal, completed: passed }),
  );
  process.exitCode = code === 0 && passed ? 0 : 1;
});
