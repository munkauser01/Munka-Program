# Calendar selection and sharing — 0.12.0-beta.3

## How to use it

1. Open Calendar and press the calendar name above capture.
2. Choose All calendars, My planner, a shared calendar, or a Google/Outlook/import view. Search by name; the checkmark shows the current selection.
3. In a shared calendar, Review event opens an event draft for that calendar. Your access determines whether you can add events. The owner’s create/edit/delete permissions still apply.
4. Owners use Invite people beside the heading. Other members use Calendar access. In your personal or combined view, Share & invite opens the calendar/invitation list.
5. Choose Can view or Can edit, then select the individual editor permissions. Invitation success has a Copy link button on the web or Copy invitation ID on desktop. No invitation email is sent automatically.

## Behavior

- Private and shared creation drafts stay separate. Switching back restores that calendar’s draft during the session. Account switches clear drafts and reset calendar selection.
- Explicitly selecting a hidden shared calendar shows it without changing its visibility in All calendars.
- Shared selection clears course/project filtering so unrelated filters cannot hide shared events.
- Missing access blocks creation. Membership/permission updates refresh the calendar with an account identity guard. Background cloud saves deliver their committed revision directly to the app, preventing sequential calendar changes from using an outdated revision.
- Keyboard: Arrow Down opens the picker; arrows move between choices, Home/End jump to the first/last, Enter selects, Escape closes and returns focus. Search can be reached with Shift+Tab from the focused choice.
- Imported/connected views remain distinct from Munka shared calendars. Selecting a provider does not connect it automatically.

## Design

Refined the existing sage/paper and dark UI using Impeccable. Rounded outline icons reuse the approved Figma exports. Calendar selection and sharing are visible; import and connection actions remain in Calendar options. Grouping and per-person access were informed by [Google Calendar’s sharing guidance](https://support.google.com/calendar/answer/37082?hl=en); this is a Munka design adapted to its existing permission model.

The Figma Starter MCP limit blocked the design call. This picker has been implemented in code; its new editable Figma component is pending tool access. Existing editable icons remain in file `e4BORKHMCBpCP5yiLUMRS9`.

## Builds and verification

- New web preview: http://127.0.0.1:4322/src/index.html . Run `node scripts/serve-mobile.cjs` with `MUNKA_MOBILE_PORT=4322` after `node scripts/build-mobile.cjs`.
- Windows beta package: `outputs/release-0.12.0-beta.3/`. Beta.3 is open with the existing planner profile and a verified live window. The installed stable app remains 0.11.7. The previous Windows/Mac beta.2 artifacts remain separate.
- All 26 focused calendar and sync checks pass, covering private/shared separation, hidden-calendar selection, permissions, removed access, escaping, current renderer revisions and account-generation guards.
- The Windows archive matches all 98 packaged source files. The actual executable passed an isolated-profile check of the login/local gate, picker, personal task creation and visible sharing action. Results: `outputs/release-0.12.0-beta.3/verification.json` and `packaged-picker-verification.json`.
- The Chrome flow passed desktop/phone, light/dark, keyboard/search, shared creation, private draft restoration, custom permissions, invitations/copy fallback, revocation and account switching. No unexpected planner/account-change notification occurred. Five captures and results: `outputs/sharing-check-0.12.0-beta.3/verification.json`.
- Browser accounts/service responses are synthetic; these UI checks do not claim new live authentication or database acceptance.

## Next

Create the editable Figma picker when access resets. Test with two real accounts and devices before wider sharing rollout; live provider setup and phone HTTPS hosting remain separate milestones.
