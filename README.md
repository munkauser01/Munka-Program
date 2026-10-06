# Munka

Planner for school and daily life. Your day, in sight.

## Mac and mobile beta — 0.12.0-beta.1

The new source adds Mac build targets and an installable mobile web app. Installed Windows remains 0.11.7. Run `pnpm build:mobile` then `pnpm mobile` for the local phone-layout preview. Phone installation needs an HTTPS-hosted preview. Both Apple Silicon and Intel ZIP/DMG builds passed source and actual packaged-app smoke checks on macOS; downloads and verification are in the [beta guide](outputs/Mac-Mobile-Beta-0.12.0.md). The Mac beta has no Developer ID signing or notarization; physical installation acceptance is pending.

Mobile plans are device-local, with separate local/account storage and memory-only Supabase sessions. Offline shell/task saving, backup transfer and touch navigation are implemented. Sync/sharing, mobile AI/provider connections and closed-app alerts are pending. [Draft beta PR](https://github.com/munkauser01/Munka-Program/pull/1).

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

The supplied mobile deck provides branding. Windows is the current installed release; Mac and mobile are beta work. Real user data, credentials, local backups, and runtime logs are excluded from version control.

## Munka account and synchronization

The Windows app opens a full-page Supabase sign-in screen when signed out. Sign in or explicitly choose Use locally to enter. Create an account, confirm your email if prompted, and sign in; Settings shows your account and sign-out control. The Google button becomes available once the owner configures the Google Web OAuth client in Supabase. See the [backend owner guide](outputs/Munka-Backend-Owner-Guide.md) for testing and setup steps.

Login currently does not upload planner data or enable sharing. Use locally keeps personal planning, imports, backups and widgets; AI proposals and connected calendars require sign-in. Signing out returns to the full-page choice. The prior Node/SQLite sync service remains in source for migration work, but its desktop login and sharing controls are retired. The new Supabase schema and access rules are documented in [backend/supabase/README.md](backend/supabase/README.md) and [the backend plan](outputs/Supabase-Backend-Plan.md). The Supabase sync adapter is upcoming.

## Release status

Installed Windows: **0.11.7**; current source: **0.12.0-beta.1** — The approved Figma icon family now covers planner actions, calendar controls, account/password screens, widgets and wallpaper. Headings, labels and actions share a consistent Segoe scale and weight. See [the update guide](outputs/Theme-0.11.7.md). The [Windows installer](outputs/release-0.11.7/Munka%20Setup%200.11.7.exe) was installed and opened on October 5; all 82 checked application files matched source. See [installed verification](outputs/release-0.11.7/installed-verification.json). The earlier [grouped navigation/account menu](outputs/Navigation-0.11.6.md) and [0.11.5 refinement](outputs/UI-Refinement-0.11.5.md) remain included. Google login and production email confirmation/recovery setup remain pending. Planner data stays local; Supabase sync and shared-calendar UI are not yet implemented.

The production dependency staging step uses the package manager's local store offline. Run the locked install first; if using a custom store, set `MUNKA_PNPM_STORE` to the same path when building. Set public `MUNKA_AI_PUBLIC_URL`, `MUNKA_GOOGLE_CLIENT_ID` and `MUNKA_OUTLOOK_CLIENT_ID` only once those services are ready. Never put a service credential in these values.

This is an early implementation, not a production-certified release. The implementation status and acceptance checklist distinguish tested behavior, manual checks still needed, and remaining PRD gaps.

