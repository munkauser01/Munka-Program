const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  http = require("node:http");
const PROVIDERS = {
  google: {
    name: "Google Calendar",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    api: "https://www.googleapis.com/calendar/v3/",
  },
  outlook: {
    name: "Outlook",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access https://graph.microsoft.com/Calendars.ReadBasic",
    api: "https://graph.microsoft.com/v1.0/",
  },
};
const uid = () => crypto.randomUUID();
function checkedProvider(id) {
  if (!Object.hasOwn(PROVIDERS, id))
    throw Error("Choose Google Calendar or Outlook.");
  return PROVIDERS[id];
}
function apiURL(provider, url) {
  const p = checkedProvider(provider),
    u = new URL(url);
  if (!u.href.startsWith(p.api) || u.username || u.password || u.hash)
    throw Error("The calendar returned an unexpected page address.");
  return u.href;
}
async function jsonResponse(fetcher, url, options = {}) {
  const response = await fetcher(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = Error(
      response.status === 401 || response.status === 403
        ? "Reconnect this calendar to restore access."
        : response.status === 429
          ? "The calendar provider asked us to wait. Try again later."
          : "Calendar refresh failed. Your saved events are still available.",
    );
    error.status = response.status;
    throw error;
  }
  if (!response.body) throw Error("The calendar response was empty.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let text = "",
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw Error("The calendar response was too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}
function normalizedEvent(provider, calendar, item) {
  if (!item.id || typeof item.id !== "string")
    throw Error("The provider returned an event without an ID.");
  if (item.status === "cancelled" || item.isCancelled) return null;
  const allDay = provider === "google" ? !!item.start?.date : !!item.isAllDay;
  let start =
    provider === "google"
      ? item.start?.date || item.start?.dateTime
      : item.start?.dateTime;
  let end =
    provider === "google"
      ? item.end?.date || item.end?.dateTime
      : item.end?.dateTime;
  if (provider === "outlook" && !allDay) {
    if (item.start?.timeZone !== "UTC" || item.end?.timeZone !== "UTC")
      throw Error(
        "Outlook returned an unsupported time zone. Retry this calendar.",
      );
    start = start?.replace(/(?:\.\d+)?$/, "") + "Z";
    end = end?.replace(/(?:\.\d+)?$/, "") + "Z";
  }
  if (allDay) {
    if (
      provider === "outlook" &&
      item.originalStartTimeZone &&
      item.originalStartTimeZone !== "UTC"
    ) {
      const { findIana } = require("windows-iana");
      const zone =
        findIana(item.originalStartTimeZone)[0] || item.originalStartTimeZone;
      const toDay = (value) => {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date(value + "Z"));
        const get = (k) => parts.find((p) => p.type === k).value;
        return `${get("year")}-${get("month")}-${get("day")}`;
      };
      start = toDay(start);
      end = toDay(end);
    }
    start = start?.slice(0, 10) + "T00:00:00";
    end = end?.slice(0, 10) + "T00:00:00";
  }
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    throw Error(
      "The provider returned an invalid event date. Saved events were kept.",
    );
  const remoteId = item.id;
  return {
    id:
      "cal_" +
      crypto
        .createHash("sha256")
        .update(provider + "\0" + calendar + "\0" + remoteId)
        .digest("hex")
        .slice(0, 40),
    title: String(item.summary || item.subject || "Untitled event").slice(
      0,
      500,
    ),
    start,
    end,
    allDay,
    kind: "Event",
    source: provider,
    color: "auto",
    location: String(
      provider === "google"
        ? item.location || ""
        : item.location?.displayName || "",
    ).slice(0, 500),
    externalCalendar: { provider, calendar, remoteId },
    readOnly: true,
  };
}
function createCalendarService({
  directory,
  safeStorage,
  clientIds = {},
  getState,
  commit,
  openExternal,
  fetcher = fetch,
  now = () => Date.now(),
}) {
  const file = path.join(directory, "calendar-tokens.enc");
  let sessions = {},
    pending = null,
    busy = new Set(),
    generations = { google: 0, outlook: 0 };
  const messages = {};
  try {
    if (fs.existsSync(file) && safeStorage.isEncryptionAvailable())
      sessions = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
  } catch {
    messages.google = messages.outlook = "Reconnect your calendars on this PC.";
  }
  function persist() {
    if (!safeStorage.isEncryptionAvailable())
      throw Error(
        "Windows encryption is unavailable. Calendar sign-in cannot be saved.",
      );
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      file + ".tmp",
      safeStorage.encryptString(JSON.stringify(sessions)),
    );
    fs.renameSync(file + ".tmp", file);
  }
  function config(id) {
    checkedProvider(id);
    const value = clientIds[id];
    if (typeof value !== "string" || !value.trim() || value.length > 300)
      throw Error(
        "Calendar connection is awaiting Munka app registration. Import an .ics file meanwhile.",
      );
    return value;
  }
  function status() {
    return Object.keys(PROVIDERS).map((id) => ({
      id,
      name: PROVIDERS[id].name,
      ready: !!clientIds[id],
      connected: !!sessions[id],
      busy: busy.has(id),
      message: messages[id] || "",
      lastSync: sessions[id]?.lastSync || null,
      calendars: (sessions[id]?.calendars || []).map((c) => ({
        id: c.id,
        name: c.name,
        selected: (sessions[id]?.selected || []).includes(c.id),
      })),
    }));
  }
  async function token(id, body) {
    const p = checkedProvider(id);
    const result = await jsonResponse(fetcher, p.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config(id),
        ...body,
        ...(id === "outlook" ? { scope: p.scope } : {}),
      }).toString(),
    });
    if (
      typeof result.access_token !== "string" ||
      result.access_token.length > 20000
    )
      throw Error("The provider did not return a usable sign-in.");
    return {
      access: result.access_token,
      refresh: result.refresh_token,
      expires:
        now() +
        Math.max(0, Math.min(Number(result.expires_in) || 0, 86400)) * 1000,
    };
  }
  async function access(id) {
    const s = sessions[id];
    if (!s) throw Error("Connect this calendar first.");
    if (s.expires > now() + 60000) return s.access;
    if (!s.refresh) throw Error("Reconnect this calendar to continue.");
    const revision = generations[id];
    const next = await token(id, {
      grant_type: "refresh_token",
      refresh_token: s.refresh,
    });
    if (revision !== generations[id] || !sessions[id])
      throw Error("Calendar disconnected.");
    Object.assign(s, { ...next, refresh: next.refresh || s.refresh });
    persist();
    return s.access;
  }
  async function pages(id, url, collection, headers = {}, providedBearer) {
    const bearer = providedBearer || (await access(id)),
      items = [],
      seen = new Set();
    while (url) {
      url = apiURL(id, url);
      if (seen.has(url) || seen.size >= 30)
        throw Error(
          "The calendar has too many result pages. Saved events were kept.",
        );
      seen.add(url);
      const result = await jsonResponse(fetcher, url, {
        headers: { Authorization: "Bearer " + bearer, ...headers },
      });
      if (!Array.isArray(result[collection]))
        throw Error("The provider returned an incomplete calendar.");
      items.push(...result[collection]);
      if (items.length > 10000)
        throw Error("This calendar has too many events for one refresh.");
      if (id === "google" && result.nextPageToken) {
        const u = new URL(url);
        u.searchParams.set("pageToken", result.nextPageToken);
        url = u.href;
      } else url = id === "outlook" ? result["@odata.nextLink"] : null;
    }
    return items;
  }
  async function calendars(id, bearer) {
    const list = await pages(
      id,
      id === "google"
        ? PROVIDERS.google.api + "users/me/calendarList?maxResults=250"
        : PROVIDERS.outlook.api + "me/calendars?$top=100",
      id === "google" ? "items" : "value",
      {},
      bearer,
    );
    return list
      .filter((c) => typeof c.id === "string" && !c.deleted)
      .map((c) => ({
        id: c.id,
        name: String(c.summary || c.name || "Calendar").slice(0, 180),
      }));
  }
  function connect(id) {
    const p = checkedProvider(id),
      client = config(id);
    if (pending)
      throw Error("Finish or cancel the current calendar sign-in first.");
    if (busy.has(id))
      throw Error("Wait for this calendar to finish refreshing.");
    if (!safeStorage.isEncryptionAvailable())
      throw Error("Windows encryption is unavailable.");
    const verifier = crypto.randomBytes(48).toString("base64url"),
      state = uid(),
      challenge = crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
    return new Promise((resolve, reject) => {
      let timer,
        redirect,
        finished = false,
        redeeming = false;
      busy.add(id);
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        server.close();
        pending = null;
        busy.delete(id);
        error ? reject(error) : resolve(value);
      };
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url, "http://localhost");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        if (
          redeeming ||
          req.method !== "GET" ||
          u.pathname !== "/" ||
          u.searchParams.get("state") !== state
        ) {
          res.writeHead(400);
          res.end("This sign-in request is not valid. Return to Munka.");
          return;
        }
        if (u.searchParams.has("error")) {
          res.end("Calendar access was not granted. You can return to Munka.");
          finish(Error("Sign-in was cancelled or access was denied."));
          return;
        }
        const code = u.searchParams.get("code");
        if (!code || code.length > 8192) {
          res.writeHead(400);
          res.end("Missing sign-in code.");
          return;
        }
        res.end(
          "Finishing your Munka connection. You can return to Munka now.",
        );
        if (finished) return;
        // Close the callback immediately so the authorization code cannot be redeemed twice.
        redeeming = true;
        server.close();
        const generation = generations[id];
        try {
          const tokens = await token(id, {
            grant_type: "authorization_code",
            code,
            redirect_uri: redirect,
            code_verifier: verifier,
          });
          if (finished || generation !== generations[id]) return;
          if (!tokens.refresh)
            throw Error(
              "Offline calendar access was not granted. Reconnect and approve access.",
            );
          const list = await calendars(id, tokens.access);
          if (finished || generation !== generations[id]) return;
          replaceSession(id, { ...tokens, selected: [], calendars: list }, []);
          messages[id] = "Choose which calendars to show.";
          finish(null, status());
        } catch (error) {
          finish(error);
        }
      });
      server.on("error", () =>
        finish(Error("Could not open the local sign-in callback. Try again.")),
      );
      server.listen(0, "127.0.0.1", async () => {
        redirect = `http://${id === "google" ? "127.0.0.1" : "localhost"}:${server.address().port}/`;
        const u = new URL(p.authorize);
        u.search = new URLSearchParams({
          client_id: client,
          redirect_uri: redirect,
          response_type: "code",
          scope: p.scope,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "consent",
          ...(id === "google"
            ? { access_type: "offline" }
            : { response_mode: "query" }),
        }).toString();
        try {
          await openExternal(u.href);
        } catch {
          finish(Error("The sign-in browser could not open. Try again."));
        }
      });
      pending = () => {
        generations[id]++;
        finish(Error("Calendar sign-in cancelled."));
      };
      timer = setTimeout(
        () => finish(Error("Sign-in timed out. Try connecting again.")),
        180000,
      );
    });
  }
  async function refresh(id, selected) {
    checkedProvider(id);
    if (busy.has(id)) throw Error("This calendar is already refreshing.");
    const s = sessions[id];
    if (!s) throw Error("Connect this calendar first.");
    if (
      selected !== undefined &&
      (!Array.isArray(selected) ||
        selected.length > 10 ||
        new Set(selected).size !== selected.length ||
        selected.some((c) => !s.calendars.some((x) => x.id === c)))
    )
      throw Error("Select up to 10 available calendars.");
    const choices = selected === undefined ? s.selected : selected,
      generation = generations[id];
    busy.add(id);
    try {
      const start = new Date(now());
      start.setUTCDate(start.getUTCDate() - 30);
      const end = new Date(now());
      end.setUTCDate(end.getUTCDate() + 365);
      const events = [];
      for (const calendar of choices) {
        let u;
        if (id === "google") {
          u = new URL(
            PROVIDERS.google.api +
              "calendars/" +
              encodeURIComponent(calendar) +
              "/events",
          );
          u.search = new URLSearchParams({
            singleEvents: "true",
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            maxResults: "1000",
            showDeleted: "false",
          }).toString();
        } else {
          u = new URL(
            PROVIDERS.outlook.api +
              "me/calendars/" +
              encodeURIComponent(calendar) +
              "/calendarView",
          );
          u.search = new URLSearchParams({
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
            $top: "1000",
          }).toString();
        }
        const rows = await pages(
          id,
          u.href,
          id === "google" ? "items" : "value",
          id === "outlook" ? { Prefer: 'outlook.timezone="UTC"' } : {},
        );
        events.push(
          ...rows
            .map((item) => normalizedEvent(id, calendar, item))
            .filter(Boolean),
        );
        if (events.length > 20000)
          throw Error(
            "Select fewer calendars; this selection contains over 20,000 events.",
          );
      }
      if (generation !== generations[id] || !sessions[id])
        throw Error("Calendar disconnected.");
      const unique = [...new Map(events.map((e) => [e.id, e])).values()];
      replaceSession(
        id,
        {
          ...s,
          selected: [...choices],
          lastSync: new Date(now()).toISOString(),
        },
        unique,
      );
      messages[id] = "Up to date · read-only";
      return status();
    } catch (error) {
      messages[id] = error.message;
      if (error.status === 401 && sessions[id]) sessions[id].expires = 0;
      throw error;
    } finally {
      busy.delete(id);
    }
  }
  function replaceSession(id, next, events) {
    const previous = sessions[id];
    next ? (sessions[id] = next) : delete sessions[id];
    try {
      persist();
      const state = getState();
      commit({
        ...state,
        events: [
          ...state.events.filter((e) => e.externalCalendar?.provider !== id),
          ...events,
        ],
      });
    } catch (error) {
      previous ? (sessions[id] = previous) : delete sessions[id];
      try {
        persist();
      } catch {}
      throw error;
    }
  }
  function disconnect(id) {
    checkedProvider(id);
    generations[id]++;
    replaceSession(id, null, []);
    messages[id] =
      "Disconnected on this PC. Remove Munka access in your provider account to revoke its consent too.";
    return status();
  }
  return {
    status,
    connect,
    refresh,
    disconnect,
    cancel: () => pending?.(),
    refreshAll: async () => {
      for (const id of Object.keys(PROVIDERS))
        if (sessions[id]?.selected?.length)
          try {
            await refresh(id);
          } catch {}
    },
  };
}
module.exports = { createCalendarService, normalizedEvent, apiURL, PROVIDERS };
