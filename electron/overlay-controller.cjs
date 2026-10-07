const { spawn } = require('node:child_process');

// One bounded helper owns only the HWNDs supplied by this Munka process. It exits
// on stdin closure, owner termination, or explicit shutdown; there is no service.
function createOverlayController({ script, ownerPid = process.pid, onError = () => {}, onReady = () => {}, spawnProcess = spawn }) {
  let child, wanted = [], output = '', stopped = false, ready = false, failures = 0, retry, windows = [], lastMessage;
  function send(force = false) {
    const message = JSON.stringify({ windows: wanted }) + '\n';
    if ((force || message !== lastMessage) && child?.stdin?.writable && !child.stdin.destroyed) {
      child.stdin.write(message);
      lastMessage = message;
    }
  }
  function closeChild() {
    if (!child) return;
    const old = child; child = null; ready = false; lastMessage = undefined;
    old.stdin.end();
    const timer = setTimeout(() => { if (old.exitCode === null) old.kill(); }, 1500);
    timer.unref?.();
  }
  function fail(error) {
    ready = false;
    onError(error);
  }
  function start() {
    if (stopped || child || !wanted.length) return;
    output = ''; lastMessage = undefined;
    child = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-OwnerPid', String(ownerPid)], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const launched = child;
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (child !== launched) return;
      output = (output + chunk).slice(-16384);
      let index;
      while ((index = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, index).trim(); output = output.slice(index + 1);
        try {
          const event = JSON.parse(line);
          if (Array.isArray(event.windows)) windows = event.windows;
          if (event.ready) { ready = true; onReady(); }
          if (event.error) fail(Error('Windows could not attach the desktop overlay. Use the tray to recover it.'));
        } catch { /* PowerShell diagnostics are not planner data. */ }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => { if (child === launched) fail(Error('Windows could not start desktop placement. Widgets remain available from the tray.')); });
    child.on('close', () => {
      if (child !== launched) return;
      child = null; ready = false;
      if (!stopped && wanted.length) {
        fail(Error('Desktop placement stopped. Use Recover widgets in the Munka tray menu.'));
        if (++failures <= 2) { retry = setTimeout(start, 1500); retry.unref?.(); }
      }
    });
    send();
  }
  return {
    update(windows) {
      if (stopped) return;
      wanted = windows;
      if (!wanted.length) { clearTimeout(retry); closeChild(); return; }
      start(); send();
    },
    recover() { if (stopped) return; failures = 0; if (!child) start(); else send(true); },
    get ready() { return ready; },
    get windows() { return windows; },
    stop() {
      stopped = true; clearTimeout(retry);
      closeChild();
    },
  };
}

module.exports = { createOverlayController };
