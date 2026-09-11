# Munka desktop review and mobile plan

September 10, 2026 · Planning only · Application changes not applied in this pass

## Updated status

The user reports that the EXE launches successfully on their PC. Record this as user-confirmed launch success, superseding the blanket statement that desktop startup is blocked. The agent's restricted environment previously failed to start Electron's renderer; that result is not proof that the installed application fails. Confirm the installed build's version and source commit before comparing it with the latest widget implementation.

The latest source has the planner, glass/Sage/Plain widgets, retained completion checks, and a separate optional Projects kiosk. The last automated run passed 20 tests; this review did not rerun tests. Screen-reader, multi-monitor, reminder lifecycle, installation upgrade, and real-device sync acceptance remain open. This is a focused review of the requested areas, not an exhaustive repository audit.

## Agreed visual direction

- Wallpaper should match the glass widgets, as confirmed by the user.
- Taskbar icon should be the existing monkey artwork, larger within its icon canvas, with transparent surroundings and no artwork circle or pale square.
- Text in boxed controls should be visually centered. Check horizontal and vertical alignment in buttons, badges, tiles, and empty-state boxes, especially Add habit. Keep long text readable and unclipped at increased scaling.
- Preserve the original monkey silhouette; review any reconstruction if source quality is insufficient.
- Latest clarification: retain the widget appearance in the user's screenshot as the visual reference, rather than the separate wallpaper mockup's composition. Use compact default dimensions and tighter spacing while retaining edge resizing and a clearly labeled larger-size preset. Keep daily and project kiosks distinct, scroll longer lists, and retain completed rows with green checks.
- Logo clarification: use only the existing hanging monkey and its branch, without the surrounding circle, pale square, or wordmark in icon artwork. This does not require removing useful text labels elsewhere in the interface.
- The standalone wallpaper mockup demonstrates a proposed material treatment but is not the final approved composition. Revise it to use the confirmed widget visual language before implementing the wallpaper update.
- Future overlay requirement: the daily and project widgets should feel like persistent desktop skins, similar to Rainmeter, rather than ordinary application tabs. Keep them visible by default with an explicit off switch, allow per-surface visibility, save drag positions, keep each surface within its monitor, and consider a click-through/interaction lock for non-interactive moments. The overlay must remain accessible without appearing as a normal taskbar app window; native Windows z-order, tray control, monitor recovery, and focus behavior need a dedicated acceptance pass.

## Ordered implementation plan

| Order | Work and evidence | Completion check |
|---|---|---|
| 1 | Establish installed build identity. Recent source changes postdate earlier installer builds. Add version/build identifier in About and diagnostics; match screenshots to that build. | Fresh installer identifies its commit and opens on the user's PC; upgrades preserve planner data. |
| 2 | Rebuild taskbar/tray/app icons from the monkey alone. `assets/munka.png` visibly includes the background and circle. `scripts/prepare-assets.cjs` regenerates assets from `asset-data.json`, so updating only the PNG/ICO would be overwritten. | Transparent multi-size ICO, crisp silhouette at actual taskbar size, no baked-in square/circle, consistent installer/window/tray icons. Windows' own running-app highlight remains OS-controlled. |
| 3 | Audit shared button and box typography. The base button already uses flex centering; the screenshot alone does not establish a root cause. Inspect actual computed line-height, font fallback, padding, inherited styles, and build version before changing CSS. | Add habit plus other boxed labels look centered at 100%, 125%, 150%, and 200% scaling; wrapping does not crop text; keyboard focus stays visible. |
| 4 | Add an in-app wallpaper preview using the real renderer, before applying a wallpaper. Restyle the panel to match approved glass widgets. The current production renderer still uses a solid warm panel. | Preview and generated wallpaper agree; left/right, display, count, privacy, long titles, and empty states work on light and dark backgrounds. No wallpaper changes during preview. |
| 5 | Correct wallpaper display mapping and restoration. Code currently converts Electron's display ordering into the Windows COM monitor index and stores wallpaper paths by index. Monitor ordering can change. | Map using stable monitor identity; preserve a recoverable original background; unplug/reconnect never restores onto the wrong display. Review slideshow state/timing restoration explicitly. |
| 6 | Make wallpaper generation selective. Code currently renders and writes every 60 seconds, even unchanged. Capture dimensions also need verification across Windows scale factors. | Rebuild on relevant content/date/display changes, coalesce bursts, skip identical results; output is sharp at physical display resolution. |
| 7 | Verify the two widgets on the actual Windows build. Source supports separate positions, task actions, visibility, and acrylic; browser checks cannot prove native operation. | Drag across monitors, resize, close/reopen, restart, select Position, switch design, complete/reopen/snooze, and hide Projects without losing data. Long completed history remains scrollable. |
| 8 | Complete reminder and data reliability checks before release. | Sleep/restart/quiet hours produce catch-up summaries; time-zone changes do not corrupt schedules; backups restore; read-only shared roles hold; offline edits reconcile visibly. |

## Wallpaper preview supplied now

`Wallpaper-Preview.html` is a standalone planning mockup with a sample background and sample tasks. It follows the approved glass direction but does not change application files or Windows settings. Final wallpaper is a generated image: its glass appearance is baked over the selected background and is not interactive. Complete/Snooze/Open remain widget actions.

The implementation must share rendering rules between its preview and actual export so the two cannot drift. Preserve restore information before applying anything. Applying a wallpaper remains a separate explicit user action.

## iPhone and Android synchronization

Yes, this architecture can support mobile clients. This is new scope beyond the original Windows-first PRD, not a switch that can be enabled in Electron.

Recommended sequence:

1. Harden and deploy the existing sync service behind HTTPS with persistent storage, backups, account recovery/verification, and service monitoring. Keep record IDs, schema versions, permissions, conflict handling, and deletion semantics consistent across devices.
2. Build a small Capacitor feasibility slice reusing the domain and sync modules, with mobile-specific navigation and touch layouts. Replace Electron bridges with mobile adapters for durable offline storage, secure credentials, notifications, and file import/export. Validate the platform choice before committing the whole app.
3. Deliver tasks, project views, completion, reminders, and offline editing on both platforms. Sync on foreground/reconnect and permitted background opportunities; do not promise continuous background execution. Define personal reminder policy per device to avoid unexpected duplicate alerts.
4. Add platform widgets as a distinct milestone: iOS WidgetKit/App Intents and Android App Widgets. These are native widgets, not floating Electron windows, and must follow each platform's placement and refresh rules.
5. Test create/edit/complete/offline/conflict/deletion flows between one Windows PC, one iPhone, and one Android phone. Add signing, distribution, privacy disclosures, and store review to the mobile delivery plan. iOS native building/testing needs an appropriate macOS/Xcode environment.

Mobile release scope question remains unanswered: recommended initial release is core planner + sync, followed by native phone widgets. This is a proposal, not recorded approval.

## Primary technical references

- [Capacitor documentation](https://capacitorjs.com/docs): native iOS/Android containers and platform integration for web applications.
- [Apple interactive widgets](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities): widget actions through buttons, toggles, and App Intents.
- [Android App Widgets](https://developer.android.com/develop/ui/views/appwidgets): native widget architecture and platform-specific implementation.
- [Electron background materials](https://www.electronjs.org/docs/latest/api/browser-window#winsetbackgroundmaterialmaterial-windows): Windows acrylic support, distinct from a baked wallpaper image.
- [Rainmeter skin arrangement](https://github.com/rainmeter/rainmeter-docs/blob/master/source/manual/arranging-skins.html): desktop/on-top z-order, draggable placement, snap-to-edge, and keep-on-screen behavior used as the overlay reference.
- [Rainmeter bangs](https://github.com/rainmeter/rainmeter-docs/blob/master/source/manual/bangs.html): documented z-position and click-through controls for desktop skins.

## Next action

Review this plan, then start with build identification, monkey-only icon assets, and boxed-text alignment. Follow with wallpaper preview/application reliability and real Windows widget acceptance. Mobile work follows a validated shared sync foundation.

