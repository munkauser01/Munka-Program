# Implementation milestones

Updated September 8, 2026. This record reports implementation and evidence; it is not a claim that every PRD acceptance criterion has passed.

1. **PRD approved:** User explicitly requested implementation of version 0.1. Scope and branding are recorded in PRD.md and PRODUCT.md.
2. **GitHub:** Private `munkauser01/Munka-Program` contains application source, server, tests, design records, original logo payloads, and a manual Windows build workflow. Installer artifacts are available from successful workflow runs.
3. **Desktop UX:** Sage navigation, warm workspace, Today task ledger, contextual task forms, schedule column, keyboard commands, themes, and responsive Windows layout implemented. Bounded Impeccable finish review passed; design tokens and components recorded in DESIGN.md and .impeccable/design.json. Full accessibility acceptance remains open.
4. **Local foundation:** Tasks, subtasks, dates, priorities, recurrence, course/term/project groups, planned events, habits, weekly review, CSV/ICS previews, JSON backup restoration, and rotating native backups implemented. Tests cover core domain behavior.
5. **Desktop integration:** Tray/background behavior, notification scheduling, snooze, quiet hours, widget persistence/recovery, and wallpaper generation/restoration implemented. Actual Windows setting changes are not performed as part of automated tests; manual acceptance remains required.
6. **Connected features:** Separate service and client implement authentication, permission-filtered records, optimistic concurrency, three-way merge preview, invitations, and history. Remote hosting is not provisioned. Production account recovery and operational monitoring remain open.
7. **Advanced tools and release:** Saved filters, bulk completion, dependencies, command palette, rule preview/pause/history implemented. All 12 Node tests and diagnostic native smoke tests pass. Current unsigned Windows installer rebuilt successfully at 17:52 EDT on September 8. Packaging stages only application files, excluding scratch files and user records.

## Known PRD limitations to close before production

- ICS imports reject named TZID zones and recurrence rules instead of silently importing them incorrectly. Export expanded occurrences in UTC/local time.
- Encrypted desktop sessions and periodic synchronization are implemented; normal Windows encryption, restart, and remote connectivity remain unverified.
- Windows wallpaper slideshow restoration and monitor-to-Windows device identity require manual verification. Original wallpaper images are retained; slideshow timing/state is not restored.
- Full screen-reader, high-scaling, multi-monitor, sleep/resume, Windows notifications-disabled, and DST acceptance need real-device testing.
- Installer is unsigned unless the owner supplies a signing setup. No remote sync server is provisioned.
- The local restricted launch environment still fails the minimal Electron probe. Clean GitHub Windows tests pass normal sandboxed runtime and native-app checks. Version 0.1.1 also passes isolated installation and second-instance checks there. The user's normal desktop launch is not yet verified; see Startup-Readiness.md.

## Version 0.1.1 continuation

Implemented bounded startup logging, single-instance behavior, failed-renderer shutdown, planner readiness reporting, task opening from widgets and individual notifications, and local-time recurrence across daylight-saving changes. All 13 domain/service/client tests pass locally. Spring/fall daily and weekly reminder transitions are now covered. Windows acceptance runs use the normal sandboxed configuration.
