# Interactive widget — September 9, 2026

The widget is a separate resizable Electron window. Complete, Snooze 15 minutes, and Open task use the same planner state as the main window. Wallpaper reminders remain a non-interactive image.

## Placement

- Drag the header or native title bar to any connected display.
- Buttons explicitly opt out of the drag region, retaining pointer and keyboard interaction.
- Position opens a native keyboard-accessible menu of displays and four corner placements. Users can then drag to an exact location.
- Resize from the window edges. Bounds are saved after movement/resizing; always-on-top remains optional.
- Bounds recovery handles disconnected displays, changed work areas/scaling, oversized saved windows, and monitors with negative coordinates.

## Evidence and limitations

17 automated tests pass, including three placement geometry cases. Browser inspection at 360 × 460 shows the new controls and task actions. Native smoke coverage now checks drag CSS and saved movement, but has not passed in this local environment because the Electron renderer fails at startup. Real pointer dragging, monitor switching, restart persistence, and Windows accessibility require native acceptance; browser inspection cannot validate OS window movement.

## Research

- [Electron custom window interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions): drag regions suppress pointer events; use no-drag for controls.
- [Electron screen API](https://www.electronjs.org/docs/latest/api/screen): work areas, display events, and device-independent coordinates.

## Project status

Core planner, desktop integration, and optional sync service exist. Outstanding release work includes native startup resolution, real Windows reminder/widget/wallpaper acceptance, accessibility checks, and remote sync deployment. This is a prototype, not a verified production release.
