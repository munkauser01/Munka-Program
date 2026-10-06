# Munka Mac and mobile beta

October 5, 2026 · 0.12.0-beta.1

## What is built

The mobile beta is an installable web app for iPhone and Android. It reuses Munka's planner, task editor, calendar, courses, projects, habits and weekly review. Phone navigation has Home, Calendar, Tasks and More; More includes Settings and the secondary destinations. The original monkey, sage colors and approved Figma icons are retained.

The app shell is cached for offline use after the first online load. Tasks and edits remain in device storage; CSV, ICS and JSON imports use the existing review steps. JSON backups can transfer plans between devices. Browser data clearing/private browsing can remove local plans, so export backups regularly.

Email login and account creation use the existing Supabase project and its public publishable key. Signup still requires email confirmation when Supabase requires it. Browser sessions are memory-only, so reopening/reloading requires signing in again or choosing Use locally. Local and each verified account have separate planner storage. No automatic upload, merge or cross-device sync occurs. No passwords or access tokens are stored in browser planner records or the offline cache.

The Mac beta uses the shared Electron app. Apple Silicon and Intel have separate build targets. The launcher uses Electron's actual platform executable. macOS Dock activation is handled, system typography/shortcuts are used, and Windows wallpaper/overlay controls are omitted and blocked. Core notifications, imports, backups, account and calendar/AI service code remain desktop features, subject to their existing provider setup requirements.

## Try mobile locally

From the Code directory:

```sh
pnpm build:mobile
pnpm mobile
```

Open http://127.0.0.1:4320. This address only works on the build computer. A phone needs an HTTPS-hosted copy of `outputs/mobile-beta-0.12.0-beta.1`; deployment is not yet performed. The folder includes a manifest, generated service worker, platform icons, Vercel security headers and a static-host `_headers` file. Serve the folder at the origin root.

On iPhone, open the hosted URL in Safari, use Share and Add to Home Screen. On Android, use Chrome's Install app or Add to Home screen. Installation does not add cloud sync or background reminders.

## Build Mac

Install Node 24 and pnpm 11.19.0 on a matching Mac, then:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
node --test tests/platform-beta.test.mjs tests/browser-bridge.test.mjs
node scripts/test-native.cjs tests/mac-beta-native.cjs
pnpm pack:mac arm64
```

Use `x64` on Intel. `pack:mac` produces an architecture-specific ZIP and DMG under `outputs/mac-beta-0.12.0-beta.1`. Build metadata records checksums and explicitly marks the beta unsigned/not notarized. Do not present these artifacts as a public signed release. macOS may block an unsigned downloaded app; public distribution requires Developer ID signing, hardened-runtime entitlements and notarization in a separate release configuration.

The included `.github/workflows/mac-beta.yml` uses matching GitHub macOS runners. Its unit and native smoke checks must pass before packaging; a second check launches each actual packaged app before uploading artifacts. It runs on the isolated beta branch or manual dispatch when available. Historical GitHub main is much older than the local app, so the [draft beta PR](https://github.com/munkauser01/Munka-Program/pull/1) includes the current application source needed to build this beta and must be reviewed before merging.

## Verification and limits

- Nine new platform/browser storage tests pass locally.
- Chrome phone checks pass: signup confirmation gate, task capture/editor save, all calendar modes, secondary destinations, account storage isolation and offline reload/new-task persistence.
- Phone, small phone, landscape, tablet, desktop and dark-mode layouts checked. Native Windows navigation/account regression suite passes.
- Signup/login browser tests use intercepted synthetic Supabase responses, not the owner's password or a new real account. Delivery, confirmation returns and real-provider login still need acceptance.
- Source-app smoke checks have passed on actual Apple Silicon and Intel macOS runners. The first packaging attempt revealed a too-small icon; packaging now generates a 512px icon from the existing artwork. Installer and packaged-app validation results are still pending the repaired build. Physical iPhone/Android Safari/Chrome acceptance is also pending.
- Mobile AI, live provider calendars, syllabus document extraction, closed-app alerts and desktop overlays are unavailable in this beta. Cloud sync and shared calendars remain unfinished across platforms.
- Existing three domain regressions remain outside this platform pass; the prior broad suite was 106/109. No clean security-audit claim is made.

## Next

Build and validate both Mac artifacts; choose an HTTPS preview destination for mobile; test on physical phones and a Mac. Then complete signup/recovery/provider setup and cross-device sync before widening the beta.

References: [Electron builder macOS](https://www.electron.build/v26/docs/mac/), [Supabase email sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [MDN offline PWA behavior](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation), [GitHub macOS runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
