import {
  initialState,
  task,
  uid,
  dateKey,
  addDays,
  complete,
  blocked,
  runRules,
  validateBackup,
  csvPreview,
  parseCSV,
  parseICS,
  exportCSV,
  overlaps,
} from "./domain.mjs";
const $ = (q, el = document) => el.querySelector(q),
  $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  today:
    "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  calendar: "M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2",
  courses:
    "M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3V4zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5V4z",
  projects: "M3 6V4h7l2 3h9v13H3V6z",
  habits: "m5 12 4 4L19 6M21 12a9 9 0 1 1-9-9",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  arrow: "m9 5 7 7-7 7",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  dev: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16",
  review: "M4 20V10m6 10V4m6 16v-8m6 8V2",
  desktop: "M3 3h18v13H3V3zm9 13v5m-5 0h10",
  inbox: "M4 4h16l2 12v4H2v-4L4 4zm-2 12h6l2 2h4l2-2h6",
};
const icon = (n) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[n] || paths.inbox}"/></svg>`;
let syncBusy = false,
  widgetAppearanceOpen = false,
  drawerOpener = null;
function focusIdentity(el = document.activeElement) {
  if (!el || el === document.body) return null;
  const keys = [
    "id",
    "data-view",
    "data-action",
    "data-task",
    "data-complete",
    "data-event",
    "data-toggle",
    "aria-label",
  ];
  for (const key of keys)
    if (el.getAttribute(key)) {
      const value = el.getAttribute(key);
      return {
        key,
        value,
        next: el
          .closest(".task-row")
          ?.nextElementSibling?.querySelector("[data-complete]")
          ?.getAttribute("data-complete"),
      };
    }
  return null;
}
function restoreFocus(identity) {
  if (!identity) return;
  let el = document.querySelector(
    `[${identity.key}="${CSS.escape(identity.value)}"]`,
  );
  if (!el && identity.next)
    el = document.querySelector(
      `[data-complete="${CSS.escape(identity.next)}"]`,
    );
  (
    el ||
    document.querySelector("#quick-add input") ||
    document.querySelector("#main")
  )?.focus();
}

let state,
  view = "today",
  query = "",
  selected = null,
  filter = "open",
  courseFilter = "",
  calendarMode = "week",
  calendarDate = dateKey(),
  drawerKind = null,
  toastTimer,
  importData = null,
  bulk = new Set(),
  displays = [],
  syncClient;
const isWidget = new URLSearchParams(location.search).has("widget");
const isProjectsWidget = new URLSearchParams(location.search).get('widget') === 'projects';
import { widgetModel } from './widget-model.mjs';
const bridge = window.munka || {
  load: async () => {
    try {
      return validateBackup(JSON.parse(localStorage.getItem("munka")));
    } catch {
      return initialState();
    }
  },
  save: async (s) => {
    s.revision++;
    localStorage.setItem("munka", JSON.stringify(s));
    return s;
  },
  exportFile: async (text, ext) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `Munka-${dateKey()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  },
  importFile: () =>
    new Promise((resolve) => {
      const i = document.createElement("input");
      i.type = "file";
      i.accept = ".json,.csv,.ics";
      i.onchange = async () =>
        resolve(
          i.files[0]
            ? { name: i.files[0].name, text: await i.files[0].text() }
            : null,
        );
      i.oncancel = () => resolve(null);
      i.click();
    }),
  desktop: async (action) => {
    if (action === "displays") return [];
    throw Error("Open the Windows app to use desktop features.");
  },
  onChange: () => {},
};
function toast(message, action) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(message)}</span>${action ? '<button id="toast-action">Undo</button>' : ""}`;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  if (action) $("#toast-action").onclick = action;
  toastTimer = setTimeout(
    () => el.classList.remove("visible"),
    action ? 12000 : 5000,
  );
}
async function save() {
  try {
    state = await bridge.save(state, state.revision);
    render();
    return true;
  } catch (e) {
    state = await bridge.load();
    render();
    toast(e.message);
    return false;
  }
}
function activeTasks() {
  return state.tasks.filter(
    (t) =>
      !state.courses.some(
        (c) =>
          c.id === t.course &&
          state.terms.some((x) => x.id === c.term && x.archived),
      ),
  );
}
function canEdit(t) {
  return t?._sync?.role !== "viewer";
}
function filtered() {
  return activeTasks()
    .filter(
      (t) =>
        (filter === "all" ||
          (filter === "done"
            ? t.status === "Done"
            : filter === "high"
              ? t.priority === "High" && t.status !== "Done"
              : filter === "blocked"
                ? blocked(state, t)
                : t.status !== "Done")) &&
        (!courseFilter ||
          t.course === courseFilter ||
          t.project === courseFilter) &&
        (!query ||
          [
            t.title,
            t.notes,
            state.courses.find((c) => c.id === t.course)?.name,
            state.projects.find((p) => p.id === t.project)?.name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort(
      (a, b) =>
        (a.date || "9999").localeCompare(b.date || "9999") ||
        a.time.localeCompare(b.time),
    );
}
function prettyDate(s) {
  if (!s) return "Anytime";
  const today = dateKey();
  return s === today
    ? "Today"
    : s === addDays(today, 1)
      ? "Tomorrow"
      : new Date(s + "T12:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
}
function row(t) {
  const course = state.courses.find((c) => c.id === t.course),
    project = state.projects.find((p) => p.id === t.project);
  return `<article class="task-row ${t.status === "Done" ? "completed" : ""}">${state.preferences.dev && !isWidget ? `<input type="checkbox" aria-label="Select ${esc(t.title)}" data-bulk="${t.id}" ${bulk.has(t.id) ? "checked" : ""}>` : ""}<button class="check ${t.status === "Done" ? "done" : ""}" data-complete="${t.id}" aria-label="${t.status === "Done" ? "Reopen" : "Complete"} ${esc(t.title)}">${t.status === "Done" ? icon("check") : ""}</button><button class="task-open" data-task="${t.id}"><span class="task-title">${esc(isWidget && state.preferences.privacy ? "Upcoming task" : t.title)}</span><span class="task-meta">${!isWidget || !state.preferences.privacy ? `<span>${esc(course?.name || project?.name || "Personal")}</span>` : ""}${!["Task", "Personal"].includes(t.kind) ? `<span>${esc(t.kind)}</span>` : ""}${t.priority === "High" ? '<span class="badge urgent">High priority</span>' : ""}${t.status === "In progress" ? '<span class="badge">In progress</span>' : ""}${blocked(state, t) ? '<span class="badge">Blocked</span>' : ""}${t.subtasks.length ? `<span>${t.subtasks.filter((x) => x.done).length}/${t.subtasks.length} subtasks</span>` : ""}</span></button><span class="task-due ${t.date && t.date < dateKey() && t.status !== "Done" ? "overdue" : ""}">${isWidget && t.status === "Done" ? "Done" : esc(prettyDate(t.date))}${t.time ? `<br>${esc(t.time)}` : ""}</span>${isWidget && t.status !== "Done" ? `<button class="quiet" data-snooze="${t.id}" aria-label="Snooze ${esc(t.title)} for 15 minutes">${icon("clock")}</button>` : ""}</article>`;
}
function empty(title, text, action = "new-task", label = "Add a task") {
  return `<div class="empty">${icon("inbox")}<h2>${title}</h2><p>${text}</p>${action ? `<button class="primary" data-action="${action}">${icon("plus")}${label}</button>` : ""}</div>`;
}
function nav() {
  const routes = [
    ["today", "Today"],
    ["tasks", "All tasks"],
    ["calendar", "Calendar"],
    ["courses", "Courses"],
    ["projects", "Projects"],
    ["habits", "Habits"],
    ["review", "Weekly review"],
  ];
  if (state.preferences.dev) routes.push(["dev", "Dev Mode"]);
  return `<aside class="sidebar"><div class="brand"><img src="../assets/munka.png" alt="Munka monkey logo">Munka</div><nav aria-label="Main navigation">${routes.map(([id, label]) => `<button class="navbtn ${view === id ? "active" : ""}" data-view="${id}" ${view === id ? 'aria-current="page"' : ""}>${icon(id)}${label}${id === "today" ? `<span class="count">${activeTasks().filter((t) => t.status !== "Done" && t.date && t.date <= dateKey()).length}</span>` : ""}</button>`).join("")}</nav><p class="nav-caption">Your courses</p>${state.courses
    .filter((c) => !state.terms.some((t) => t.id === c.term && t.archived))
    .slice(0, 5)
    .map(
      (c) =>
        `<button class="course-mini" data-course="${c.id}"><span class="dot"></span>${esc(c.name)}</button>`,
    )
    .join(
      "",
    )}<button class="course-mini muted" data-action="new-course">${icon("plus")} Add course</button><div class="sidebar-bottom"><button class="navbtn ${view === "settings" ? "active" : ""}" data-view="settings">${icon("settings")}Settings</button><div class="local"><span class="dot"></span>${state.sync.account ? "Account connected" : "Saved on this computer"}</div></div></aside>`;
}
function heading(title, text, action = "new-task", label = "Add task") {
  return `<div class="heading"><div><h1>${title}</h1><p>${text}</p></div>${action ? `<button class="primary" data-action="${action}">${icon("plus")}${label}</button>` : ""}</div>`;
}
function capture() {
  return `<form class="capture" id="quick-add"><input name="title" aria-label="Quick task title" placeholder="What do you need to get done?" required maxlength="500"><button class="quiet" type="submit" aria-label="Add quick task">${icon("plus")}</button></form>`;
}
function todayView() {
  const ts = filtered(),
    now = dateKey(),
    due = ts.filter((t) => t.date && t.date <= now),
    next = ts.filter((t) => t.date > now).slice(0, 5),
    done = state.tasks.filter((t) => t.completedAt?.startsWith(now)).length,
    events = state.events
      .filter((e) => dateKey(new Date(e.start)) === now)
      .sort((a, b) => a.start.localeCompare(b.start));
  return `${heading("Today", new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}<div class="compact-schedule"><div><strong>${events.length ? "Next planned session" : "Today’s schedule"}</strong><p>${events.length ? esc((events.find((e) => new Date(e.end || e.start) > new Date()) || events[0]).title) : "No sessions planned yet."}</p></div><button class="quiet" data-action="today-schedule">View schedule ${icon("arrow")}</button></div><div class="workspace"><div><div class="day-summary"><div><h2>${due.length ? "Make room for what matters." : "A little space to plan."}</h2><p>${due.length ? `${due.length} task${due.length === 1 ? "" : "s"} to focus on. ${done ? `${done} completed today.` : "One thing at a time."}` : "Capture your next task and give it a place in your day."}</p></div><div class="summary-mark">${icon("today")}</div></div><div class="section-head"><h2>Your focus</h2><span>${due.length} tasks</span></div>${due.length ? due.map(row).join("") : empty("Your day is clear", "Add an assignment, a personal task, or something you want to remember.", null)}${capture()}${next.length ? `<div class="section-head"><h2>Coming up</h2><button class="quiet small" data-view="tasks">View all ${icon("arrow")}</button></div>${next.map(row).join("")}` : ""}${!state.tasks.length ? '<button class="quiet small" data-action="sample">Explore with sample tasks</button>' : ""}</div><aside class="agenda"><h2>Your schedule</h2><p class="agenda-date">Planned time, separate from deadlines</p>${events.length ? events.map((e) => `<div class="event"><time>${new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time><div class="event-content"><strong>${esc(e.title)}</strong><small>${esc(e.kind)}${state.events.some((x) => x.id !== e.id && overlaps(x, e)) ? " · Overlaps another event" : ""}</small><button class="quiet small" data-event="${e.id}">Edit</button></div></div>`).join("") : '<p class="muted small">No time blocks yet. A small study session is a good place to start.</p>'}<button class="quiet small" data-action="new-event">${icon("plus")}Plan a session</button><div class="notice">${icon("desktop")}<h3 class="spaced">Keep your day in sight</h3><p>Bring your next tasks onto your desktop, even when your planner is tucked away.</p><button data-view="settings">Desktop reminders ${icon("arrow")}</button></div></aside></div>`;
}
function taskView() {
  const list = filtered();
  return (
    heading(
      courseFilter
        ? esc(
            [...state.courses, ...state.projects].find(
              (c) => c.id === courseFilter,
            )?.name || "Tasks",
          )
        : "All tasks",
      "A place for everything you need to do.",
    ) +
    `<div class="toolbar"><select id="status-filter" aria-label="Filter tasks">${["open", "all", "done", ...(state.preferences.dev ? ["high", "blocked"] : [])].map((x) => `<option value="${x}" ${filter === x ? "selected" : ""}>${{ open: "Open tasks", all: "All statuses", done: "Completed", high: "High priority", blocked: "Blocked" }[x]}</option>`).join("")}</select><select id="course-filter" aria-label="Filter by course or project"><option value="">All courses & projects</option>${[...state.courses, ...state.projects].map((c) => `<option value="${c.id}" ${courseFilter === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${state.preferences.dev ? '<button data-action="save-view">Save view</button>' : ""}${bulk.size ? `<button data-action="bulk-complete">Complete ${bulk.size} selected</button>` : ""}</div>${capture()}${list.length ? list.map(row).join("") : empty("Nothing here yet", "Try another filter or capture a new task.", null)}`
  );
}
function calendarView() {
  const d = new Date(calendarDate + "T12:00:00");
  let start = calendarDate,
    count = 1;
  if (calendarMode === "week") {
    start = addDays(calendarDate, -((d.getDay() + 6) % 7));
    count = 7;
  }
  if (calendarMode === "month") {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    start = addDays(dateKey(first), -((first.getDay() + 6) % 7));
    count = 42;
  }
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  return (
    heading(
      "Calendar",
      d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      "new-event",
      "Plan time",
    ) +
    `<div class="toolbar"><button data-action="calendar-prev" aria-label="Previous period">Previous</button><button data-action="calendar-now">Today</button><button data-action="calendar-next" aria-label="Next period">Next</button>${["day", "week", "month"].map((m) => `<button data-calendar-mode="${m}" class="${calendarMode === m ? "active" : ""}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>${
      calendarMode === "day"
        ? days
            .map(
              (day) =>
                `<h2>${prettyDate(day)}</h2>${state.events
                  .filter((e) => dateKey(new Date(e.start)) === day)
                  .map(
                    (e) =>
                      `<article class="task-row"><button class="task-open" data-event="${e.id}"><span class="task-title">${esc(e.title)}</span><span class="task-meta">${esc(e.kind)} · ${new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${state.events.some((x) => x.id !== e.id && overlaps(x, e)) ? " · Schedule overlap" : ""}</span></button></article>`,
                  )
                  .join("")}${state.tasks
                  .filter((t) => t.date === day)
                  .map(row)
                  .join("")}`,
            )
            .join("")
        : `<div class="calendar-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => `<div class="weeklabel">${x}</div>`).join("")}${days
            .map(
              (day) =>
                `<div class="calendar-cell ${day === dateKey() ? "today" : ""}"><button class="day-number" data-calendar-day="${day}" aria-label="Open ${day}">${new Date(day + "T12:00:00").getDate()}</button>${state.events
                  .filter((e) => dateKey(new Date(e.start)) === day)
                  .map(
                    (e) =>
                      `<button class="calendar-entry" data-event="${e.id}">${esc(e.title)}</button>`,
                  )
                  .join("")}${state.tasks
                  .filter((t) => t.date === day && t.status !== "Done")
                  .map(
                    (t) =>
                      `<button class="calendar-entry" data-task="${t.id}">Due: ${esc(t.title)}</button>`,
                  )
                  .join("")}</div>`,
            )
            .join("")}</div>`
    }`
  );
}
function collectionView(kind) {
  const courses = kind === "courses",
    items = state[kind].filter(
      (c) =>
        !query ||
        [c.name, c.notes].join(" ").toLowerCase().includes(query.toLowerCase()),
    );
  return (
    heading(
      courses ? "Courses" : "Projects",
      courses
        ? "Keep each class and its deadlines together."
        : "School projects and everything beyond the classroom.",
      courses ? "new-course" : "new-project",
      courses ? "Add course" : "Add project",
    ) +
    (courses
      ? `<div class="toolbar"><button data-action="new-term">Add term</button>${state.terms.map((t) => `<button data-term="${t.id}" title="Archive or restore term">${esc(t.name)}${t.archived ? " · Archived" : ""}</button>`).join("")}</div>`
      : "") +
    `<div class="collection">${items
      .map((c) => {
        const ts = state.tasks.filter(
            (t) => t[courses ? "course" : "project"] === c.id,
          ),
          done = ts.filter((t) => t.status === "Done").length;
        return `<article class="collection-item"><h2>${esc(c.name)}</h2><p>${esc(courses ? state.terms.find((t) => t.id === c.term)?.name || "No term assigned" : c.shared ? "Shared project" : "Personal project")}</p><p>${esc(c.notes || "Make a little progress, one task at a time.")}</p><div class="review-row"><span>${ts.length} tasks</span><span>${done} completed</span></div><div class="actions"><button data-course="${c.id}">View tasks</button><button class="quiet" data-edit-collection="${kind}:${c.id}">Edit</button>${!courses ? `<button class="quiet" data-share="${c.id}">Share</button>` : ""}</div></article>`;
      })
      .join("")}</div>` +
    (!items.length
      ? empty(
          courses ? "Start with one course" : "Give your next project a home",
          courses
            ? "Add a course, then collect its assignments and exams here."
            : "Keep related tasks together without cluttering your day.",
          courses ? "new-course" : "new-project",
          courses ? "Add course" : "Add project",
        )
      : "")
  );
}
function habitsView() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(dateKey(), i - 6));
  return (
    heading(
      "Habits",
      "Small routines, with room for real life.",
      "new-habit",
      "Add habit",
    ) +
    (state.habits.length
      ? state.habits
          .map(
            (h) =>
              `<article class="habit-row"><div><h2>${esc(h.name)}</h2><small>${h.frequency === "weekly" ? "Weekly" : "Daily"} · ${h.days.filter((d) => days.includes(d)).length} check-ins this week</small></div><div class="habit-days">${days.map((d) => `<div><div class="habit-label">${new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</div><button class="habit-day ${h.days.includes(d) ? "checked" : ""}" data-habit="${h.id}:${d}" aria-label="${esc(h.name)} on ${d}" aria-pressed="${h.days.includes(d)}">${h.days.includes(d) ? icon("check") : new Date(d + "T12:00:00").getDate()}</button></div>`).join("")}</div><button class="quiet" data-edit-collection="habits:${h.id}">Edit</button></article>`,
          )
          .join("")
      : empty(
          "Build a rhythm that fits",
          "Reading, movement, a quick review. Start with one habit you want to make space for.",
          "new-habit",
          "Add habit",
        ))
  );
}
function reviewView() {
  const start = addDays(dateKey(), -6),
    done = state.tasks.filter(
      (t) => t.completedAt && t.completedAt.slice(0, 10) >= start,
    ),
    up = state.tasks.filter(
      (t) =>
        t.status !== "Done" &&
        t.date >= dateKey() &&
        t.date <= addDays(dateKey(), 7),
    );
  return (
    heading(
      "Weekly review",
      "Notice your progress. Make space for next week.",
      null,
    ) +
    `<div class="settings"><div class="review-row"><span>Tasks completed in the last 7 days</span><strong>${done.length}</strong></div><div class="review-row"><span>Open deadlines in the next 7 days</span><strong>${up.length}</strong></div><div class="review-row"><span>Habit check-ins in the last 7 days</span><strong>${state.habits.reduce((n, h) => n + h.days.filter((d) => d >= start).length, 0)}</strong></div><h2 class="section-block">Coming into focus</h2>${up.map(row).join("") || '<p class="muted">No deadlines scheduled for the coming week.</p>'}<h2 class="section-block">What you finished</h2>${done.map(row).join("") || '<p class="muted">Your completed work will appear here.</p>'}</div>`
  );
}
function toggle(key, label, desc) {
  return `<div class="setting"><div><h3>${label}</h3><p>${desc}</p></div><button class="switch" role="switch" aria-label="${label}" aria-checked="${key === "widgetProjects" ? state.preferences[key] !== false : !!state.preferences[key]}" data-toggle="${key}"></button></div>`;
}
function settingsView() {
  const p = state.preferences;
  return (
    heading("Settings", "Make Munka feel at home on your desktop.", null) +
    `<div class="settings"><h2>Appearance</h2><div class="setting"><div><h3>Theme</h3><p>Comfortable in daylight and late-night study sessions.</p></div><select id="theme" aria-label="Theme">${["system", "light", "dark"].map((x) => `<option ${p.theme === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>${toggle("dev", "Dev Mode", "Show advanced views, dependencies, bulk actions, and automation tools.")}<h2 class="section-block">Desktop reminders</h2>${toggle("widget", "Desktop widget", "A small, interactive task list alongside your work.")}${widgetAppearance()}${toggle("alwaysOnTop", "Keep widget on top", "Keep your widget above other windows.")}${toggle("wallpaper", "Wallpaper reminders", "Place a task summary on your chosen desktop background.")}<div class="setting"><div><h3>Wallpaper placement</h3><p>The widget and wallpaper can run independently.</p></div><select id="wallpaper-position" aria-label="Wallpaper placement"><option value="right" ${p.wallpaperPosition === "right" ? "selected" : ""}>Right</option><option value="left" ${p.wallpaperPosition === "left" ? "selected" : ""}>Left</option></select></div><div class="setting"><h3>Wallpaper display</h3><select id="wallpaper-display" aria-label="Wallpaper display">${displays.length ? displays.map((d) => `<option value="${d.id}" ${p.wallpaperDisplay === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("") : "<option>Primary display</option>"}</select></div><div class="setting"><h3>Visible reminders</h3><select id="wallpaper-count" aria-label="Visible reminders">${[3, 5, 8].map((n) => `<option ${Number(p.wallpaperCount) === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>${p.wallpaperError ? `<p class="inline-error">${esc(p.wallpaperError)}</p>` : ""}${toggle("privacy", "Hide task details on desktop", "Display “Upcoming task” instead of private task names.")}${toggle("background", "Keep running in the tray", "Closing the window keeps reminders active. Quit from the tray to stop them.")}<h2 class="section-block">Notifications</h2><p class="muted small">Windows notification settings and Focus settings may silence alerts. Munka cannot override them. Use the test below to check delivery.</p><button data-action="test-notification">Send test notification</button>${toggle("sound", "Reminder sounds", "Play a sound when Windows delivers a reminder.")}${toggle("quietEnabled", "Quiet hours", "Hold reminders and deliver a catch-up after quiet hours.")}<div class="form-grid spaced"><label class="field"><span>Start</span><input type="time" id="quiet-start" value="${p.quietStart}"></label><label class="field"><span>End</span><input type="time" id="quiet-end" value="${p.quietEnd}"></label></div><h2 class="section-block">Automation</h2>${toggle("automationPaused", "Pause all automations", "Rules remain saved, including when Dev Mode is off.")}<h2 class="section-block">Your data</h2><p class="muted small">Your planner is stored on this computer. The Windows app keeps 14 rotating local backups. Import always shows a preview before changing your planner.</p><div class="actions"><button data-action="import">Import or restore</button><button data-action="backup">Export full backup</button><button data-action="csv">Export tasks as CSV</button></div><h2 class="section-block">Account & synchronization</h2><p class="muted small">Optional. Connect to a Munka sync service to use multiple PCs and shared projects. Local planning does not require an account.</p><p id="sync-status" role="status">${esc(state.sync.message || "Local only · No sync service connected")}</p><div class="actions"><button data-action="account">${state.sync.account ? "Manage account" : "Connect account"}</button>${state.sync.account ? '<button data-action="sync">Sync now</button><button data-action="accept-invite">Accept invitation</button>' : ""}</div></div>`
  );
}
function devView() {
  return (
    heading(
      "Dev Mode",
      "More control, when you need it.",
      "new-rule",
      "Create rule",
    ) +
    `<div class="toolbar"><button data-action="commands">Command palette <span class="key">Ctrl K</span></button><button data-action="backup">Export JSON</button><button data-action="import">Import JSON</button></div><h2 class="section-block">Saved views</h2><div class="actions">${state.views.map((v) => `<button data-saved-view="${v.id}">${esc(v.name)}</button>`).join("") || '<p class="muted">Save your filters from All tasks.</p>'}</div><h2 class="section-block">Automation rules</h2>${state.preferences.automationPaused ? '<p class="inline-error">All automations are paused in Settings.</p>' : ""}${state.rules.map((r) => `<article class="setting"><div><h3>${esc(r.name)}</h3><p>When ${esc(r.trigger)} → ${esc(r.action)}: ${esc(r.value)}</p></div><button data-rule="${r.id}" aria-pressed="${r.enabled}">${r.enabled ? "Disable" : "Enable"}</button></article>`).join("") || '<p class="muted">Create a rule to take care of a small repeatable step.</p>'}<h2 class="section-block">Execution history</h2><div class="table-scroll"><table><thead><tr><th>Time</th><th>What happened</th></tr></thead><tbody>${state.logs
      .slice(-50)
      .reverse()
      .map(
        (l) =>
          `<tr><td>${esc(new Date(l.at).toLocaleString())}</td><td>${esc(l.message)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`
  );
}
function widgetAppearance() {
  const design = state.preferences.widgetDesign || 'glass';
  return `<details class="widget-customize" ${widgetAppearanceOpen ? 'open' : ''}><summary>Appearance</summary><div class="widget-customize-body"><label for="widget-design">Widget design</label><select id="widget-design">${[['glass','Glass'],['sage','Sage'],['plain','Plain']].map(([v,n]) => `<option value="${v}" ${v === design ? 'selected' : ''}>${n}</option>`).join('')}</select>${toggle('widgetProjects', 'Show projects', 'Keep project work in its own kiosk.')}</div></details>`;
}
function projectKiosk(projects) {
  return `<section class="project-kiosk" aria-label="Current projects"><div class="widget-section-title"><span class="widget-eyebrow">PROJECT WORK</span><span class="widget-count">${projects.length} active</span></div><h1>In progress</h1><p class="muted small">A little space for the bigger things.</p>${projects.map(p => `<section class="widget-project"><div class="project-heading"><h2>${esc(state.preferences.privacy ? 'Current project' : p.name)}</h2><span class="small muted">${p.done}/${p.tasks.length} done</span></div><progress aria-label="Project completion" max="${p.tasks.length || 1}" value="${p.done}"></progress>${p.tasks.map(row).join('') || '<p class="small muted">No tasks yet. Add one in Projects.</p>'}</section>`).join('') || '<p class="widget-empty">No active projects yet. Create one in your planner.</p>'}</section>`;
}
function render() {
  if (!state) return;
  const focusBefore = focusIdentity();
  const dark =
    state.preferences.theme === "dark" ||
    (state.preferences.theme === "system" &&
      matchMedia("(prefers-color-scheme:dark)").matches);
  document.body.classList.toggle("dark", dark);
  if (isWidget) {
    const model = widgetModel(state);
    const design = ['glass', 'sage', 'plain'].includes(state.preferences.widgetDesign) ? state.preferences.widgetDesign : 'glass';
    document.body.classList.add('widget-page');
    document.documentElement.classList.add('widget-root');
    document.body.classList.toggle('widget-browser', !window.munka);
    document.body.dataset.widgetDesign = design;
    const showProjects = state.preferences.widgetProjects !== false;
    $("#app").innerHTML =
      `<main id="main" class="widget-layout"><header><div class="brand"><img src="../assets/munka.png" alt="">Munka</div><div class="widget-header-actions"><button class="quiet" data-action="widget-position" aria-label="Choose widget display and position">Position</button><button class="quiet" data-action="open-main" aria-label="Open full planner">${icon("arrow")}</button></div></header><p class="muted small widget-position-help">Drag the header to move · Resize from an edge</p>${isProjectsWidget ? (showProjects ? projectKiosk(model.projects) : '<p class="widget-empty">Projects are hidden. Turn on Show projects below.</p>') : `<section aria-label="Daily tasks"><div class="widget-section-title"><span class="widget-eyebrow">DAILY TASKS & REMINDERS</span><span class="widget-count">${model.daily.filter(t => t.status === 'Done').length}/${model.daily.length} done</span></div><h1>Your day, in sight.</h1><p class="muted small">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>${model.daily.map(row).join('') || '<p class="widget-empty">A clear day. Add a task in your planner.</p>'}</section>`}${widgetAppearance()}</main>${!window.munka && !isProjectsWidget && showProjects ? `<aside class="widget-layout widget-project-companion">${projectKiosk(model.projects)}</aside>` : ''}`;
    bind();
    restoreFocus(focusBefore);
    return;
  }
  const pages = {
    today: todayView,
    tasks: taskView,
    calendar: calendarView,
    courses: () => collectionView("courses"),
    projects: () => collectionView("projects"),
    habits: habitsView,
    review: reviewView,
    settings: settingsView,
    dev: devView,
  };
  $("#app").innerHTML =
    `<div class="shell">${nav()}<div class="mainwrap"><header class="topbar"><div class="search">${icon("search")}<input id="global-search" aria-label="Search planner" placeholder="Search your planner" value="${esc(query)}"></div><div class="right"><span class="sync-label muted small">${state.sync.account ? "Connected" : "Personal workspace"}</span><button class="quiet" data-action="commands" aria-label="Open command palette"><span class="key">Ctrl K</span></button></div></header><main class="main" id="main" tabindex="-1">${(pages[view] || todayView)()}</main></div></div>`;
  bind();
  if ($(".drawer")) $("#app").inert = true;
  else restoreFocus(focusBefore);
}
function field(label, name, value = "", type = "text", extra = "") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function select(label, name, value, options) {
  return `<label class="field"><span>${label}</span><select name="${name}">${options
    .map((x) => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`;
    })
    .join("")}</select></label>`;
}
function closeDrawer() {
  const el = $(".drawer");
  if (el) el.remove();
  $("#app").inert = false;
  drawerKind = null;
  selected = null;
  restoreFocus(drawerOpener);
  drawerOpener = null;
}
function drawer(title, html, onSubmit) {
  const opener = drawerOpener || focusIdentity();
  closeDrawer();
  drawerOpener = opener;
  const el = document.createElement("aside");
  el.className = "drawer";
  el.setAttribute("aria-label", title);
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `<div class="drawer-head"><h2>${esc(title)}</h2><button class="quiet" id="close-drawer" aria-label="Close details">${icon("close")}</button></div><form id="detail-form">${html}<p class="form-error" role="alert"></p></form>`;
  document.body.append(el);
  $("#app").inert = true;
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const controls = $$(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      el,
    ).filter((x) => !x.hidden);
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  $("#close-drawer").onclick = closeDrawer;
  $("#detail-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(new FormData(e.target));
    } catch (err) {
      $(".form-error", el).textContent = err.message;
    }
  };
  $("input,select,textarea,button", el)?.focus();
  return el;
}
function editTask(id) {
  if (isWidget) {
    bridge.desktop("open", id);
    return;
  }
  const t = state.tasks.find((t) => t.id === id),
    v = t || {
      title: "",
      notes: "",
      date: view === "today" ? dateKey() : "",
      time: "",
      priority: "Normal",
      status: "To do",
      kind: "Task",
      course: state.courses.some((c) => c.id === courseFilter)
        ? courseFilter
        : "",
      project: state.projects.some((c) => c.id === courseFilter)
        ? courseFilter
        : "",
      recurrence: "None",
      reminder: "",
      subtasks: [],
      dependencies: [],
    };
  const el = drawer(
    t ? "Task details" : "New task",
    `${field("Task", "title", v.title, "text", 'required maxlength="500"')}<div class="form-grid">${select("Type", "kind", v.kind, ["Task", "Assignment", "Exam", "Personal"])}${select("Status", "status", v.status, ["To do", "In progress", "Done"])}${field("Due date", "date", v.date, "date")}${field("Due time (optional)", "time", v.time, "time")}${select("Priority", "priority", v.priority, ["Low", "Normal", "High"])}${select("Repeat", "recurrence", v.recurrence, ["None", "Daily", "Weekly"])}${select("Course", "course", v.course, [["", "None"], ...state.courses.map((c) => [c.id, c.name])])}${select("Project", "project", v.project, [["", "None"], ...state.projects.map((c) => [c.id, c.name])])}</div>${field("Assignee (one email, optional)", "assignee", v.assignee || "", "email")}${field("Reminder", "reminder", v.reminder ? localStamp(new Date(v.reminder)) : "", "datetime-local")}<label class="field"><span>Notes</span><textarea name="notes">${esc(v.notes)}</textarea></label><label class="field"><span>Subtasks (one per line; prefix completed items with [x])</span><textarea name="subtasks">${esc(v.subtasks.map((s) => (s.done ? "[x] " : "") + s.title).join("\n"))}</textarea></label>${
      state.preferences.dev
        ? `<label class="field"><span>Depends on</span><select name="dependencies" multiple>${state.tasks
            .filter((x) => x.id !== id)
            .map(
              (x) =>
                `<option value="${x.id}" ${v.dependencies.includes(x.id) ? "selected" : ""}>${esc(x.title)}</option>`,
            )
            .join("")}</select></label>`
        : ""
    }<div class="drawer-footer">${t ? '<button type="button" class="danger quiet" id="delete-task">Delete</button>' : "<span></span>"}<button class="primary" type="submit">${t ? "Save changes" : "Create task"}</button></div>${t ? '<div class="actions spaced"><button type="button" id="snooze-task">Snooze 15 min</button><button type="button" id="plan-task">Plan study time</button></div>' : ""}`,
    async (f) => {
      if (t && !canEdit(t)) throw Error("This shared task is read-only.");
      const data = Object.fromEntries(f);
      data.subtasks = data.subtasks
        .split("\n")
        .filter((x) => x.trim())
        .map((x) => ({
          title: x.replace(/^\[x\]\s*/i, "").trim(),
          done: /^\[x\]/i.test(x),
        }));
      data.dependencies = state.preferences.dev
        ? f.getAll("dependencies")
        : v.dependencies;
      data.reminder = data.reminder
        ? new Date(data.reminder).toISOString()
        : "";
      if (t) {
        const was = t.status;
        Object.assign(
          t,
          task({ ...t, ...data, updatedAt: new Date().toISOString() }),
        );
        if (data.status === "Done" && was !== "Done") {
          t.status = was;
          complete(state, t.id);
        }
      } else {
        const n = task(data);
        state.tasks.push(n);
        runRules(state, "created", n);
      }
      if (await save()) {
        closeDrawer();
        toast(t ? "Task updated" : "Task added");
      }
    },
  );
  drawerKind = "task";
  selected = id;
  $("#delete-task")?.addEventListener("click", () => removeItem("tasks", id));
  $("#snooze-task")?.addEventListener("click", () => snooze(id));
  $("#plan-task")?.addEventListener("click", () => editEvent(null, id));
  if (t && !canEdit(t)) {
    $$("input,select,textarea,#detail-form button", el).forEach(
      (x) => (x.disabled = true),
    );
    const info = document.createElement("p");
    info.className = "muted small";
    info.textContent = "Shared task · Viewer access. This task is read-only.";
    el.append(info);
  }
  if (t && t._sync) {
    const historyButton = document.createElement("button");
    historyButton.textContent = "Activity & previous versions";
    historyButton.type = "button";
    historyButton.className = "spaced";
    historyButton.onclick = () => showHistory(t);
    el.append(historyButton);
  }
}
function showHistory(t) {
  if (!syncClient) {
    toast("Sign in to view shared activity.");
    return;
  }
  syncClient
    .history(t.id)
    .then(({ history }) => {
      drawer(
        "Task activity",
        history
          .map(
            (h) =>
              `<article class="section-block"><h3>Version ${h.version}</h3><p class="muted small">${esc(new Date(h.at).toLocaleString())}</p><p>${esc(h.data.title)}</p><p>${esc(h.data.notes || "")}</p>${canEdit(t) ? `<button type="button" data-restore-version="${h.version}">Restore this version</button>` : ""}</article>`,
          )
          .join("") || "<p>No history yet.</p>",
        async () => {},
      );
      $$("[data-restore-version]").forEach(
        (b) =>
          (b.onclick = async () => {
            const h = history.find(
              (x) => x.version === Number(b.dataset.restoreVersion),
            );
            Object.assign(t, h.data);
            await save();
            closeDrawer();
            toast("Version restored locally. Sync to share the change.");
          }),
      );
    })
    .catch((e) => toast(e.message));
}

function localStamp(d) {
  return (
    dateKey(d) +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
async function snooze(id) {
  const t = state.tasks.find((x) => x.id === id);
  t.reminder = new Date(Date.now() + 15 * 60000).toISOString();
  await save();
  toast("Reminder snoozed for 15 minutes");
}
async function removeItem(kind, id) {
  const item = state[kind].find((x) => x.id === id);
  if (!item) return;
  if (
    !canEdit(item) ||
    (kind === "projects" && item._sync?.role && item._sync.role !== "owner")
  ) {
    toast("You do not have permission to delete this item.");
    return;
  }
  const snapshot = structuredClone(state);
  state[kind] = state[kind].filter((x) => x.id !== id);
  if (kind === "courses" || kind === "projects")
    for (const t of state.tasks)
      if (t[kind === "courses" ? "course" : "project"] === id)
        t[kind === "courses" ? "course" : "project"] = "";
  state.trash.push({ id: uid(), kind, item, at: new Date().toISOString() });
  if (await save()) {
    closeDrawer();
    toast(
      "Deleted. Tasks from removed groups remain in All tasks.",
      async () => {
        const revision = state.revision;
        state = { ...snapshot, revision };
        await save();
        $("#toast").classList.remove("visible");
      },
    );
  }
}
function editCollection(kind, id) {
  const obj = state[kind].find((x) => x.id === id),
    o = obj || { name: "", notes: "", term: "", frequency: "daily", days: [] };
  const singular = {
    courses: "course",
    projects: "project",
    habits: "habit",
    terms: "term",
  }[kind];
  drawer(
    `${obj ? "Edit" : "New"} ${singular}`,
    `${field("Name", "name", o.name, "text", 'required maxlength="160"')}${kind === "courses" ? select("Term", "term", o.term, [["", "None"], ...state.terms.map((t) => [t.id, t.name])]) : ""}${kind === "habits" ? select("Frequency", "frequency", o.frequency, ["daily", "weekly"]) : ""}${kind !== "terms" ? `<label class="field"><span>Notes</span><textarea name="notes">${esc(o.notes)}</textarea></label>` : ""}${obj ? '<p class="muted small">Deleting this group keeps its tasks in All tasks.</p>' : ""}<div class="drawer-footer">${obj ? '<button type="button" id="delete-collection" class="danger quiet">Delete</button>' : "<span></span>"}<button type="submit" class="primary">Save ${singular}</button></div>`,
    async (f) => {
      const data = Object.fromEntries(f);
      if (!data.name.trim()) throw Error("Add a name.");
      if (obj) Object.assign(obj, data);
      else state[kind].push({ id: uid(), days: [], archived: false, ...data });
      if (await save()) closeDrawer();
    },
  );
  $("#delete-collection")?.addEventListener("click", () =>
    removeItem(kind, id),
  );
}
function editEvent(id, taskId) {
  const event = state.events.find((e) => e.id === id),
    linked = state.tasks.find((t) => t.id === taskId),
    e = event || {
      title: linked ? `Study: ${linked.title}` : "",
      kind: linked ? "Study session" : "Event",
      start: calendarDate + "T10:00",
      end: calendarDate + "T11:00",
      taskId: taskId || "",
    };
  drawer(
    event ? "Edit planned time" : "Plan time",
    `${field("Title", "title", e.title, "text", "required")}${select("Type", "kind", e.kind, ["Study session", "Class", "Work shift", "Appointment", "Event"])}${field("Starts", "start", localStamp(new Date(e.start)), "datetime-local", "required")}${field("Ends", "end", localStamp(new Date(e.end || e.start)), "datetime-local", "required")}${select("Linked task", "taskId", e.taskId, [["", "None"], ...state.tasks.map((t) => [t.id, t.title])])}${
      !event
        ? select("Repeat weekly", "weeks", "1", [
            ["1", "Does not repeat"],
            ["4", "4 occurrences"],
            ["8", "8 occurrences"],
            ["16", "16 occurrences"],
          ])
        : ""
    }<p class="muted small">Planned time never changes the linked task’s deadline. Overlaps are allowed and shown in your schedule.</p><div class="drawer-footer">${event ? '<button type="button" id="delete-event" class="danger quiet">Delete</button>' : "<span></span>"}<button class="primary">Save planned time</button></div>`,
    async (f) => {
      const data = Object.fromEntries(f);
      if (new Date(data.end) <= new Date(data.start))
        throw Error("End time must be after start time.");
      const conflict = state.events.some(
        (x) => x.id !== id && overlaps(x, data),
      );
      if (event) Object.assign(event, data);
      else
        for (let i = 0; i < Number(data.weeks || 1); i++) {
          const shift = (s) => {
            const d = new Date(s);
            d.setDate(d.getDate() + 7 * i);
            return localStamp(d);
          };
          state.events.push({
            ...data,
            id: uid(),
            start: shift(data.start),
            end: shift(data.end),
          });
        }
      if (await save()) {
        closeDrawer();
        toast(
          conflict ? "Saved with a schedule overlap" : "Planned time saved",
        );
      }
    },
  );
  $("#delete-event")?.addEventListener("click", () => removeItem("events", id));
}
function ruleForm() {
  drawer(
    "Create automation rule",
    `${field("Rule name", "name", "", "text", "required")}${select(
      "When a task is",
      "trigger",
      "created",
      [
        ["created", "Created"],
        ["completed", "Completed"],
        ["due", "Due"],
      ],
    )}${select("Only when priority is", "condition", "", [["", "Any priority"], "Low", "Normal", "High"])}${select(
      "Action",
      "action",
      "priority",
      [
        ["priority", "Set priority"],
        ["reminder", "Remind in minutes"],
        ["project", "Move to project"],
      ],
    )}<div id="rule-value">${select("Priority", "value", "High", ["Low", "Normal", "High"])}</div><p class="muted small">Each rule runs once per task and trigger. Actions do not trigger additional rules.</p><button type="button" id="preview-rule">Preview rule</button><p id="rule-preview" class="muted small spaced"></p><div class="drawer-footer"><span></span><button class="primary">Create rule</button></div>`,
    async (f) => {
      const r = { id: uid(), enabled: true, ...Object.fromEntries(f) };
      if (
        r.action === "reminder" &&
        (!Number.isFinite(Number(r.value)) || Number(r.value) < 1)
      )
        throw Error("Reminder delay must be a positive number.");
      state.rules.push(r);
      if (await save()) closeDrawer();
    },
  );
  $("[name=action]").onchange = (e) => {
    $("#rule-value").innerHTML =
      e.target.value === "priority"
        ? select("Priority", "value", "High", ["Low", "Normal", "High"])
        : e.target.value === "reminder"
          ? field(
              "Minutes from now",
              "value",
              "15",
              "number",
              'min="1" max="10080" required',
            )
          : select(
              "Project",
              "value",
              "",
              state.projects.map((p) => [p.id, p.name]),
            );
  };
  $("#preview-rule").onclick = () => {
    const f = new FormData($("#detail-form"));
    $("#rule-preview").textContent =
      `When a task is ${f.get("trigger")}${f.get("condition") ? " and has " + f.get("condition") + " priority" : ""}, ${f.get("action")} will be set to ${f.get("value")}. No data has changed.`;
  };
}
async function importFile() {
  const f = await bridge.importFile();
  if (!f) return;
  importData = f;
  showImport();
}
function showImport(mapping) {
  const f = importData;
  try {
    if (f.name.endsWith(".json")) {
      const b = validateBackup(JSON.parse(f.text));
      drawer(
        "Restore backup",
        `<p>This backup contains ${b.tasks.length} tasks, ${b.courses.length} courses, ${b.projects.length} projects, and ${b.habits.length} habits.</p><p>Restoring replaces the current planner. Export your current data first if you want to keep it.</p><label class="checkline"><input name="confirm" type="checkbox" required>Replace my current planner</label><div class="drawer-footer"><button class="primary">Restore backup</button></div>`,
        async () => {
          if (state.preferences.wallpaper)
            await bridge.desktop("wallpaper-disable");
          const rev = state.revision;
          state = {
            ...b,
            revision: rev,
            sync: initialState().sync,
            preferences: {
              ...b.preferences,
              wallpaper: false,
              widget: false,
              wallpaperOriginal: "",
              wallpaperBackground: "",
            },
          };
          if (await save()) {
            closeDrawer();
            toast("Backup restored");
          }
        },
      );
      return;
    }
    if (f.name.endsWith(".ics")) {
      const events = parseICS(f.text),
        rows = events.map((e) => ({
          ...e,
          duplicate: state.events.some(
            (x) =>
              (e.importId && x.importId === e.importId) ||
              (x.title === e.title && x.start === e.start),
          ),
        }));
      drawer(
        "Import calendar",
        `<p>${rows.length} events found. ${rows.filter((e) => e.duplicate).length} duplicates will be skipped.</p>${rows.map((e) => `<p>${esc(e.title)} · ${esc(e.start)} ${e.duplicate ? "(duplicate)" : ""}</p>`).join("")}<div class="drawer-footer"><button class="primary">Import events</button></div>`,
        async () => {
          state.events.push(...rows.filter((e) => !e.duplicate));
          if (await save()) {
            closeDrawer();
            toast("Calendar imported");
          }
        },
      );
      return;
    }
    const parsed = parseCSV(f.text),
      map = mapping || {
        title:
          parsed.header.find((h) => /title|task|name/i.test(h)) ||
          parsed.header[0],
        date: parsed.header.find((h) => /date|due/i.test(h)) || "",
        notes: parsed.header.find((h) => /note/i.test(h)) || "",
      },
      rows = csvPreview(f.text, map, state.tasks);
    drawer(
      "Import tasks",
      `<p>Map your columns, then review every row. Duplicates are skipped. Invalid rows must be fixed in the source file before import.</p>${["title", "date", "notes"].map((k) => select(k[0].toUpperCase() + k.slice(1) + " column", k, map[k], [["", "Not mapped"], ...parsed.header])).join("")}<button type="button" id="remap">Update preview</button><div class="table-scroll spaced"><table><thead><tr><th>Task</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.data.title)}</td><td>${esc(r.data.date)}</td><td class="${r.error ? "error-text" : ""}">${esc(r.error || (r.duplicate ? "Duplicate · skip" : "Ready"))}</td></tr>`).join("")}</tbody></table></div><div class="drawer-footer"><button class="primary" ${rows.some((r) => r.error) || !rows.length ? "disabled" : ""}>Import ${rows.filter((r) => !r.duplicate && !r.error).length} tasks</button></div>`,
      async () => {
        for (const r of rows.filter((r) => !r.duplicate && !r.error))
          if (
            !state.tasks.some(
              (t) => t.title === r.data.title && t.date === r.data.date,
            )
          )
            state.tasks.push(task(r.data));
        if (await save()) {
          closeDrawer();
          toast("Tasks imported");
        }
      },
    );
    $("#remap").onclick = () =>
      showImport(Object.fromEntries(new FormData($("#detail-form"))));
  } catch (e) {
    toast("Import stopped: " + e.message);
  }
}
function commands() {
  drawer(
    "Command palette",
    `<input id="command-query" aria-label="Find a command" placeholder="Where would you like to go?"><div class="command-results spaced">${[
      ["new-task", "Add a task"],
      ["new-event", "Plan a study session"],
      ["goto-today", "Go to Today"],
      ["goto-calendar", "Open calendar"],
      ["goto-settings", "Open settings"],
      ["backup", "Export backup"],
    ]
      .map(
        ([a, l]) =>
          `<button type="button" data-command="${a}">${esc(l)}</button>`,
      )
      .join("")}</div>`,
    async () => {},
  );
  $$("[data-command]").forEach(
    (b) =>
      (b.onclick = () => {
        closeDrawer();
        action(b.dataset.command);
      }),
  );
  $("#command-query").oninput = (e) =>
    $$("[data-command]").forEach(
      (b) =>
        (b.hidden = !b.textContent
          .toLowerCase()
          .includes(e.target.value.toLowerCase())),
    );
}
function sample() {
  if (state.tasks.length) return;
  const c = {
    id: uid(),
    name: "Design foundations",
    notes: "Sample course — replace with your own.",
    term: "",
  };
  state.courses.push(c);
  for (const [title, offset, kind] of [
    ["Outline the research paper", 0, "Assignment"],
    ["Review lecture notes", 0, "Task"],
    ["Prepare for the midterm", 2, "Exam"],
    ["Pick up groceries", 1, "Personal"],
  ])
    state.tasks.push(
      task({
        title,
        date: addDays(dateKey(), offset),
        course: kind === "Personal" ? "" : c.id,
        kind,
        notes: "Sample task — edit or delete this example.",
      }),
    );
  state.events.push({
    id: uid(),
    title: "Library study session",
    kind: "Study session",
    start: dateKey() + "T15:00",
    end: dateKey() + "T16:00",
  });
  state.habits.push({
    id: uid(),
    name: "Read for 20 minutes",
    frequency: "daily",
    days: [],
    notes: "Sample habit",
  });
  save();
  toast("Sample data added. You can edit or delete each example.");
}
async function action(a) {
  try {
    if (a.startsWith("goto-")) {
      view = a.slice(5);
      render();
      return;
    }
    switch (a) {
      case "today-schedule":
        view = "calendar";
        calendarMode = "day";
        calendarDate = dateKey();
        render();
        return;
      case "new-task":
        return editTask();
      case "new-event":
        return editEvent();
      case "new-course":
        return editCollection("courses");
      case "new-project":
        return editCollection("projects");
      case "new-habit":
        return editCollection("habits");
      case "new-term":
        return editCollection("terms");
      case "new-rule":
        return ruleForm();
      case "sample":
        return sample();
      case "commands":
        return commands();
      case "import":
        return await importFile();
      case "backup": {
        const backup = structuredClone(state);
        backup.sync = initialState().sync;
        backup.preferences.wallpaperOriginal = "";
        backup.preferences.wallpaperBackground = "";
        await bridge.exportFile(JSON.stringify(backup, null, 2), "json");
        return;
      }
      case "csv":
        return await bridge.exportFile(exportCSV(state.tasks), "csv");
      case "calendar-prev":
      case "calendar-next": {
        const n = a === "calendar-prev" ? -1 : 1;
        if (calendarMode === "month") {
          const d = new Date(calendarDate + "T12:00:00");
          d.setDate(1);
          d.setMonth(d.getMonth() + n);
          calendarDate = dateKey(d);
        } else
          calendarDate = addDays(
            calendarDate,
            n * (calendarMode === "week" ? 7 : 1),
          );
        return render();
      }
      case "calendar-now":
        calendarDate = dateKey();
        return render();
      case "bulk-complete":
        for (const id of bulk)
          if (
            canEdit(state.tasks.find((t) => t.id === id)) &&
            state.tasks.find((t) => t.id === id)?.status !== "Done"
          )
            complete(state, id);
        bulk.clear();
        return await save();
      case "save-view":
        drawer(
          "Save view",
          field("View name", "name", "", "text", "required") +
            '<button class="primary">Save view</button>',
          async (f) => {
            state.views.push({
              id: uid(),
              name: f.get("name"),
              filter,
              courseFilter,
              query,
            });
            await save();
            closeDrawer();
          },
        );
        return;
      case "test-notification":
        await bridge.desktop(a);
        toast("Test sent. Check Windows notifications.");
        return;
      case "open-main":
        return await bridge.desktop("open");
      case "widget-position":
        return await bridge.desktop("widget-position", isProjectsWidget ? 'projects' : 'daily');
      case "accept-invite":
        return acceptInvite();
      case "account":
        return accountForm();
      case "sync":
        return await doSync();
    }
  } catch (e) {
    toast(e.message);
  }
}
function bind() {
  const customize = document.querySelector('.widget-customize');
  if (customize) customize.ontoggle = () => { widgetAppearanceOpen = customize.open; };
  $$("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        query = "";
        courseFilter = "";
        bulk.clear();
        closeDrawer();
        render();
      }),
  );
  $$("[data-action]").forEach(
    (b) => (b.onclick = () => action(b.dataset.action)),
  );
  $$("[data-task]").forEach(
    (b) => (b.onclick = () => editTask(b.dataset.task)),
  );
  $$("[data-complete]").forEach(
    (b) =>
      (b.onclick = async () => {
        const t = state.tasks.find((t) => t.id === b.dataset.complete);
        if (!canEdit(t)) {
          toast("This shared task is read-only.");
          return;
        }
        complete(state, b.dataset.complete);
        await save();
      }),
  );
  $$("[data-snooze]").forEach(
    (b) => (b.onclick = () => snooze(b.dataset.snooze)),
  );
  $$("[data-event]").forEach(
    (b) => (b.onclick = () => editEvent(b.dataset.event)),
  );
  $$("[data-course]").forEach(
    (b) =>
      (b.onclick = () => {
        courseFilter = b.dataset.course;
        view = "tasks";
        filter = "open";
        render();
      }),
  );
  $$("[data-edit-collection]").forEach(
    (b) =>
      (b.onclick = () =>
        editCollection(...b.dataset.editCollection.split(":"))),
  );
  $$("[data-term]").forEach(
    (b) =>
      (b.onclick = async () => {
        const t = state.terms.find((x) => x.id === b.dataset.term);
        t.archived = !t.archived;
        await save();
        toast(
          t.archived ? "Term archived. Tasks are retained." : "Term restored",
        );
      }),
  );
  $$("[data-calendar-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        calendarMode = b.dataset.calendarMode;
        render();
      }),
  );
  $$("[data-calendar-day]").forEach(
    (b) =>
      (b.onclick = () => {
        calendarDate = b.dataset.calendarDay;
        calendarMode = "day";
        render();
      }),
  );
  $$("[data-habit]").forEach(
    (b) =>
      (b.onclick = async () => {
        const [id, d] = b.dataset.habit.split(":");
        const h = state.habits.find((x) => x.id === id);
        h.days = h.days.includes(d)
          ? h.days.filter((x) => x !== d)
          : [...h.days, d];
        await save();
      }),
  );
  $$("[data-rule]").forEach(
    (b) =>
      (b.onclick = async () => {
        const r = state.rules.find((x) => x.id === b.dataset.rule);
        r.enabled = !r.enabled;
        await save();
      }),
  );
  $$("[data-saved-view]").forEach(
    (b) =>
      (b.onclick = () => {
        const v = state.views.find((x) => x.id === b.dataset.savedView);
        ({ filter, courseFilter, query } = v);
        view = "tasks";
        render();
      }),
  );
  $$("[data-bulk]").forEach(
    (b) =>
      (b.onchange = () => {
        b.checked ? bulk.add(b.dataset.bulk) : bulk.delete(b.dataset.bulk);
        render();
      }),
  );
  $$("[data-share]").forEach(
    (b) => (b.onclick = () => shareForm(b.dataset.share)),
  );
  $$("[data-toggle]").forEach(
    (b) =>
      (b.onclick = async () => {
        const k = b.dataset.toggle;
        try {
          if (k === "wallpaper") {
            await bridge.desktop(
              state.preferences.wallpaper
                ? "wallpaper-disable"
                : "wallpaper-enable",
            );
            state = await bridge.load();
            render();
            return;
          }
          if (k === "widget" && !window.munka)
            throw Error("Desktop widgets are available in the Windows app.");
          state.preferences[k] = k === 'widgetProjects' ? state.preferences[k] === false : !state.preferences[k];
          if (k === "dev" && !state.preferences.dev) {
            if (view === "dev") view = "settings";
            if (["high", "blocked"].includes(filter)) filter = "open";
          }
          await save();
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  const search = $("#global-search");
  if (search)
    search.oninput = (e) => {
      query = e.target.value;
      view = "tasks";
      render();
      const q = $("#global-search");
      q.focus();
      q.setSelectionRange(query.length, query.length);
    };
  if ($("#quick-add"))
    $("#quick-add").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const title = new FormData(e.target).get("title");
        const n = task({
          title,
          date: view === "today" ? dateKey() : "",
          course: state.courses.some((c) => c.id === courseFilter)
            ? courseFilter
            : "",
          project: state.projects.some((c) => c.id === courseFilter)
            ? courseFilter
            : "",
        });
        state.tasks.push(n);
        runRules(state, "created", n);
        await save();
        $("#quick-add input")?.focus();
      } catch (e) {
        toast(e.message);
      }
    };
  if ($("#status-filter"))
    $("#status-filter").onchange = (e) => {
      filter = e.target.value;
      render();
    };
  if ($("#course-filter"))
    $("#course-filter").onchange = (e) => {
      courseFilter = e.target.value;
      render();
    };
  for (const [id, key] of [
    ["theme", "theme"],
    ["widget-design", "widgetDesign"],
    ["wallpaper-position", "wallpaperPosition"],
    ["wallpaper-display", "wallpaperDisplay"],
    ["wallpaper-count", "wallpaperCount"],
    ["quiet-start", "quietStart"],
    ["quiet-end", "quietEnd"],
  ])
    if ($("#" + id))
      $("#" + id).onchange = async (e) => {
        state.preferences[key] = e.target.value;
        await save();
      };
}
function accountForm() {
  drawer(
    "Connect your account",
    `<p class="muted small">Use your hosted Munka sync service. The service URL is provided by whoever runs your Munka server.</p>${field("Service URL", "url", state.sync.url || "", "url", 'required placeholder="https://sync.example.com"')}${field("Email", "email", state.sync.account?.email || "", "email", "required")}${field("Password", "password", "", "password", 'required minlength="12" autocomplete="current-password"')}${select(
      "Action",
      "mode",
      "login",
      [
        ["login", "Sign in"],
        ["register", "Create account"],
      ],
    )}<p>Before the first sync, Munka will preview how your local planner is merged.</p><button class="primary">Connect</button>${state.sync.account ? '<button type="button" id="disconnect" class="quiet">Disconnect account</button>' : ""}`,
    async (f) => {
      const { SyncClient } = await import("./sync.mjs");
      if (state.sync.account && state.sync.account.email !== f.get("email"))
        throw Error("Disconnect the current account before switching users.");
      syncClient = new SyncClient(f.get("url"));
      const a = await syncClient.authenticate(
        f.get("mode"),
        f.get("email"),
        f.get("password"),
      );
      state.sync.url = f.get("url");
      state.sync.account = a.user;
      if (bridge.session)
        await bridge.session("save", {
          url: syncClient.url,
          token: syncClient.token,
          user: a.user,
        });
      state.sync.message = "Connected · First sync needs review";
      await save();
      closeDrawer();
      await doSync();
    },
  );
  $("#disconnect")?.addEventListener("click", async () => {
    await syncClient?.logout();
    if (bridge.session) await bridge.session("clear");
    syncClient = null;
    state.sync = initialState().sync;
    await save();
    closeDrawer();
  });
}
async function doSync() {
  try {
    if (!syncClient)
      throw Error("Sign in again to synchronize. Your local planner is safe.");
    const preview = await syncClient.preview(state);
    drawer(
      "Review synchronization",
      `<p>${preview.uploads.length} local records to upload. ${preview.downloads.length} remote records to download. ${preview.conflicts.length} conflicts need your choice.</p>${preview.conflicts
        .map(
          (c, i) =>
            `<div class="section-block"><h3>${esc(c.title)} · ${esc(c.field)}</h3>${select(
              "Keep version",
              `conflict-${i}`,
              "remote",
              [
                ["remote", "Remote: " + JSON.stringify(c.remote)],
                ["local", "Local: " + JSON.stringify(c.local)],
              ],
            )}</div>`,
        )
        .join(
          "",
        )}<p class="muted small">Independent changes are merged. Personal settings and desktop preferences stay on this computer.</p><button class="primary">Apply synchronization</button>`,
      async (f) => {
        state = await syncClient.apply(state, preview, Object.fromEntries(f));
        state.sync.auto = true;
        state.sync.message = "Synced " + new Date().toLocaleTimeString();
        if (await save()) {
          closeDrawer();
          toast("Planner synchronized");
        }
      },
    );
  } catch (e) {
    state.sync.message = "Sync failed: " + e.message;
    await save();
    toast(state.sync.message);
  }
}
function acceptInvite() {
  drawer(
    "Accept invitation",
    field("Invitation code", "code", "", "text", "required") +
      '<button class="primary">Accept invitation</button>',
    async (f) => {
      if (!syncClient) throw Error("Connect an account first.");
      await syncClient.accept(f.get("code"));
      closeDrawer();
      await doSync();
    },
  );
}
async function shareForm(id) {
  if (!state.sync.account || !syncClient) {
    toast("Connect an account in Settings before sharing.");
    view = "settings";
    render();
    return;
  }
  const project = state.projects.find((p) => p.id === id);
  if (project._sync?.role && project._sync.role !== "owner") {
    drawer(
      "Shared project",
      `<h3>${esc(project.name)}</h3><p>Your role: ${esc(project._sync.role)}</p><button type="button" id="leave-project">Leave project</button>`,
      async () => {},
    );
    $("#leave-project").onclick = async () => {
      await syncClient.removeMember(id, state.sync.account.id);
      closeDrawer();
      await doSync();
    };
    return;
  }
  drawer(
    "Share project",
    `<h3>${esc(project.name)}</h3><p>Only this project and its tasks will be shared. Personal courses, habits, reminders, and other projects stay private.</p>${field("Invite email", "email", "", "email", "required")}${select(
      "Role",
      "role",
      "viewer",
      [
        ["viewer", "Viewer — read only"],
        ["editor", "Editor — manage tasks"],
      ],
    )}<button class="primary">Create invitation</button><p id="invitation-result" class="spaced"></p><button type="button" id="manage-members">Manage members</button><div id="members" class="spaced"></div>`,
    async (f) => {
      await syncClient.publishProject(
        project,
        state.tasks.filter((t) => t.project === id),
      );
      const invite = await syncClient.invite(id, f.get("email"), f.get("role"));
      project.shared = true;
      await save();
      $("#invitation-result").textContent =
        `Invitation code: ${invite.code}. Share this code with your collaborator; it is not sent automatically.`;
    },
  );
  $("#manage-members").onclick = async () => {
    try {
      const { members } = await syncClient.members(id);
      $("#members").innerHTML = members
        .map(
          (m) =>
            `<div class="setting"><span>${esc(m.email)} · ${esc(m.role)}</span>${m.role !== "owner" ? `<button type="button" data-remove-member="${esc(m.userId)}">Remove</button>` : ""}</div>`,
        )
        .join("");
      $$("[data-remove-member]").forEach(
        (b) =>
          (b.onclick = async () => {
            await syncClient.removeMember(id, b.dataset.removeMember);
            b.closest(".setting").remove();
          }),
      );
    } catch (e) {
      toast(e.message);
    }
  };
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDrawer();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    commands();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
    e.preventDefault();
    editTask();
  }
});
matchMedia("(prefers-color-scheme:dark)").addEventListener("change", () =>
  render(),
);
async function automaticSync() {
  if (syncBusy || !syncClient || !state.sync.auto || $(".drawer") || isWidget)
    return;
  syncBusy = true;
  try {
    const preview = await syncClient.preview(state);
    if (preview.conflicts.length) {
      state.sync.message = `${preview.conflicts.length} sync conflicts need review in Settings.`;
      state.sync.conflicts = preview.conflicts;
      await save();
      return;
    }
    state = await syncClient.apply(state, preview, {});
    state.sync.message = "Synced " + new Date().toLocaleTimeString();
    await save();
  } catch (e) {
    state.sync.message =
      "Offline or sync failed. Changes are saved locally; retry in Settings.";
    if (!state.sync.pending.length)
      state.sync.pending = [{ at: new Date().toISOString() }];
    await save();
  } finally {
    syncBusy = false;
  }
}
setInterval(automaticSync, 60000);
window.addEventListener("online", automaticSync);
try {
  state = await bridge.load();
  if (bridge.session && !isWidget) {
    const session = await bridge.session("load");
    if (session) {
      const { SyncClient } = await import("./sync.mjs");
      syncClient = new SyncClient(session.url);
      syncClient.token = session.token;
      syncClient.user = session.user;
    }
  }
  render();
  displays = await bridge.desktop("displays");
  bridge.onChange((next) => {
    state = next;
    if (!$(".drawer")) render();
  });
  if (!isWidget && bridge.onOpenTask) {
    bridge.onOpenTask((id) => {
      if (state.tasks.some((task) => task.id === id)) editTask(id);
    });
    const pending = await bridge.ready();
    if (pending && state.tasks.some((task) => task.id === pending))
      editTask(pending);
  }
} catch (e) {
  $("#app").innerHTML = empty(
    "Your planner could not open",
    esc(e.message),
    null,
  );
}



