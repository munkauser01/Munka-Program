# Widget glass update — September 9, 2026

User direction: clean iOS-inspired translucent bubbles, retained completed tasks with green checks, a separate project kiosk, and appearance/visibility options.

- Glass is the default widget style; Sage and Plain are alternatives. Preferences persist with planner data. Appearance is available inside widgets and in Settings.
- Daily tasks stay in insertion order after completion; the previous eight-item cap is removed. Longer lists scroll. Completed tasks show a green check and Done label and can be reopened.
- Project tasks are separated from daily tasks. All unarchived projects appear in their own kiosk, including projects awaiting their first task. Each shows completion counts, progress, and interactive task rows.
- In Electron, the Projects kiosk is a separate movable/resizable window with its own saved position and Position menu. Show projects controls its visibility without deleting data. The browser preview stacks it below daily tasks to demonstrate both surfaces.
- Windows acrylic is requested through Electron's supported background material API; the web preview uses CSS translucency. Actual OS translucency depends on supported Windows 11 versions and system settings and remains unverified locally.
- Normal application quit preserves widget visibility choices for the next launch.

## Validation

All 20 automated tests pass. Browser checks verified retained completed rows, visible green checks, design selection, and project visibility toggling. Added native smoke coverage for a separate projects window and retained completed tasks; this has not been validated locally because the Electron renderer startup issue remains unresolved.

## Research

[Electron BrowserWindow background materials](https://www.electronjs.org/docs/latest/api/browser-window#winsetbackgroundmaterialmaterial-windows) documents acrylic support on Windows 11 22H2 and later.

## Remaining

Resolve native startup, then validate both windows across dragging, resizing, restart, display changes, dark mode, accessibility, and Windows transparency settings.
