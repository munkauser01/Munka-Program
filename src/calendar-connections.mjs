export async function openCalendarConnections({
  bridge,
  drawer,
  esc,
  closeDrawer,
  refresh,
  toast,
}) {
  if (!bridge.calendars) {
    toast("Calendar connections are available in the Windows app.");
    return;
  }
  let active = true;
  async function show() {
    const providers = await bridge.calendars("status");
    const el = drawer(
      "Connected calendars",
      `<p>Show Google Calendar and Outlook alongside your tasks. Connected events are read-only; edit them in their original calendar.</p><p class="muted small">Keeps the last 30 days and next 365 days. Refreshes every 15 minutes while Munka runs. Saved events remain available offline. Account credentials stay encrypted on this PC.</p>${providers.map((p) => `<section class="calendar-account"><h3>${esc(p.name)}</h3><p>${p.connected ? "Connected" : p.ready ? "Ready to connect" : "Awaiting app registration"}</p>${p.message ? `<p class="small" role="status">${esc(p.message)}</p>` : ""}${p.lastSync ? `<p class="small muted">Last refresh: ${esc(new Date(p.lastSync).toLocaleString())}</p>` : ""}${p.connected ? `<div>${p.calendars.map((c, i) => `<label class="checkline"><input type="checkbox" data-provider="${p.id}" data-calendar-index="${i}" ${c.selected ? "checked" : ""}>${esc(c.name)}</label>`).join("")}</div><div class="actions"><button type="button" data-calendar-refresh="${p.id}">Save selection & refresh</button><button type="button" class="quiet" data-calendar-disconnect="${p.id}">Disconnect</button></div>` : `<button type="button" data-calendar-connect="${p.id}" ${p.ready ? "" : "disabled"}>Connect ${esc(p.name)}</button>${p.ready ? "" : '<p class="small muted">The Munka owner needs to finish provider setup. You can import an .ics file from Calendar meanwhile.</p>'}`}</section>`).join("")}<p id="connection-message" role="status"></p><div class="drawer-footer"><button type="button" id="cancel-calendar-signin" hidden>Cancel sign-in</button><button type="button" id="connections-done">Done</button></div>`,
      () => {},
    );
    const message = el.querySelector("#connection-message");
    async function act(action, id, data) {
      el.querySelectorAll("button").forEach((b) => (b.disabled = true));
      el.querySelector("#cancel-calendar-signin").hidden = action !== "connect";
      el.querySelector("#cancel-calendar-signin").disabled = false;
      message.textContent =
        action === "connect"
          ? "Continue in your browser to approve read-only access…"
          : action === "disconnect"
            ? "Removing this connection…"
            : "Refreshing calendars…";
      try {
        await bridge.calendars(action, { provider: id, ...data });
        await refresh();
        if (el.isConnected) await show();
      } catch (error) {
        if (el.isConnected) {
          message.textContent = error.message;
          el.querySelectorAll("button").forEach((b) => (b.disabled = false));
          el.querySelector("#cancel-calendar-signin").hidden = true;
        }
      }
    }
    el.querySelectorAll("[data-calendar-connect]").forEach(
      (b) => (b.onclick = () => act("connect", b.dataset.calendarConnect)),
    );
    el.querySelectorAll("[data-calendar-refresh]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.calendarRefresh,
            p = providers.find((p) => p.id === id),
            selected = [
              ...el.querySelectorAll(`[data-provider="${id}"]:checked`),
            ].map(
              (input) => p.calendars[Number(input.dataset.calendarIndex)].id,
            );
          act("refresh", id, { selected });
        }),
    );
    el.querySelectorAll("[data-calendar-disconnect]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.calendarDisconnect;
          drawer(
            "Disconnect calendar?",
            `<p>This removes this provider's synced events from Munka on this PC. Original calendar events and your Munka tasks stay in place.</p><p class="small muted">To revoke the provider's consent as well, remove Munka from your Google or Microsoft account's connected apps.</p><div class="drawer-footer"><button type="button" id="disconnect-back">Keep connection</button><button class="primary">Disconnect</button></div>`,
            async () => {
              await bridge.calendars("disconnect", { provider: id });
              await refresh();
              await show();
            },
          );
          document.querySelector("#disconnect-back").onclick = show;
        }),
    );
    el.querySelector("#cancel-calendar-signin").onclick = () =>
      bridge.calendars("cancel");
    el.querySelector("#connections-done").onclick = () => {
      active = false;
      closeDrawer();
    };
    el.querySelector("#close-drawer").addEventListener("click", () =>
      bridge.calendars("cancel"),
    );
  }
  await show();
}
