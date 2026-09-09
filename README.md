# Munka

Windows planner for school and daily life. Your day, in sight.

## Development

Requires Node.js 24 and pnpm. Run `pnpm install`, `pnpm start`, `pnpm test`, and `pnpm run pack` to build the per-user Windows installer. If dependency scripts are disabled, run `node node_modules/electron/install.js` after installation. `pnpm preview` opens a browser development preview; Windows integrations require the Electron app. Launch/build scripts reconstruct the original logo assets from the committed payload. Packaging stages only application files.

## Project records

On Windows, `Launch Munka.cmd` starts the source copy with its folder as the working directory and preserves paths containing spaces. Node.js and the Electron runtime must already be installed. It keeps an error message visible when startup fails. This launcher does not disable Electron's sandbox. A running process alone does not establish that the planner loaded; see the startup readiness record.

- [Approved product requirements](outputs/PRD.md)
- [Roadmap and milestone evidence](outputs/Implementation-Status.md)
- [Architecture and decisions](outputs/Architecture.md)
- [Acceptance checklist](outputs/Acceptance.md)
- [Asset inventory](outputs/Asset-Inventory.md)
- [Preview release notes and remaining work](outputs/Release-Notes.md)
- [Design system](DESIGN.md)

The supplied mobile deck provides branding. This product is a Windows desktop application. Real user data, credentials, local backups, and runtime logs are excluded from version control.

## Optional synchronization

The Node.js service in `server/` uses SQLite, password hashing, expiring sessions, invitations, project roles, revision checks, and record history. It requires deployment before PCs can synchronize remotely. See the architecture document for setup and limitations. Local planning does not require a server.

## Release status

This is an early implementation, not a production-certified release. The implementation status and acceptance checklist distinguish tested behavior, manual checks still needed, and remaining PRD gaps.
