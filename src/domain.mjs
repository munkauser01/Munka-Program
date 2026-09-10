export const uid = () => crypto.randomUUID();
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(s, n) {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function initialState() {
  return {
    version: 1,
    revision: 0,
    tasks: [],
    courses: [],
    terms: [],
    projects: [],
    events: [],
    habits: [],
    rules: [],
    logs: [],
    views: [],
    trash: [],
    preferences: {
      theme: "system",
      dev: false,
      widget: false,
      widgetDesign: "glass",
      widgetProjects: true,
      wallpaper: false,
      alwaysOnTop: false,
      privacy: false,
      quietStart: "22:00",
      quietEnd: "08:00",
      quietEnabled: false,
      sound: false,
      background: true,
      automationPaused: false,
      wallpaperPosition: "right",
      wallpaperCount: 5,
    },
    sync: { url: "", account: null, pending: [], conflicts: [] },
  };
}
export function task(input = {}) {
  const t = {
    id: uid(),
    title: "",
    notes: "",
    date: "",
    time: "",
    priority: "Normal",
    status: "To do",
    kind: "Task",
    course: "",
    project: "",
    recurrence: "None",
    reminder: "",
    subtasks: [],
    dependencies: [],
    assignee: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...input,
  };
  if (!t.title.trim()) throw Error("Give this task a title.");
  if (t.title.length > 500) throw Error("Keep the title under 500 characters.");
  if (t.date && !validDate(t.date)) throw Error("Choose a valid due date.");
  if (t.time && !t.date) throw Error("A deadline time needs a date.");
  if (!["To do", "In progress", "Done"].includes(t.status))
    throw Error("Invalid task status.");
  return t;
}
export function validDate(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(new Date(s + "T12:00:00")) === s
  );
}
export function complete(s, id, now = new Date()) {
  const t = s.tasks.find((t) => t.id === id);
  if (!t) return;
  if (t.status === "Done") {
    t.status = "To do";
    t.completedAt = null;
    return;
  }
  t.status = "Done";
  t.completedAt = now.toISOString();
  t.updatedAt = now.toISOString();
  if (t.recurrence !== "None" && !t.nextOccurrence) {
    const date = addDays(
      t.date || dateKey(now),
      t.recurrence === "Weekly" ? 7 : 1,
    );
    const reminder = t.reminder ? new Date(t.reminder) : null;
    if (reminder)
      reminder.setDate(
        reminder.getDate() + (t.recurrence === "Weekly" ? 7 : 1),
      );
    const next = task({
      ...t,
      id: uid(),
      date,
      status: "To do",
      completedAt: null,
      nextOccurrence: null,
      previousOccurrence: t.id,
      subtasks: t.subtasks.map((x) => ({ ...x, done: false })),
      reminder: reminder ? reminder.toISOString() : "",
    });
    t.nextOccurrence = next.id;
    s.tasks.push(next);
  }
  runRules(s, "completed", t);
}
export function blocked(s, t) {
  return t.dependencies.some((id) =>
    s.tasks.some((x) => x.id === id && x.status !== "Done"),
  );
}
export function runRules(s, trigger, t, now = new Date()) {
  if (s.preferences.automationPaused) return;
  for (const r of s.rules) {
    if (
      !r.enabled ||
      r.trigger !== trigger ||
      (r.condition && r.condition !== t.priority)
    )
      continue;
    const key = `${r.id}:${trigger}:${t.id}:${trigger === "due" ? t.date : ""}`;
    if (s.logs.some((x) => x.key === key)) continue;
    if (r.action === "priority") t.priority = r.value;
    if (r.action === "project" && s.projects.some((p) => p.id === r.value))
      t.project = r.value;
    if (r.action === "reminder")
      t.reminder = new Date(
        now.getTime() + Number(r.value || 15) * 60000,
      ).toISOString();
    s.logs.push({
      id: uid(),
      key,
      at: now.toISOString(),
      message: `${r.name}: ${r.action} applied to ${t.title}`,
    });
  }
}
export function validateBackup(s) {
  if (!s || s.version !== 1)
    throw Error("Unsupported backup version. Expected version 1.");
  for (const k of [
    "tasks",
    "courses",
    "terms",
    "projects",
    "events",
    "habits",
    "rules",
    "logs",
    "views",
    "trash",
  ])
    if (!Array.isArray(s[k])) throw Error(`Backup is missing ${k}.`);
  if (!s.preferences || typeof s.preferences !== "object")
    throw Error("Backup has no preferences.");
  const ids = new Set();
  for (const k of [
    "tasks",
    "courses",
    "terms",
    "projects",
    "events",
    "habits",
    "rules",
    "views",
  ])
    for (const item of s[k]) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
        ids.has(item.id)
      )
        throw Error("Duplicate or invalid record ID.");
      ids.add(item.id);
      if (k === "tasks") {
        task(item);
        if (
          !Array.isArray(item.dependencies) ||
          !Array.isArray(item.subtasks) ||
          item.dependencies.some((x) => typeof x !== "string") ||
          item.subtasks.some(
            (x) => typeof x.title !== "string" || typeof x.done !== "boolean",
          )
        )
          throw Error("Invalid task details.");
      }
      if (
        k === "habits" &&
        (!Array.isArray(item.days) || item.days.some((x) => !validDate(x)))
      )
        throw Error("Invalid habit history.");
      if (
        k === "events" &&
        (!item.title || !Number.isFinite(new Date(item.start).getTime()))
      )
        throw Error("Invalid calendar event.");
      if (
        ["courses", "projects", "terms", "habits", "rules", "views"].includes(
          k,
        ) &&
        typeof item.name !== "string"
      )
        throw Error("A record is missing its name.");
    }
  return {
    ...initialState(),
    ...s,
    preferences: { ...initialState().preferences, ...s.preferences },
  };
}
export function parseCSV(text) {
  const rows = [];
  let row = [],
    v = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        v += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(v);
      v = "";
    } else if (c === "\n" && !quoted) {
      row.push(v.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      v = "";
    } else v += c;
  }
  if (quoted) throw Error("CSV contains an unclosed quoted value.");
  if (v || row.length) {
    row.push(v.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = (rows.shift() || []).map((x) =>
    x.replace(/^\uFEFF/, "").trim(),
  );
  return { header, rows: rows.filter((r) => r.some((x) => x.trim())) };
}
export function csvPreview(
  text,
  mapping = { title: "title", date: "date", notes: "notes" },
  existing = [],
) {
  const { header, rows } = parseCSV(text);
  return rows.map((r, i) => {
    const get = (k) => r[header.indexOf(mapping[k])] || "";
    const data = {
      title: get("title").trim(),
      date: get("date").trim(),
      notes: get("notes"),
    };
    let error = "";
    try {
      task(data);
    } catch (e) {
      error = e.message;
    }
    return {
      line: i + 2,
      data,
      error,
      duplicate: existing.some(
        (t) => t.title === data.title && t.date === data.date,
      ),
    };
  });
}
export function exportCSV(tasks) {
  const keys = ["title", "date", "time", "priority", "status", "notes"];
  const cell = (v) => {
    let s = String(v || "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    keys.join(",") +
    "\r\n" +
    tasks.map((t) => keys.map((k) => cell(t[k])).join(",")).join("\r\n")
  );
}
export function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const result = [];
  let e;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") e = { id: uid(), kind: "Event" };
    else if (line === "END:VEVENT" && e) {
      if (!e.title || !e.start)
        throw Error("Each calendar event needs a title and start.");
      result.push(e);
      e = null;
    } else if (e) {
      const p = line.indexOf(":");
      const key = line.slice(0, p),
        v = line
          .slice(p + 1)
          .replace(/\\n/g, "\n")
          .replace(/\\,/g, ",");
      if (key === "SUMMARY") e.title = v;
      if (key === "UID") e.importId = v;
      if (key === "RRULE")
        throw Error(
          "Recurring ICS events need expansion before import. Export individual occurrences.",
        );
      if (key.startsWith("DTSTART") || key.startsWith("DTEND")) {
        if (key.includes("TZID="))
          throw Error(
            "Export calendar times in UTC or local time; named time zones are not supported yet.",
          );
        const m = v.match(
          /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/,
        );
        if (!m) throw Error("Unsupported calendar date.");
        const stamp = `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5]}:${m[6]}${m[7] || ""}` : "T00:00:00"}`;
        e[key.startsWith("DTSTART") ? "start" : "end"] = m[7]
          ? new Date(stamp).toISOString()
          : stamp;
        e.allDay = !m[4];
      }
    }
  }
  return result;
}
export function overlaps(a, b) {
  return (
    new Date(a.start) < new Date(b.end || b.start) &&
    new Date(b.start) < new Date(a.end || a.start)
  );
}
export function mergeThreeWay(base, local, remote) {
  const result = { ...remote },
    conflicts = [];
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (["updatedAt", "revision"].includes(key)) continue;
    const b = JSON.stringify(base[key]),
      l = JSON.stringify(local[key]),
      r = JSON.stringify(remote[key]);
    if (l === b) continue;
    if (r === b || l === r) result[key] = local[key];
    else
      conflicts.push({
        field: key,
        base: base[key],
        local: local[key],
        remote: remote[key],
      });
  }
  return { result, conflicts };
}
export function isQuiet(p, now = new Date()) {
  if (!p.quietEnabled) return false;
  const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return p.quietStart <= p.quietEnd
    ? t >= p.quietStart && t < p.quietEnd
    : t >= p.quietStart || t < p.quietEnd;
}
