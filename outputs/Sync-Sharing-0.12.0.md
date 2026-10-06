# Munka account sync and shared calendars

October 5, 2026 · 0.12.0-beta.2

## Try account sync

Sign in with the same confirmed Munka email on your PC, Mac and phone. In each app, open **Settings → Sync across devices → Enable personal sync**. This explicitly uploads the signed-in account's planner. Existing local-only plans are separate: use **Copy local plans into this account**, review the count, then confirm. The original local planner is retained, and duplicate IDs are skipped.

Tasks, events, courses, terms, projects, habits, rules, saved views and selected planning preferences sync while the app is open. Edits first save to the device. Sync runs after personal edits, every minute, or via Refresh now. Provider tokens, desktop preferences, logs, trash, and local-only plans are excluded. Provider events remain local to their connected desktop until the mobile provider connection milestone.

The beta limits personal cloud payloads to 1.5 MB to leave space for device caches. Cloud writes compare revisions; changes to separate records merge. Conflicting edits or edit-versus-delete cases require a choice in the sync screen, with both versions retained for review. Shared changes require an online connection; a failed save leaves the event form open. Personal offline edits are replayed after reconnection. Browser sign-in sessions remain memory-only, so a reload needs an online sign-in or Use locally.

## Share a calendar

1. Open **Calendar → Calendar options → Shared calendars & invitations**, or the matching Settings button.
2. Create a calendar. It is private until a recipient accepts an invitation.
3. Choose **Invite someone**, enter their Munka email, and select Viewer or Editor.
4. For Editors, choose **Create events**, **Edit events**, and **Delete events** individually. Deleting is off by default. Only the owner manages people and invitations.
5. The recipient signs in with that confirmed email, opens Shared calendars, and accepts the invitation. It expires in seven days. No automatic invitation email is sent; the web invitation link can be copied and shared manually.

Viewers can display events and toggle the calendar's visibility on their device. Editors get only the enabled actions. Owners can update permissions, remove access, or cancel pending invitations. Server-side authorization applies to every write; hiding buttons is an additional UI control.

**Publish task deadlines** lets the owner choose specific deadlines. Only titles and dates are published as snapshots; private notes, reminders and project details are excluded. Publish again to update a snapshot. Removing a member blocks online reads and writes immediately; an offline device may retain a previously cached copy until its next refresh. Data someone has already exported cannot be recalled.

## Backend and access protection

- Existing RLS-protected spaces, members and event records remain; additive planner and invitation tables also have RLS.
- The public RPC is an invoker wrapper. Its private implementation explicitly verifies a permanent, confirmed account, owns or checks the calendar membership, normalizes permissions, and compares revisions.
- Invitations are bound to the verified Auth email, expire, reject replay and wrong recipients, and are revocable. Authorization never uses user-editable metadata.
- Direct record/member writes are revoked so clients cannot bypass the API's permission and revision checks. No service-role key is shipped.
- Personal snapshots are scoped to their owner; local/account/device caches remain separate. This is access control and hosted transport protection, not end-to-end encryption.

## Verification

Live transactional SQL checks passed for planner isolation/CAS, invitations, recipient binding/replay, viewer reads, custom create/edit/delete flags, direct-write rejection, anonymous-account rejection and revocation. Synthetic users and fixture rows were rolled back. Seventeen unit tests passed, including three-device merge/offline/conflict/cache-removal cases and stale responses/writes during account switching. Native Windows navigation/account regression passed.

Browser sharing UI/SDK contract and phone signup/offline tests passed under `outputs/sharing-check-0.12.0-beta.2` and `outputs/mobile-check-0.12.0-beta.2`. Guide/account-switch evidence is under `outputs/guide-check-0.12.0-beta.2`. UI tests use synthetic responses; physical devices and real account email delivery/confirmation still need acceptance. The existing three domain regressions remain outside this milestone. Supabase's advisor reports leaked-password protection disabled: [configuration guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Guide and account switching

First use opens a three-step animated tour, then optional personalization. **Settings → Take a quick tour** replays it. The images are illustrative task/calendar/permission examples, never screenshots of your data. Next, Back and Skip work with keyboard focus and a static reduced-motion option.

**Settings → Switch account**, the circular account menu, and Account details all offer switching. Private content is removed immediately, then a neutral sign-out status animates. Sign in with another email to open that account's separate planner; Use locally restores the separate local planner. No remembered password/account credential list is created.

Figma motion page: [Munka guide](https://www.figma.com/design/e4BORKHMCBpCP5yiLUMRS9?node-id=8-54). Manual keyframes drive the guide and account CSS. Figma uses Inter because Segoe UI is unavailable there; the app preserves its native font. Starter plan tool limits blocked a final Figma re-render after text wrapping; browser validation covers the shipped guide. No video was exported because a local frame extractor was unavailable.

## Remaining

Mobile Google/Outlook provider connection setup is the next separate milestone, after this requested sync/sharing flow. HTTPS hosting approval is still needed for a phone-accessible preview. Mac public distribution still needs Developer ID signing/notarization. Real two-user acceptance should verify each permission and revocation across devices before wider rollout.
