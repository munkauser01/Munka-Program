# Munka 0.1.1 preview

## Latest changes

Normal sandboxed Electron startup and native app interaction pass on GitHub's clean Windows runner. Version 0.1.1 installation and single-instance behavior also pass there. The local restricted execution environment still fails the independent Electron probe, and the user's ordinary desktop launch remains unconfirmed. See [startup investigation](Startup-Readiness.md).

This update adds single-instance behavior, bounded startup diagnostics, failed-renderer shutdown, an explicit planner-readiness signal, task opening from widgets and individual notifications, and recurring reminders that retain their local time across daylight-saving changes. All 13 Node tests pass locally. The manual Windows workflow verifies native and installed behavior before preserving its installer artifact.

## Earlier 0.1.0 build record

This is a development preview of the Windows planner, not a completed production release.

## Available

- Offline task capture and editing, subtasks, recurrence, reminders, courses, terms, projects, habits, and weekly review.
- Calendar views and study sessions with deadlines stored separately.
- CSV and limited ICS import previews, CSV export, versioned JSON backup/restore, and rotating local backups.
- Desktop widget, tray, notification scheduling, and wallpaper implementation.
- Optional synchronization service and client, shared-project roles, invitations, activity history, and conflict preview.
- Dev Mode with saved views, bulk completion, dependencies, automation preview/pause/history, and keyboard commands.
- Original extracted Munka logo, sage/cream interface, dark/system themes, responsive desktop layout, and contextual task details.

## Verified

All 12 domain/service/client tests pass. Native interaction and persistence smoke tests pass using diagnostic launch flags in a disposable profile. The bounded Impeccable visual/focus review passed. Windows NSIS packaging succeeds, and the PowerShell wallpaper helper is present outside the ASAR archive where Windows can execute it.

Local installer: `Munka Setup 0.1.0.exe`, 111,856,393 bytes.
SHA-256: `402ad041b888c3ab971e67fd00a75408313340bdb7b793d588b23468ba1b13f0`.

## Still required

1. Verify normal sandboxed startup and encrypted sessions on a clean Windows account. This environment reports GPU subprocess and Windows encryption errors; the diagnostic smoke configuration is not the shipped configuration.
2. Exercise reminders through sleep, restart, quiet settings, time-zone and daylight-saving changes. Verify monitor removal, wallpaper restoration, and slideshow behavior. Slideshow timing/state restoration is not implemented.
3. Complete keyboard, screen-reader, dark-theme, and display-scaling acceptance on actual Windows devices.
4. Provision an HTTPS sync host and persistent database backups; add verified account ownership, recovery, and operational monitoring before public account registration.
5. Test account merging, shared permissions, offline edits, and conflicts across two real PCs.
6. Extend ICS support beyond the currently accepted UTC/local/all-day single events; named time zones and recurrence rules currently produce explicit errors.
7. Configure code signing and verify installation, upgrade, and uninstall before release.

## Repository and rebuilding

The private repository is `https://github.com/munkauser01/Munka-Program`. Source, tests, design records, and rebuildable logo payloads are committed through the GitHub editor because the browser local-file uploader returned "Not allowed". `scripts/prepare-assets.cjs` restores the original PNG and ICO bytes before launch/build. No personal planner database or credential is part of the repository.

The manual **Windows preview build** workflow tests and builds an installer on GitHub. Successful runs retain their installer artifact for 14 days. The local installer above remains available separately; a GitHub-built installer may have a different hash due to packaging timestamps.

Use Node.js 24 and pnpm: `pnpm install`, `node node_modules/electron/install.js` if lifecycle scripts were skipped, `pnpm test`, and `pnpm run pack`. A browser preview is available through `pnpm preview`; desktop features require Electron.
