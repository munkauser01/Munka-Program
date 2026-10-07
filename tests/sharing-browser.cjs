// Real Chrome UI/SDK/REST contract with synthetic accounts and service responses.
// This checks integration behavior, not live authentication or database authorization.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright'), { serve } = require('../scripts/serve-mobile.cjs');
const output = path.resolve('outputs/sharing-check-' + require('../package.json').version);
fs.mkdirSync(output, { recursive: true });
const users = {
  owner: { id: 'f1111111-1111-4111-8111-111111111111', email: 'owner@test.invalid' },
  editor: { id: 'f2222222-2222-4222-8222-222222222222', email: 'editor@test.invalid' },
  viewer: { id: 'f3333333-3333-4333-8333-333333333333', email: 'viewer@test.invalid' },
};
const planners = new Map(), calendars = [], invites = [], members = [], events = [];
let seq = 0;
function rpc(user, action, data) {
  const role = calendar => calendar.owner_id === user.id ? 'owner' : members.find(member => member.space_id === calendar.id && member.user_id === user.id)?.role;
  const flags = calendar => calendar.owner_id === user.id ? { create: true, edit: true, delete: true } : members.find(member => member.space_id === calendar.id && member.user_id === user.id)?.permissions;
  const own = id => { const calendar = calendars.find(calendar => calendar.id === id); assert.equal(role(calendar), 'owner'); return calendar; };
  if (action === 'planner_read') return planners.get(user.id) || { revision: 0, body: null };
  if (action === 'planner_write') {
    const current = planners.get(user.id) || { revision: 0 };
    if (current.revision !== data.revision) throw Error('stale');
    const next = { revision: current.revision + 1, body: data.body }; planners.set(user.id, next); return next;
  }
  if (action === 'calendar_list') {
    const mine = calendars.filter(calendar => role(calendar));
    return { calendars: mine.map(calendar => ({ ...calendar, role: role(calendar), permissions: flags(calendar) })), events: events.filter(event => !event.deleted && mine.some(calendar => calendar.id === event.space_id)) };
  }
  if (action === 'invitation_list') return invites.filter(invite => invite.email === user.email && invite.status === 'pending').map(invite => ({ ...invite, calendar_name: calendars.find(calendar => calendar.id === invite.space_id).name }));
  if (action === 'calendar_create') { const calendar = { id: 'calendar-' + (++seq), owner_id: user.id, name: data.name, kind: 'calendar', settings: {} }; calendars.push(calendar); return calendar; }
  if (action === 'calendar_members') { own(data.calendar); return { members: members.filter(member => member.space_id === data.calendar), invitations: invites.filter(invite => invite.space_id === data.calendar && invite.status === 'pending') }; }
  if (action === 'calendar_invite') {
    own(data.calendar);
    const invite = { id: 'invite-' + (++seq), space_id: data.calendar, email: data.email, role: data.role, permissions: data.role === 'viewer' ? { create: false, edit: false, delete: false } : data.permissions, status: 'pending', expires_at: '2026-10-13T12:00:00Z' };
    invites.push(invite); return invite;
  }
  if (action === 'invitation_accept') {
    const invite = invites.find(invite => invite.id === data.id && invite.email === user.email && invite.status === 'pending'); assert.ok(invite);
    invite.status = 'accepted'; members.push({ space_id: invite.space_id, user_id: user.id, email: user.email, role: invite.role, permissions: invite.permissions }); return { accepted: true };
  }
  if (action === 'calendar_access') { own(data.calendar); const member = members.find(member => member.space_id === data.calendar && member.user_id === data.user); assert.ok(member); member.role = data.role; member.permissions = data.role === 'viewer' ? { create: false, edit: false, delete: false } : data.permissions; return { updated: true }; }
  if (action === 'calendar_revoke') { own(data.calendar); const index = members.findIndex(member => member.space_id === data.calendar && member.user_id === data.user); assert.ok(index >= 0); members.splice(index, 1); return { revoked: true }; }
  if (action === 'event_write') {
    const calendar = calendars.find(calendar => calendar.id === data.calendar), existing = events.find(event => event.id === data.id);
    assert.ok(calendar); assert.ok(flags(calendar)?.[existing ? (data.deleted ? 'delete' : 'edit') : 'create']);
    if (existing) { assert.equal(existing.space_id, data.calendar); assert.equal(existing.version, data.version); }
    const updated = { id: data.id, space_id: data.calendar, version: (existing?.version || 0) + 1, body: data.body, deleted: !!data.deleted };
    if (existing) Object.assign(existing, updated); else events.push(updated); return updated;
  }
  throw Error(action);
}

(async () => {
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), errors = [], captures = [], sessionPages = [];
  let last;
  const testDate = '2026-10-10', calendarId = 'calendar-1';
  try {
    async function signIn(page, kind, first = false) {
      last = page;
      await page.locator('#entry-email').fill(users[kind].email);
      await page.locator('#entry-password').fill('synthetic-password');
      await page.locator('.entry-submit').click(); await page.locator('.shell').waitFor();
      if (first) await page.locator('#welcome-skip').waitFor();
      else await page.locator('#welcome-skip').waitFor({ timeout: 3000 }).catch(() => {});
      if (await page.locator('#welcome-skip').isVisible()) { await page.locator('#welcome-skip').click(); await page.locator('#welcome-skip').waitFor({ state: 'hidden' }); }
    }
    async function session(kind, phone = false) {
      let user = users[kind];
      const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: phone, hasTouch: phone, locale: 'en-US', timezoneId: 'America/New_York', colorScheme: 'light' });
      await context.addInitScript(() => {
        window.__munkaChangedNotifications = [];
        const recordMessage = value => {
          const message = String(value || '').trim();
          if (/\b(?:planner|account)\b.{0,100}\bchanged\b|\bchanged\b.{0,100}\b(?:planner|account)\b/i.test(message) && !window.__munkaChangedNotifications.includes(message)) window.__munkaChangedNotifications.push(message);
        };
        new MutationObserver(records => {
          for (const record of records) {
            const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
            if (target?.id === 'toast' || target?.closest?.('#toast')) {
              recordMessage(record.target.textContent);
              recordMessage(record.oldValue);
              for (const node of record.addedNodes || []) recordMessage(node.textContent);
            }
          }
          recordMessage(document.querySelector('#toast.visible')?.textContent);
        }).observe(document, { childList: true, subtree: true, characterData: true, characterDataOldValue: true, attributes: true, attributeFilter: ['class'] });
      });
      await context.route('https://pkgoupnhdpdeluychmqr.supabase.co/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/rest/')) {
          try { const request = route.request().postDataJSON(); return route.fulfill({ json: rpc(user, request.p_action, request.p_data) }); }
          catch (error) { return route.fulfill({ status: 409, json: { code: '40001', message: error.message } }); }
        }
        if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
        if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
        const request = route.request().postDataJSON();
        if (request?.email) { const requested = Object.values(users).find(candidate => candidate.email === request.email); assert.ok(requested, 'Only synthetic emails are accepted'); user = requested; }
        const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.test';
        return route.fulfill({ json: { access_token: token, refresh_token: 'synthetic', expires_in: 3600, token_type: 'bearer', user } });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      sessionPages.push({ page, session: kind + (phone ? '-phone' : '-desktop') });
      await page.goto(origin + '/src/index.html'); await signIn(page, kind, true); return page;
    }
    async function close(page) { if (await page.locator('#close-drawer').count()) await page.locator('#close-drawer').click(); }
    async function settings(page) {
      last = page; await close(page);
      await page.locator('.sidebar [data-view=settings]:visible,.mobile-nav [data-view=more]:visible').first().click();
      if (await page.locator('.mobile-destinations [data-view=settings]').count()) await page.locator('.mobile-destinations [data-view=settings]').click();
    }
    async function shared(page) { await settings(page); await page.locator('[data-action=shared-calendars]').click(); await page.getByRole('heading', { name: 'Shared calendars', exact: true }).waitFor(); }
    async function calendar(page) {
      last = page; await close(page);
      await page.locator('.sidebar [data-view=calendar]:visible,.mobile-nav [data-view=calendar]:visible').first().click();
      await page.locator('#calendar-picker-trigger').waitFor(); await page.locator('[data-calendar-mode=day]').click();
      await page.locator('#calendar-jump').fill(testDate); await page.locator('#calendar-jump').dispatchEvent('change');
    }
    async function choose(page, value) {
      await page.locator('#calendar-picker-trigger').click(); await page.locator('[data-calendar-choice="' + value + '"]').click();
      assert.equal(await page.locator('#calendar-picker-trigger').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'calendar-picker-trigger');
    }
    async function deviceState(page, kind) { return page.evaluate(id => JSON.parse(localStorage.getItem('munka.account.' + id)), users[kind].id); }
    async function changedNotifications() {
      const notifications = [];
      for (const { page, session } of sessionPages) {
        for (const message of await page.evaluate(() => window.__munkaChangedNotifications || [])) notifications.push({ session, message });
      }
      return notifications;
    }
    async function shot(page, name) {
      last = page;
      await page.evaluate(() => {
        for (const element of [document.scrollingElement, document.body, document.querySelector('.mainwrap'), document.querySelector('#main')]) element?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' has no document overflow');
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)));
      assert.deepEqual(await changedNotifications(), [], 'No planner/account changed errors, including transient toast notifications');
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: false }); captures.push(name);
    }
    async function noCreate(page) {
      assert.equal(await page.locator('#calendar-quick-add').count(), 0);
      assert.equal(await page.locator('[data-cal-add]:not(:disabled),[data-cal-plan]:not(:disabled)').count(), 0);
      assert.equal(await page.locator('.cal-readonly').isVisible(), true);
      assert.equal(await page.locator('[data-cal-action=share-current]').innerText(), 'Calendar access');
      assert.equal(await page.locator('[data-cal-action=details],[data-cal-action=guided],[data-cal-action=batch]').count(), 0);
    }
    const owner = await session('owner');
    await owner.locator('#quick-add [name=title]').fill('Cross-device task'); await owner.locator('#quick-add').evaluate(form => form.requestSubmit());
    await settings(owner); await owner.locator('[data-action=account-sync]').click();
    await owner.getByRole('button', { name: 'Enable personal sync', exact: true }).click(); await owner.getByText('Synced', { exact: true }).first().waitFor();
    const phone = await session('owner', true);
    await settings(phone); await phone.locator('[data-action=account-sync]').click();
    await phone.getByRole('button', { name: 'Enable personal sync', exact: true }).click(); await phone.getByText('Synced', { exact: true }).first().waitFor();
    assert.equal((await deviceState(phone, 'owner')).tasks[0].title, 'Cross-device task');

    await shared(owner); await owner.getByRole('button', { name: 'Create calendar', exact: true }).click();
    await owner.locator('.drawer [name=name]').fill('Study group'); await owner.getByRole('button', { name: 'Create calendar', exact: true }).click();
    await owner.locator('#shared-invite').waitFor();
    assert.equal(calendars[0].id, calendarId);
    await calendar(owner); await owner.locator('#calendar-focus').selectOption('personal');
    await owner.locator('#calendar-quick-add [name=title]').fill('Private draft kept in My planner');
    await owner.locator('#calendar-quick-add [name=date]').fill('2026-10-09');
    await choose(owner, 'shared:' + calendarId);
    assert.equal(await owner.locator('#calendar-quick-add [name=title]').inputValue(), '', 'A personal draft must not enter the shared creation target');
    await choose(owner, 'personal');
    assert.equal(await owner.locator('#calendar-quick-add [name=title]').inputValue(), 'Private draft kept in My planner');
    assert.equal(await owner.locator('#calendar-quick-add [name=date]').inputValue(), '2026-10-09');
    await choose(owner, 'shared:' + calendarId);
    assert.equal(await owner.locator('#calendar-quick-add [name=title]').inputValue(), '');
    assert.equal(await owner.locator('#calendar-picker-trigger').innerText(), 'Study group');
    assert.equal(await owner.locator('#calendar-focus').inputValue(), 'all'); assert.equal(await owner.locator('#calendar-focus').isDisabled(), true);
    assert.equal(await owner.locator('.cal-bubble [data-task]').count(), 0);
    const beforeTasks = (await deviceState(owner, 'owner')).tasks.length;
    await owner.locator('#calendar-quick-add [name=title]').fill('Shared review destination'); await owner.locator('#calendar-quick-add [name=date]').fill(testDate);
    await owner.getByRole('button', { name: 'Review event', exact: true }).click();
    assert.equal(await owner.locator('.drawer [name=title]').inputValue(), 'Shared review destination');
    assert.equal(await owner.locator('.drawer [name=start]').inputValue(), testDate + 'T09:00'); assert.equal(await owner.locator('.drawer [name=end]').inputValue(), testDate + 'T10:00');
    await owner.getByRole('button', { name: 'Save event', exact: true }).click(); await owner.locator('#shared-invite').waitFor();
    const saved = events.find(event => event.body.title === 'Shared review destination');
    assert.ok(saved); assert.equal(saved.space_id, calendarId);
    assert.equal((await deviceState(owner, 'owner')).tasks.length, beforeTasks); assert.equal(planners.get(users.owner.id).body.tasks.length, beforeTasks);

    await shared(owner); await owner.locator('[data-display="' + calendarId + '"]').uncheck();
    await owner.waitForFunction(({ userId, calendarId }) => {
      const saved = JSON.parse(localStorage.getItem('munka.account.' + userId));
      return saved?.preferences?.hiddenSharedCalendars?.includes(calendarId);
    }, { userId: users.owner.id, calendarId });
    assert.ok((await deviceState(owner, 'owner')).preferences.hiddenSharedCalendars.includes(calendarId));
    await calendar(owner); await choose(owner, 'all');
    assert.equal(await owner.locator('.cal-board-area').getByText('Shared review destination', { exact: true }).count(), 0);
    await choose(owner, 'shared:' + calendarId); await owner.locator('.cal-board-area').getByText('Shared review destination', { exact: true }).waitFor();
    assert.ok((await deviceState(owner, 'owner')).preferences.hiddenSharedCalendars.includes(calendarId), 'Explicit selection preserves aggregate visibility');

    await owner.locator('#calendar-picker-trigger').focus(); await owner.keyboard.press('ArrowDown');
    assert.equal(await owner.locator('#calendar-picker-trigger').getAttribute('aria-expanded'), 'true');
    assert.equal(await owner.evaluate(() => document.activeElement.dataset.calendarChoice), 'shared:' + calendarId, 'Trigger ArrowDown opens on the selected option without advancing twice');
    await owner.keyboard.press('Escape');
    assert.equal(await owner.locator('#calendar-picker-trigger').getAttribute('aria-expanded'), 'false'); assert.equal(await owner.evaluate(() => document.activeElement.id), 'calendar-picker-trigger');
    await owner.locator('#calendar-picker-trigger').click(); await owner.locator('#calendar-picker-search').fill('planner');
    const lastSearchChoice = await owner.locator('[data-calendar-choice]:visible').last().getAttribute('data-calendar-choice');
    await owner.locator('#calendar-picker-search').press('ArrowUp');
    assert.equal(await owner.evaluate(() => document.activeElement.dataset.calendarChoice), lastSearchChoice, 'ArrowUp from search focuses the last visible option');
    await owner.keyboard.press('Escape');
    await owner.locator('#calendar-picker-trigger').click(); await owner.locator('#calendar-picker-search').fill('a calendar that does not exist');
    assert.equal(await owner.locator('.picker-empty').isVisible(), true); assert.equal(await owner.locator('[data-calendar-choice]:visible').count(), 0);
    await owner.keyboard.press('Escape'); assert.equal(await owner.evaluate(() => document.activeElement.id), 'calendar-picker-trigger');
    await owner.locator('#calendar-picker-trigger').click(); await shot(owner, 'desktop-light-picker'); await owner.keyboard.press('Escape');
    await settings(owner); await owner.locator('#theme').selectOption('dark');
    await owner.waitForFunction(() => document.body.classList.contains('dark'));
    await calendar(owner); await choose(owner, 'shared:' + calendarId);
    await owner.locator('#calendar-picker-trigger').click(); await shot(owner, 'desktop-dark-picker'); await owner.keyboard.press('Escape');
    await settings(owner); await owner.locator('#theme').selectOption('light');
    await owner.waitForFunction(() => !document.body.classList.contains('dark'));
    await calendar(owner);

    await owner.locator('[data-cal-action=share-current]').click(); await owner.getByRole('heading', { name: 'Invite people', exact: true }).waitFor();
    await owner.locator('.sharing-intro').getByText('Study group', { exact: true }).waitFor(); await owner.locator('.drawer [name=email]').fill(users.editor.email);
    await owner.locator('.drawer [name=role][value=editor]').check();
    assert.equal(await owner.locator('#calendar-permissions').isVisible(), true); assert.equal(await owner.locator('.drawer [name=delete]').isChecked(), false);
    await shot(owner, 'desktop-invite'); await owner.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await owner.locator('#copy-invitation-link').waitFor();
    const invitationLink = await owner.locator('[name=link]').inputValue(); assert.ok(invitationLink.startsWith(origin + '/src/index.html#invite='));
    await owner.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })); await owner.locator('#copy-invitation-link').click();
    assert.equal(await owner.evaluate(() => { const input = document.querySelector('[name=link]'); return document.activeElement === input && input.selectionEnd - input.selectionStart === input.value.length; }), true);
    assert.match(await owner.locator('.sharing-copy-status').innerText(), /Selected for copying/);
    await owner.getByRole('button', { name: 'Back to calendar', exact: true }).click();

    const editor = await session('editor', true);
    await shared(editor); await editor.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await editor.getByRole('button', { name: 'Open', exact: true }).click();
    await editor.getByRole('button', { name: 'Create event', exact: true }).click(); await editor.locator('.drawer [name=title]').fill('Group planning');
    await editor.locator('.drawer [name=start]').fill(testDate + 'T11:00'); await editor.locator('.drawer [name=end]').fill(testDate + 'T12:00');
    await editor.getByRole('button', { name: 'Save event', exact: true }).click();
    await editor.locator('#shared-new-event').waitFor();
    await editor.getByRole('button', { name: 'Edit', exact: true }).first().click();
    assert.equal(await editor.locator('#shared-delete').count(), 0);
    await calendar(editor); await choose(editor, 'shared:' + calendarId); await editor.locator('#calendar-picker-trigger').click(); await shot(editor, 'phone-picker'); await editor.keyboard.press('Escape');

    await shared(owner); await owner.locator('[data-manage-calendar="' + calendarId + '"]').click(); await owner.locator('[data-member="' + users.editor.id + '"]').click();
    await owner.locator('.drawer [name=create]').uncheck(); await owner.locator('.drawer [name=edit]').uncheck(); await owner.getByRole('button', { name: 'Save permissions', exact: true }).click();
    await owner.locator('#shared-invite').waitFor();
    await shared(editor); await editor.getByRole('button', { name: 'Open', exact: true }).click();
    await editor.getByRole('heading', { name: 'Study group', exact: true }).waitFor();
    assert.equal(await editor.locator('#shared-new-event').count(), 0);
    await editor.getByRole('button', { name: 'View', exact: true }).first().click(); assert.equal(await editor.locator('.drawer [name=title]').isDisabled(), true);
    await calendar(editor); await choose(editor, 'shared:' + calendarId); await noCreate(editor);
    await editor.locator('[data-cal-action=share-current]').click(); await editor.getByRole('heading', { name: 'Study group', exact: true }).waitFor();
    assert.equal(await editor.locator('#shared-invite').count(), 0);

    await shared(owner); await owner.locator('[data-manage-calendar="' + calendarId + '"]').click(); await owner.getByRole('button', { name: 'Invite people', exact: true }).click();
    await owner.locator('.drawer [name=email]').fill(users.viewer.email);
    assert.equal(await owner.locator('.drawer [name=role][value=viewer]').isChecked(), true); assert.equal(await owner.locator('#calendar-permissions').isVisible(), false);
    await owner.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await owner.locator('#copy-invitation-link').waitFor();
    assert.deepEqual(invites.at(-1).permissions, { create: false, edit: false, delete: false });
    const viewer = await session('viewer', true);
    await shared(viewer); await viewer.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await viewer.getByRole('button', { name: 'Open', exact: true }).click();
    await viewer.getByRole('heading', { name: 'Study group', exact: true }).waitFor();
    assert.equal(await viewer.locator('#shared-new-event,#shared-invite').count(), 0);
    await viewer.getByRole('button', { name: 'View', exact: true }).first().click(); assert.equal(await viewer.locator('.drawer [name=title]').isDisabled(), true);
    await calendar(viewer); await choose(viewer, 'shared:' + calendarId); await noCreate(viewer);
    await viewer.locator('.cal-board-area').getByText('Group planning', { exact: true }).waitFor(); await shot(viewer, 'phone-viewer');

    await shared(owner); await owner.locator('[data-manage-calendar="' + calendarId + '"]').click(); await owner.locator('[data-member="' + users.editor.id + '"]').click();
    await owner.getByRole('button', { name: 'Remove access', exact: true }).click(); await owner.getByRole('button', { name: 'Remove access', exact: true }).click();
    await owner.locator('#shared-invite').waitFor();
    assert.equal(await owner.locator('[data-member="' + users.editor.id + '"]').count(), 0);
    await shared(editor); assert.equal(await editor.getByText('Study group', { exact: true }).count(), 0); await calendar(editor);
    assert.equal(await editor.locator('#calendar-picker-trigger').innerText(), 'All calendars');
    await editor.locator('#calendar-picker-trigger').click(); assert.equal(await editor.locator('[data-calendar-choice="shared:' + calendarId + '"]').count(), 0); await editor.keyboard.press('Escape');

    await calendar(owner); await choose(owner, 'shared:' + calendarId); await owner.locator('#account-menu-toggle').click();
    await owner.locator('.account-popover [data-action=munka-switch-account]').click(); await owner.locator('#entry-email').waitFor(); await signIn(owner, 'viewer');
    await calendar(owner); assert.equal(await owner.locator('#calendar-picker-trigger').innerText(), 'All calendars');
    assert.equal((await deviceState(owner, 'viewer')).tasks.length, 0); assert.equal((await deviceState(owner, 'owner')).tasks.length, beforeTasks);

    assert.deepEqual(errors, []);
    const notifications = await changedNotifications();
    assert.deepEqual(notifications, [], 'No planner/account changed errors were shown during any session');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({
      passed: true,
      checks: ['SDK email login and synthetic RPC contract', 'same account task across desktop/phone sessions', 'calendar selection and incompatible focus reset', 'personal draft stays separate from shared drafts and restores on return', 'shared quick review seeds title/date and saves to selected calendar', 'explicit hidden selection preserves aggregate visibility', 'trigger ArrowDown selects current option; search ArrowUp selects last visible option', 'keyboard Escape/focus and empty search', 'desktop light/dark and phone layouts', 'owner contextual invite opens selected calendar', 'native viewer/editor choices and clipboard fallback', 'editor creates but cannot delete; custom no-create/no-edit access', 'viewer displays without capture actions', 'revoked selected calendar removed and scope resets', 'account switch resets scope and separates planners'],
      captures, notifications, liveAuthentication: false, liveDatabaseAuthorization: 'Not tested here; see the separate rollback SQL suite', errors,
    }, null, 2));
    console.log(JSON.stringify({ passed: true, output, captures }));
  } catch (error) {
    const notifications = [];
    for (const { page, session } of sessionPages) {
      for (const message of await page.evaluate(() => window.__munkaChangedNotifications || []).catch(() => [])) notifications.push({ session, message });
    }
    fs.writeFileSync(path.join(output, 'save-notifications.json'), JSON.stringify({ notifications }, null, 2));
    console.error(last ? await last.locator('body').innerText() : ''); throw error;
  }
  finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
