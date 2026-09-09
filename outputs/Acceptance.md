# Acceptance checklist

## Automated checks

September 8, 2026 continuation: all 13 Node tests pass. Normal sandboxed runtime and native interaction tests pass on the clean GitHub Windows runner; isolated installation and single-instance checks also pass. Local restricted execution still fails before the renderer starts. The user's ordinary Windows desktop session remains a separate acceptance step. See Startup-Readiness.md for evidence.

- [x] Recurring completion creates one successor and preserves history.
- [x] Date-only deadlines have no implicit notification; invalid dates rejected.
- [x] Rules execute once and respect the global pause switch.
- [x] CSV quotes/newlines, duplicate preview, invalid rows, and formula escaping.
- [x] Backups reject unsupported versions and duplicate IDs.
- [x] Independent field merges and explicit same-field conflicts.
- [x] Overnight quiet hours and calendar date boundaries.
- [x] ICS UTC parsing and explicit unsupported-format errors.
- [x] Dependencies remain separate from deadlines and calendar overlap is detected.
- [x] Sync authentication, privacy isolation, viewer denial, invitation recipient, stale revision, and revocation.
- [x] Renderer interaction smoke tests and native storage persistence on the clean Windows runner without compatibility flags.
- [x] Daily and weekly reminders retain local time across spring/fall daylight-saving transitions.
- [x] Isolated Windows installation creates the expected executable and wallpaper helper; installed startup and single-instance behavior pass on the runner.
- [x] Windows installer packaging (unsigned; installation acceptance remains open).
- [x] Bounded Impeccable review: stable focus, modal containment, compact schedule visibility, read-only viewer details, and recaptured opaque task drawer.

## Manual release acceptance

- [ ] New student can create first task and reminder in two minutes.
- [ ] Returning user captures task in fifteen seconds.
- [ ] Full keyboard and screen-reader workflow; 125%, 150%, and 200% scaling.
- [ ] Widget toggles independently, works alongside wallpaper, and recovers after monitor removal.
- [ ] Existing wallpaper is restored on every supported display; slideshow behavior reviewed.
- [ ] Reminder behavior verified through Windows quiet settings, app quit, sleep, restart, DST and time-zone change.
- [ ] Account merge, offline edits, deletion conflicts, project roles, revocation, and restore tested across two physical PCs.
- [ ] Hosted service persistence, HTTPS, backups, account recovery, and operational monitoring configured.
- [ ] Code-signed installer and install/uninstall tested on a clean Windows account.
