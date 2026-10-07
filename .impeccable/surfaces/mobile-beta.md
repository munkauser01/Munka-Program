# Mobile beta

- Mode: Operate. Adapt the incumbent Munka planner for quick capture and review on a phone.
- Preserve: monkey, paper/sage semantic roles, Figma 1.65px icon family, flat ledgers, all personal planner destinations and explicit sign-in/Use locally gate.
- Approved platform: installable iPhone/Android web app first. Core Mac Electron beta in parallel.
- Implementation: `src/mobile.mjs`, `src/mobile.css`, `src/browser-bridge.mjs`, `scripts/build-mobile.cjs`; Mac capabilities and packaging are separate platform code.
- Acceptance: Chrome phone/task/editor/calendar/secondary-navigation/offline/account-isolation suite passed; nine platform/storage tests and Windows navigation suite passed. Both Mac architectures passed native source and actual packaged-app checks. Signup/login API responses were synthetic. Physical phones/Mac installation and real email flows remain pending.
- Visual review: one batch across phone/small/landscape/tablet/desktop/dark, one fix batch for toast/touch-target/landscape/skip-link issues, one confirmation batch. No further polish loop.
- Access: local preview `http://127.0.0.1:4320/src/index.html`; phone installation requires HTTPS hosting.
- Guide: `outputs/Mac-Mobile-Beta-0.12.0.md`. Draft PR: https://github.com/munkauser01/Munka-Program/pull/1.
