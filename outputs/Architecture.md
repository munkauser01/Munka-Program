# Munka architecture and decisions

## Desktop

Electron 44.2.0 provides Windows windows, tray, notifications, file dialogs, and wallpaper integration. Renderer runs with sandboxing, context isolation, and no Node integration. IPC accepts a narrow set of named actions and checks the sending frame. The packaged UI loads local files and denies new windows and external navigation.

The web renderer uses native HTML controls and ES modules. This keeps the first build small and directly inspectable. Segoe UI is the Windows interface typeface. The approved brand and persistent desktop navigation override alternative visual concepts.

## Local data

Versioned JSON is stored under the app's per-user data directory. Writes use a temporary file and rename. Every save checks a revision number so widget edits cannot silently overwrite main-window changes. Invalid startup data fails closed without replacing the existing file. Backups rotate at startup and hourly, retaining 14 files. Export backups and CSV are user-directed through native save dialogs. JSON imports require a preview and replacement acknowledgement.

Domain operations are separate from rendering. Task deadlines, planned events, and study sessions are distinct records. Recurrence keeps completed occurrences and generates one successor. Automation uses a rule/trigger/task key to prevent repeated execution. Quiet hours are evaluated in local wall time.

## Desktop surfaces

Widget uses another sandboxed renderer sharing the host store. Bounds are retained and recovered if a monitor disappears. Wallpaper uses the user's chosen image and a non-interactive task summary rendered in a hidden window, then Windows IDesktopWallpaper sets the image. Original wallpaper paths are recorded for restoration. Wallpaper changes require an in-app explanation and explicit background selection.

## Sync service

Selected deployment model: a small self-hosted Node.js 24 service with SQLite. No external cloud account has been selected or provisioned. Run `MUNKA_ALLOW_REGISTRATION=true node server/server.mjs` (set the environment variable in your shell first) for a local development service at `http://127.0.0.1:4319`. Registration defaults to disabled. Dockerfile is provided. For remote use, place the service behind an HTTPS reverse proxy, mount persistent `/data`, and back up the SQLite database. Do not expose the plain HTTP development listener to the public Internet.

Authentication uses salted scrypt hashes, random expiring bearer tokens stored hashed on the server, and sign-in rate limits. The desktop host stores sessions separately using Electron safeStorage encryption; browser previews keep tokens in memory. Exported backups exclude credentials. Windows encryption needs verification on a normal installed profile because the test environment reports an OS encryption error. The first sync previews all uploads/downloads. Record revisions prevent stale writes; field-level three-way merges surface conflicting changes for selection. Server history retains recoverable versions. Invitation codes are bound to the recipient's account email and expire in seven days; the app does not send emails automatically. Email verification and account recovery remain production prerequisites.

Personal settings remain local. Shared task exports strip private reminder, course, and dependency details. Only explicitly shared projects and their tasks become visible to invited users. Roles are enforced by the server, not merely by hidden UI controls.

## API

- `POST /auth/register`, `/auth/login`, `/auth/logout`: account/session lifecycle.
- `GET /records`, `PUT /records`: permission-filtered records and atomic revision-checked batches.
- `POST /invitations`, `/invitations/accept`: recipient-bound project invitations.
- `GET /members`, `DELETE /members`: membership inspection and removal/leave.
- `GET /history?id=...`: permission-checked record versions.
- `GET /health`: health probe.

## References

Electron isolation and sandbox choices follow the [official security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [context isolation documentation](https://www.electronjs.org/docs/latest/tutorial/context-isolation). Runtime and builder versions are fixed by the lockfile. Production rollout requires code signing, service hosting, authentication recovery, and completion of the outstanding acceptance scenarios.
