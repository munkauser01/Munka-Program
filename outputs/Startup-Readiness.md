# Startup investigation — Munka 0.1.1

## Evidence

- The Electron 44.2.0 archive matches the checksum shipped with its package. All 73 extracted runtime files match the archive; no missing or modified files were found.
- A minimal application, independent of Munka and using a fresh test profile, fails when launched through the local restricted execution environment. It reports GPU child exit `-1073741515` and renderer `launch-failed`, exit `49`. Windows encryption also reports an error. These symptoms do not establish a hardware/driver defect or a corrupt installation.
- The same minimal sandboxed runtime check passes on GitHub's Windows runner without compatibility flags. The full native Munka interaction test passes there too.
- [Windows run 3](https://github.com/munkauser01/Munka-Program/actions/runs/34305246726) also installs 0.1.1 into an isolated directory, confirms the executable and unpacked wallpaper helper exist, opens the installed renderer, and verifies a second launch exits while the primary instance stays running.

The evidence points to a difference in the local launch environment. A successful launch in the user's ordinary Windows desktop session remains unconfirmed. Earlier claims that the GPU workaround worked or that a process list proved the app was open were incorrect.

## Changes

- Added a single-instance lock so repeated launches reuse the existing planner.
- Added bounded startup logs containing runtime events, never task content or credentials.
- A failed main renderer now exits instead of leaving a hidden process running.
- Native tests require an explicit success result and a successful process exit.
- Installed-app validation checks the actual installation path and planner readiness.
- No sandbox-disabling or GPU workaround flags are part of the shipped application.

## Next local acceptance

Download the newest successful GitHub Windows preview artifact and start its installer from Windows directly. Verify a visible, usable Today screen and the widget. If it still crashes, collect the exact error and Munka's `startup.log` from its user-data directory; do not repeatedly launch copies or stop unrelated Electron applications.

Do not describe Munka as production-ready yet. Wallpaper restoration, sleep/restart notification behavior, real multi-monitor testing, full accessibility checks, and production sync hosting remain open.
