import {
  initialState,
  task,
  uid,
  dateKey,
  addDays,
  complete,
  runRules,
  validateBackup,
  csvPreview,
  parseCSV,
  exportCSV,
  overlaps,
} from "./domain.mjs";
import { plannerRenderModel, filteredPlannerTasks } from './planner-render-model.mjs';
import { compareTasks } from './task-order.mjs';
import { openDayPlan, workloadSummary } from './workload-dialog.mjs';
import { accountMenu } from './account-menu.mjs';
import { icon } from './icons.mjs';
import { createBrowserBridge } from './browser-bridge.mjs';
import { createCloudSync } from './cloud-sync.mjs';
import { sharingDialogs } from './sharing-dialogs.mjs';
import { platformCapabilities } from './platform.mjs';
import { mobileNavigation, moreView, bindMobile, registerMobile } from './mobile.mjs';
import { taskForm } from './task-form.mjs';
import { mountAccountEntry } from './account-entry.mjs';
import { openOnboarding } from './onboarding.mjs';
import { openProductGuide } from './product-guide.mjs';
import { openSyllabus } from './syllabus-dialog.mjs';
import { openCalendarConnections } from './calendar-connections.mjs';
import { effort } from './workload.mjs';
import { openBatchTasks } from './batch-task-dialog.mjs';
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
let renderModel,
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
    "data-cal-select",
    "data-cal-action",
    "data-calendar-mode",
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
  calendarShowDone = true,
  calendarSource = 'all',
  calendarFocus = 'all',
  drawerKind = null,
  toastTimer,
  importData = null,
  bulk = new Set(),
  displays = [],
  accountStatus = null;
let accessMode = 'locked', cleanupEntry = null, accountReturn = null;
let appVersion = { version: '0.12.0-beta.3', build: 'Mobile web beta' };
let capabilities = window.munka?.capabilities || platformCapabilities('web');
const isWidget = new URLSearchParams(location.search).has("widget");
const isProjectsWidget = new URLSearchParams(location.search).get('widget') === 'projects';
import { widgetModel, widgetTaskState } from './widget-model.mjs';
import { desktopView } from './desktop-view.mjs';
import { resizeHandles, bindOverlayControls } from './widget-controls.mjs';
import { calendarView as renderCalendar, bindCalendar } from './calendar-view.mjs';
import { calendarScope } from './calendar-picker.mjs';
import { calendarActions } from './calendar-dialogs.mjs';
import { aiActions } from './ai-dialogs.mjs';
import { calendarColors, validCalendarColor } from './calendar-colors.mjs';
const bridge = window.munka || createBrowserBridge();
let calendarStatusKey='', calendarRefreshPending=false;
const calendarDrafts=new Map();
const cloud = createCloudSync({bridge,onPlannerChange:(next,identity)=>{
  if(accessMode!=='account'||accountStatus?.id!==identity||!state||next.revision<state.revision)return;
  state=next;
  if($('.drawer'))calendarRefreshPending=true;else render();
},onStatus:status=>{
  const el=$('#cloud-sync-status');if(el)el.textContent=status.message;
  const key=JSON.stringify([status.calendars,status.invitations]);
  if(key===calendarStatusKey)return;
  calendarStatusKey=key;
  if(accessMode!=='account'||!state)return;
  if(view==='calendar') {if($('.drawer'))calendarRefreshPending=true;else render();}
}});
const sharing = sharingDialogs({...extensionTools(),cloud});
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
    state = await bridge.save(state, state.revision, isWidget ? undefined : accessMode==='account' ? accountStatus.id : null);
    render();
    cloud.changed();
    return true;
  } catch (e) {
    state = await bridge.load();
    render();
    toast(e.message);
    return false;
  }
}
function activeTasks() {
  return renderModel.active;
}
function canEdit(t) {
  return !t?.externalCalendar && t?._sync?.role !== "viewer";
}
function filtered() {
  return filteredPlannerTasks(renderModel,{filter,courseFilter,query});
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
  const course = renderModel.courses.get(t.course),
    project = renderModel.projects.get(t.project);
  const widgetState = widgetTaskState(t);
  const urgent = t.priority === 'High' || widgetState.overdue;
  const displayTitle = isWidget && state.preferences.privacy ? 'Hidden task' : t.title;
  return `<article class="task-row ${t.status === "Done" ? "completed" : ""} ${urgent ? "task-urgent" : ""} ${isWidget && urgent ? "widget-urgent" : ""}">${state.preferences.dev && !isWidget ? `<input type="checkbox" aria-label="Select ${esc(displayTitle)}" data-bulk="${t.id}" ${bulk.has(t.id) ? "checked" : ""}>` : ""}<button class="check ${t.status === "Done" ? "done" : ""}" data-complete="${t.id}" aria-label="${t.status === "Done" ? "Reopen" : "Complete"} ${esc(displayTitle)}">${t.status === "Done" ? icon("check") : ""}</button><button class="task-open" data-task="${t.id}"><span class="task-title">${esc(displayTitle)}</span><span class="task-meta">${!isWidget || !state.preferences.privacy ? `<span>${esc(course?.name || project?.name || "Personal")}</span>` : ""}${!["Task", "Personal"].includes(t.kind) ? `<span>${esc(t.kind)}</span>` : ""}${t.priority === "High" ? '<span class="badge urgent">High priority</span>' : ""}${widgetState.overdue ? '<span class="badge urgent">Overdue</span>' : ""}${t.status === "In progress" ? '<span class="badge">In progress</span>' : ""}${renderModel.blocked(t) ? '<span class="badge">Blocked</span>' : ""}${t.subtasks.length ? `<span>${t.subtasks.filter((x) => x.done).length}/${t.subtasks.length} subtasks</span>` : ""}</span></button><span class="task-due ${t.date && t.date < dateKey() && t.status !== "Done" ? "overdue" : ""}">${isWidget && t.status === "Done" ? "Done" : esc(prettyDate(t.date))}${t.time ? `<br>${esc(t.time)}` : ""}</span>${isWidget && t.status !== "Done" ? `<button class="quiet" data-snooze="${t.id}" aria-label="Snooze ${esc(displayTitle)} for 15 minutes">${icon("clock")}</button>` : ""}${isWidget ? `<button class="quiet widget-dismiss" data-widget-hide="${t.id}" aria-label="Hide ${esc(displayTitle)} from widget" title="Hide from widget">${icon("close")}</button>` : ""}</article>`;
}
function empty(title, text, action = "new-task", label = "Add a task") {
  return `<div class="empty">${icon("inbox")}<h2>${title}</h2><p>${text}</p>${action ? `<button class="primary" data-action="${action}">${icon("plus")}<span>${label}</span></button>` : ""}</div>`;
}
function nav() {
  const navIcon = id => `<img class="nav-icon" src="../assets/navigation/${id === 'today' ? 'home' : id}.svg" alt="">`;
  const groups = [
    [['today', 'Home']],
    [['calendar', 'Calendar'], ['tasks', 'Tasks'], ['courses', 'Courses'], ['projects', 'Projects']],
    [['habits', 'Habits'], ['review', 'Weekly review'], ...(capabilities.overlays ? [['desktop', 'Desktop']] : [])],
  ];
  if (state.preferences.dev) groups[2].push(['dev', 'Dev Mode']);
  const navigation = groups.map(group => `<div class="nav-group">${group.map(([id, label]) => `<button class="navbtn ${view === id ? 'active' : ''}" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${navIcon(id)}${label}${id === 'today' ? `<span class="count">${activeTasks().filter(t => t.status !== 'Done' && t.date && t.date <= dateKey()).length}</span>` : ''}</button>`).join('')}</div>`).join('<hr class="nav-divider">');
  return `<aside class="sidebar"><div class="brand"><img src="../assets/munka.png" alt="Munka monkey logo">Munka</div><nav aria-label="Main navigation">${navigation}</nav><p class="nav-caption">Your courses</p>${state.courses
    .filter((c) => !state.terms.some((t) => t.id === c.term && t.archived))
    .slice(0, 5)
    .map(
      (c) =>
        `<button class="course-mini" data-course="${c.id}"><span class="dot"></span>${esc(c.name)}</button>`,
    )
    .join(
      "",
    )}<button class="course-mini muted" data-action="new-course">${icon("plus")} Add course</button><div class="sidebar-bottom"><button class="navbtn ${view === "settings" ? "active" : ""}" data-view="settings" ${view === "settings" ? 'aria-current="page"' : ""}>${navIcon("settings")}Settings</button><div class="local"><span class="dot"></span>${accountStatus?.signedIn ? "Signed in · Saved on this device" : "Local mode · Saved on this device"}</div></div></aside>`;
}
function heading(title, text, action = "new-task", label = "Add task") {
  return `<div class="heading"><div><h1>${title}</h1><p>${text}</p></div>${action ? `<button class="primary" data-action="${action}">${icon("plus")}${label}</button>` : ""}</div>`;
}
function capture() {
  return `<form class="capture" id="quick-add"><input name="title" aria-label="Quick task title" placeholder="Add a task…" required maxlength="500"><button class="quiet" type="submit" aria-label="Add quick task">${icon("plus")}</button><button class="quiet" type="button" data-action="capture-plan">Plan with Munka</button></form>`;
}
function todayView() {
  const ts = activeTasks().filter(t => t.status !== 'Done').sort(compareTasks),
    now = dateKey(),
    due = ts.filter((t) => (t.date && t.date <= now) || t.planDate === now),
    next = ts.filter((t) => t.date > now && t.planDate !== now).slice(0, 5),
    anytime = ts.filter((t) => !t.date && t.planDate !== now),
    done = state.tasks.filter((t) => t.completedAt?.startsWith(now)).length,
    events = state.events
      .filter((e) => dateKey(new Date(e.start)) === now)
      .sort((a, b) => a.start.localeCompare(b.start));
  return `${heading("Home", new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}${workloadSummary(state,esc)}<div class="compact-schedule"><div><strong>${events.length ? "Next planned session" : "Today’s schedule"}</strong><p>${events.length ? esc((events.find((e) => new Date(e.end || e.start) > new Date()) || events[0]).title) : "No sessions planned yet."}</p></div><button class="quiet" data-action="today-schedule">View schedule ${icon("arrow")}</button></div><div class="workspace"><div><div class="day-summary"><div><h2>${due.length ? "Make room for what matters." : "A little space to plan."}</h2><p>${due.length ? `${due.length} task${due.length === 1 ? "" : "s"} to focus on. ${done ? `${done} completed today.` : "One thing at a time."}` : "Capture your next task and give it a place in your day."}</p></div><div class="summary-mark">${icon("today")}</div></div><div class="section-head"><h2>Your focus</h2><span>${due.length} task${due.length === 1 ? '' : 's'}</span></div>${due.length ? due.map(row).join("") : empty("Your day is clear", "Add an assignment, a personal task, or something you want to remember.", null)}${capture()}${anytime.length ? `<section aria-label="Tasks without a date"><div class="section-head"><h2>Anytime</h2><span>No deadline set</span></div><p class="muted small">Captured and ready when you are. Open a task to give it a date.</p>${anytime.map(row).join("")}</section>` : ""}${next.length ? `<div class="section-head"><h2>Coming up</h2><button class="quiet small" data-view="tasks">View all ${icon("arrow")}</button></div>${next.map(row).join("")}` : ""}${!state.tasks.length ? '<button class="quiet small" data-action="sample">Explore with sample tasks</button>' : ""}</div><aside class="agenda"><h2>Your schedule</h2><p class="agenda-date">Planned time, separate from deadlines</p>${events.length ? events.map((e) => `<div class="event"><time>${new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time><div class="event-content"><strong>${esc(e.title)}</strong><small>${esc(e.kind)}${state.events.some((x) => x.id !== e.id && overlaps(x, e)) ? " · Overlaps another event" : ""}</small><button class="quiet small" data-event="${e.id}">Edit</button></div></div>`).join("") : '<p class="muted small">No time blocks yet. A small study session is a good place to start.</p>'}<button class="quiet small" data-action="new-event">${icon("plus")}Plan a session</button>${capabilities.overlays ? `<div class="notice">${icon("desktop")}<h3 class="spaced">Keep your day in sight</h3><p>Bring your next tasks onto your desktop, even when your planner is tucked away.</p><button data-view="desktop">Desktop overlays ${icon("arrow")}</button></div>` : ''}</aside></div>`;
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
        : "Tasks",
      "Due dates first. High-priority tasks lead within each date.",
    ) +
    `<div class="toolbar"><select id="status-filter" aria-label="Filter tasks">${["open", "overdue", "undated", "high", "all", "done", ...(state.preferences.dev ? ["blocked"] : [])].map((x) => `<option value="${x}" ${filter === x ? "selected" : ""}>${{ open: "Open tasks", overdue: "Overdue", undated: "No date", all: "All statuses", done: "Completed", high: "High priority", blocked: "Blocked" }[x]}</option>`).join("")}</select><select id="course-filter" aria-label="Filter by course or project"><option value="">All courses & projects</option>${[...state.courses, ...state.projects].map((c) => `<option value="${c.id}" ${courseFilter === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${(query || courseFilter || filter !== "open") ? '<button class="quiet" data-action="clear-filters">Clear filters</button>' : ""}${state.preferences.dev ? '<button data-action="save-view">Save view</button>' : ""}${bulk.size ? `<button data-action="bulk-complete">Complete ${bulk.size} selected</button>` : ""}<button data-action="batch-tasks">${icon("plus")}Paste tasks</button></div>${capture()}${list.length ? list.map(row).join("") : empty(activeTasks().length ? "No matching tasks" : "Your tasks start here", activeTasks().length ? "Clear your filters to see more of your planner." : "Capture an assignment, errand, or something you want to remember.", activeTasks().length ? "clear-filters" : null, "Clear filters")}`
  );
}
function calendarView() {
  const status=cloud.getStatus();
  if(calendarScope(calendarSource,status.calendars).missing) {calendarDrafts.delete(calendarSource);calendarSource='all';calendarFocus='all';}
  return renderCalendar({ state, date: calendarDate, mode: calendarMode, showDone: calendarShowDone, source: calendarSource, focus: calendarFocus, sharedCalendars:status.calendars, invitations:status.invitations.length, esc, icon });
}
function extensionTools() {return {bridge,getState:()=>state,save,drawer,field,select,esc,closeDrawer,toast,refresh:async()=>{state=await bridge.load();render();}};}
function planPrompt(text='') {if(accessMode !== 'account') return munkaAccountPanel('Sign in to use Munka Assistant. Your draft will be kept.', { assistantPrompt: text }); return aiActions(extensionTools()).open(text).catch(error=>toast(error.message));}
function batchTasks() {
  openBatchTasks({ getState: () => state, save, drawer, field, select, esc, closeDrawer, toast });
}
function calendarTools() {
  return calendarActions({ getState: () => state, save, drawer, field, select, esc, toast, closeDrawer, pickFile: () => bridge.importFile() });
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
      state[kind].length ? (courses ? "new-course" : "new-project") : null,
      courses ? "Add course" : "Add project",
    ) +
    (courses
      ? `<div class="toolbar">${capabilities.syllabus ? '<button data-action="syllabus">Import syllabus</button>' : ''}<button data-action="new-term">Add term</button>${state.terms.map((t) => `<button data-term="${t.id}" title="Archive or restore term">${esc(t.name)}${t.archived ? " · Archived" : ""}</button>`).join("")}</div>`
      : "") +
    `<div class="collection">${items
      .map((c) => {
        const ts = (courses ? renderModel.byCourse : renderModel.byProject).get(c.id) || [],
          done = ts.filter((t) => t.status === "Done").length;
        return `<article class="collection-item"><h2>${esc(c.name)}</h2><p>${esc(courses ? state.terms.find((t) => t.id === c.term)?.name || "No term assigned" : c.shared ? "Shared project" : "Personal project")}</p><p>${esc(c.notes || "Make a little progress, one task at a time.")}</p><div class="review-row"><span>${ts.length} task${ts.length === 1 ? '' : 's'}</span><span>${done} completed</span></div><div class="actions"><button data-course="${c.id}">View tasks</button><button class="quiet" data-edit-collection="${kind}:${c.id}">Edit</button></div></article>`;
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
      state.habits.length ? "new-habit" : null,
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
  return heading('Settings', 'Make Munka fit the way you work.', null) + `
    <div class="settings">
      <h2 >Munka account</h2>
      <p class="muted small">Sign in to sync your personal planner across devices and share selected calendars. Local plans stay private until you choose to copy and sync them.</p>
      <p role="status">${accountStatus?.signedIn ? `Signed in as ${esc(accountStatus.email)}` : 'Using Munka locally'}</p>
      <div class="actions"><button data-action="munka-account">${accountStatus?.signedIn ? 'Account details' : 'Sign in or create account'}</button>${accountStatus?.signedIn ? '<button data-action="munka-switch-account">Switch account</button><button data-action="munka-signout">Sign out</button>' : ''}<button data-action="product-guide">Take a quick tour</button></div>
      <h2 class="section-block">Sync & shared calendars</h2><p id="cloud-sync-status" role="status">${esc(cloud.getStatus().message)}</p><div class="actions"><button data-action="account-sync">Sync across devices</button><button data-action="shared-calendars">Shared calendars & invitations</button></div>
      <h2 class="section-block">Your setup</h2>
      <div class="setting"><div><h3>Make Munka yours</h3><p>Adjust your planning focus and desktop preferences.</p></div><button data-action="personalize">Personalize Munka</button></div>
      ${capabilities.connections ? '<div class="setting"><div><h3>Google & Outlook</h3><p>Bring selected calendars into your planner.</p></div><button data-action="connections">Connected calendars</button></div>' : ''}
      <h2 class="section-block">Appearance</h2>
      <div class="setting"><div><h3>Theme</h3><p>Comfortable in daylight and late-night study sessions.</p></div><select id="theme" aria-label="Theme">${['system','light','dark'].map(x => `<option ${p.theme === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      ${toggle('dev', 'Dev Mode', 'Show advanced views, dependencies, bulk actions, and automation tools.')}
      ${capabilities.overlays ? `<div class="setting"><div><h3>Desktop overlays${capabilities.wallpaper ? ' & wallpaper' : ''}</h3><p>Choose what stays visible alongside your work.</p></div><button data-view="desktop">Open Desktop ${icon('arrow')}</button></div>` : ''}
      ${capabilities.notifications ? `<h2 class="section-block">Notifications</h2>
      <p class="muted small">${capabilities.platform === 'darwin' ? 'macOS notification and Focus settings' : 'Windows notification and Focus settings'} may silence alerts. Use the test below to check delivery.</p>
      <button data-action="test-notification">Send test notification</button>
      ${toggle('sound', 'Reminder sounds', 'Play a sound when your computer delivers a reminder.')}
      ${toggle('quietEnabled', 'Quiet hours', 'Hold reminders and deliver a catch-up after quiet hours.')}
      <div class="form-grid spaced" ${p.quietEnabled?'':'hidden'}><label class="field"><span>Start</span><input type="time" id="quiet-start" value="${p.quietStart}"></label><label class="field"><span>End</span><input type="time" id="quiet-end" value="${p.quietEnd}"></label></div>
      ` : `<section class="beta-device-note"><h2>Mobile beta</h2><p id="mobile-connectivity">${navigator.onLine ? 'Plans stay on this device' : 'Offline · Plans stay on this device'}</p><p class="muted small">Reminders appear in your planner. Alerts while the app is closed, AI, connected calendars and syllabus extraction are not available in this beta.</p><div class="actions"><button id="mobile-install" type="button">Install on your phone</button><button id="mobile-update" type="button" hidden>Update app</button></div></section>`}<h2 class="section-block">Automation</h2>
      ${toggle('automationPaused', 'Pause all automations', 'Rules remain saved, including when Dev Mode is off.')}
      <h2 class="section-block">Import & backups</h2>
      <p class="muted small">Import tasks from CSV, calendar events from ICS, or restore a Munka JSON backup. Every import opens a review before anything changes.</p>
      <div class="actions"><button data-action="import">Import a file</button>${capabilities.syllabus ? '<button data-action="syllabus">Import syllabus</button>' : ''}<button data-action="backup">Export full backup</button><button data-action="csv">Export tasks as CSV</button></div>
      <p class="muted small spaced">${capabilities.desktop ? 'The desktop app keeps 14 rotating local backups.' : 'Export backups regularly. Clearing browser data removes plans saved here. Local and signed-in planners have separate device storage.'} Your planner works offline without an account.</p>
      <details class="settings-about section-block"><summary>About Munka</summary><p class="muted small">Version ${esc(appVersion.version)} · ${esc(appVersion.build)}</p><p class="muted small">Plan with Munka uses the connected AI service. No API key needed. Syllabus review works locally. Google / Outlook connections require provider setup. ChatGPT account linking is not available.</p></details>
    </div>`;
}
function devView() {
  return (
    heading(
      "Dev Mode",
      "More control, when you need it.",
      "new-rule",
      "Create rule",
    ) +
    `<div class="toolbar"><button data-action="commands">Command palette <span class="key">${capabilities.shortcut}</span></button><button data-action="backup">Export JSON</button><button data-action="import">Import JSON</button></div><h2 class="section-block">Saved views</h2><div class="actions">${state.views.map((v) => `<button data-saved-view="${v.id}">${esc(v.name)}</button>`).join("") || '<p class="muted">Save your filters from All tasks.</p>'}</div><h2 class="section-block">Automation rules</h2>${state.preferences.automationPaused ? '<p class="inline-error">All automations are paused in Settings.</p>' : ""}${state.rules.map((r) => `<article class="setting"><div><h3>${esc(r.name)}</h3><p>When ${esc(r.trigger)} → ${esc(r.action)}: ${esc(r.value)}</p></div><button data-rule="${r.id}" aria-pressed="${r.enabled}">${r.enabled ? "Disable" : "Enable"}</button></article>`).join("") || '<p class="muted">Create a rule to take care of a small repeatable step.</p>'}<h2 class="section-block">Execution history</h2><div class="table-scroll"><table><thead><tr><th>Time</th><th>What happened</th></tr></thead><tbody>${state.logs
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
  const hiddenCount = widgetModel(state).hiddenCount;
  const design = state.preferences.widgetSurface === 'panel' ? (state.preferences.widgetDesign || 'glass') : 'seamless';
  const size = state.preferences[isProjectsWidget ? 'projectsWidgetSize' : 'widgetSize'] || 'compact';
  return `<details class="widget-customize" ${widgetAppearanceOpen || !isWidget ? 'open' : ''}><summary>Appearance & position</summary><div class="widget-customize-body"><label for="widget-design">Background</label><select id="widget-design">${[['seamless','None · seamless'],['glass','Soft glass'],['sage','Sage'],['plain','Plain']].map(([v,n]) => `<option value="${v}" ${v === design ? 'selected' : ''}>${n}</option>`).join('')}</select>${design === 'seamless' ? `<label for="widget-ink">Lettering</label><select id="widget-ink"><option value="dark" ${state.preferences.widgetInk !== 'light' ? 'selected' : ''}>Dark · for light wallpaper</option><option value="light" ${state.preferences.widgetInk === 'light' ? 'selected' : ''}>Light · for dark wallpaper</option></select><p class="small muted">Only your tasks sit over your wallpaper. Choose Soft glass if the background makes text hard to read.</p>` : ''}<label for="widget-size">${isProjectsWidget ? 'Projects size' : 'Daily tasks size'}</label><select id="widget-size"><option value="compact" ${size === 'compact' ? 'selected' : ''}>Compact</option><option value="roomy" ${size === 'roomy' ? 'selected' : ''}>Roomy</option></select>
    ${!isWidget ? `<label for="projects-widget-size">Projects size</label><select id="projects-widget-size"><option value="compact" ${state.preferences.projectsWidgetSize !== 'roomy' ? 'selected' : ''}>Compact</option><option value="roomy" ${state.preferences.projectsWidgetSize === 'roomy' ? 'selected' : ''}>Roomy</option></select>` : ''}
    ${isWidget ? toggle('privacy', 'Hide task details', `Hide names on both widgets${capabilities.wallpaper ? ' and wallpaper' : ''}. Turn off to show them again.`) : ''}
    ${hiddenCount ? `<button class="quiet" data-widget-restore>Show hidden tasks (${hiddenCount})</button>` : ''}
    <p class="small muted">Drag an edge to adjust the size, or use these presets.</p>${isWidget && window.munka ? '<div class="widget-placement-controls"><button class="quiet" data-action="widget-position">Choose display</button><button data-overlay-adjust="move" aria-describedby="widget-keyboard-help">Move with arrows</button><button data-overlay-adjust="resize" aria-describedby="widget-keyboard-help">Resize with arrows</button></div><p id="widget-keyboard-help" class="small muted">Focus a move or resize button, then use arrow keys. Hold Shift for smaller steps.</p>' : ''}${isWidget ? toggle('widgetProjects', 'Show projects', 'Keep project work in its own overlay.') : ''}</div></details>`;
}
function projectKiosk(projects) {
  return `<section class="project-kiosk" aria-label="Current projects"><div class="widget-section-title"><h1>Projects</h1><span class="widget-count">${projects.length} active</span></div><p class="muted small">A little space for the bigger things.</p>${projects.map(p => `<section class="widget-project"><div class="project-heading"><h2>${esc(state.preferences.privacy ? 'Current project' : p.name)}</h2><span class="small muted">${p.done}/${p.tasks.length} done</span></div><progress aria-label="Project completion" max="${p.tasks.length || 1}" value="${p.done}"></progress>${p.visibleTasks.map(row).join('') || '<p class="small muted">No tasks to show here. Open Projects to see the full history.</p>'}</section>`).join('') || '<p class="widget-empty">No active projects yet. Create one in your planner.</p>'}</section>`;
}
if (isWidget) {
  let renderedDay = dateKey();
  const refreshWidgetDate = () => {
    const today = dateKey();
    if (state && today !== renderedDay) { renderedDay = today; render(); }
  };
  setInterval(refreshWidgetDate, 60000);
  document.addEventListener('visibilitychange', refreshWidgetDate);
}
function render() {
  if (accessMode === 'locked' || !state) return;
  renderModel = plannerRenderModel(state);
  const focusBefore = focusIdentity();
  const captureBefore = $('#quick-add input');
  const captureDraft = captureBefore ? {value:captureBefore.value,context:captureBefore.form.dataset.context} : null;
  const quickBefore = $('#calendar-quick-add');
  const quickDraft = quickBefore ? { values: Object.fromEntries(new FormData(quickBefore)), day: quickBefore.dataset.selectedDay, target:quickBefore.dataset.creationTarget } : null;
  if(quickDraft)calendarDrafts.set(quickDraft.target,quickDraft);
  const dark =
    state.preferences.theme === "dark" ||
    (state.preferences.theme === "system" &&
      matchMedia("(prefers-color-scheme:dark)").matches);
  document.body.classList.toggle("dark", dark);
  if (isWidget) {
    const model = widgetModel(state);
    const design = state.preferences.widgetSurface === 'panel' ? (['glass', 'sage', 'plain'].includes(state.preferences.widgetDesign) ? state.preferences.widgetDesign : 'glass') : 'seamless';
    document.body.classList.add('widget-page');
    document.documentElement.classList.add('widget-root');
    document.body.classList.toggle('widget-browser', !window.munka);
    document.body.dataset.widgetDesign = design;
    document.body.dataset.widgetInk = state.preferences.widgetInk === 'light' ? 'light' : 'dark';
    document.body.dataset.widgetSize = state.preferences[isProjectsWidget ? 'projectsWidgetSize' : 'widgetSize'] || 'compact';
    const showProjects = state.preferences.widgetProjects !== false;
    $("#app").innerHTML =
      `${window.munka ? resizeHandles() : '<p class="widget-preview-note">Visual preview · Desktop movement works in the Mac and Windows apps</p>'}<main id="main" class="widget-layout"><header><div class="brand"><img src="../assets/munka.png" alt="">Munka</div><div class="widget-header-actions"><button class="quiet" data-action="open-main" aria-label="Open full planner" title="Open planner">${icon("arrow")}</button>${window.munka ? `<button class="quiet" data-action="widget-off" aria-label="Hide this overlay" title="Hide overlay · restore from Desktop or ${capabilities.platform === 'darwin' ? 'menu bar' : 'tray'}">${icon('close')}</button>` : ''}</div></header><p class="muted small widget-position-help">${window.munka ? 'Drag here to move · Resize from an edge' : 'Your tasks, directly over your wallpaper'}</p>${isProjectsWidget ? (showProjects ? projectKiosk(model.projects) : '<p class="widget-empty">Projects are hidden. Turn on Show projects below.</p>') : `<section aria-label="Daily tasks"><div class="widget-section-title"><h1>Tasks and reminders</h1><span class="widget-count">${model.daily.filter(t => t.status === 'Done').length}/${model.daily.length} done</span></div><p class="muted small">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>${model.daily.map(row).join('') || (model.dailyHiddenCount ? '<p class="widget-empty">Your tasks are hidden from this widget.</p><button class="quiet" data-widget-restore>Show hidden tasks</button>' : '<p class="widget-empty">No tasks to show here. Open your planner to add work or see completed tasks.</p>')}</section>`}${widgetAppearance()}</main>${!window.munka && !isProjectsWidget && showProjects ? `<aside class="widget-layout widget-project-companion">${projectKiosk(model.projects)}</aside>` : ''}`;
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
    desktop: () => capabilities.overlays ? desktopView({state, displays, capabilities, heading, toggle, appearance: widgetAppearance, esc}) : heading('Desktop features', 'Overlays are available in the Mac and Windows desktop apps.', null),
    more: () => moreView({heading, capabilities, dev: state.preferences.dev}),
    dev: devView,
  };
  $("#app").innerHTML =
    `<div class="shell">${nav()}<div class="mainwrap"><header class="topbar"><div class="mobile-brand"><img src="../assets/munka.png" alt="">Munka</div><div class="search">${icon("search")}<input id="global-search" aria-label="Search planner" placeholder="Search your planner" value="${esc(query)}"></div><div class="right"><span class="sync-label muted small">${accessMode === "account" ? "Saved on this device" : "Local mode"}</span><button class="quiet" data-action="commands" aria-label="Open command palette"><span class="key">${capabilities.shortcut}</span></button>${accountMenu(accountStatus)}</div></header><main class="main" id="main" tabindex="-1">${(pages[view] || todayView)()}</main></div>${mobileNavigation(view)}</div>`;
  bind();
  bindMobile({drawer, toast});
  const captureAfter = $('#quick-add input');
  if(captureAfter && captureDraft && captureDraft.context===view+':'+courseFilter) captureAfter.value=captureDraft.value;
  if(captureAfter) captureAfter.form.dataset.context=view+':'+courseFilter;
  const quickAfter = $('#calendar-quick-add');
  if (quickAfter) {
    quickAfter.dataset.selectedDay = calendarDate;
    const matchingDraft=calendarDrafts.get(quickAfter.dataset.creationTarget);
    if (matchingDraft) {
      quickAfter.elements.title.value = matchingDraft.values.title;
      if (matchingDraft.day === calendarDate) quickAfter.elements.date.value = matchingDraft.values.date;
    }
  }
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
  if (el) { el.dispatchEvent(new Event('munka-drawer-close')); el.remove(); }
  $("#app").inert = false;
  drawerKind = null;
  selected = null;
  if(calendarRefreshPending&&state&&accessMode!=='locked'){calendarRefreshPending=false;render();}
  restoreFocus(drawerOpener);
  drawerOpener = null;
}
function drawer(title, html, onSubmit = () => {}) {
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
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
      el,
    ).filter((x) => !x.hidden && x.getClientRects().length);
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
    if (e.target.dataset.submitting) return;
    e.target.dataset.submitting = 'true';
    try {
      await onSubmit(new FormData(e.target));
    } catch (err) {
      $(".form-error", el).textContent = err.message;
    } finally {
      delete e.target.dataset.submitting;
    }
  };
  $("input,select,textarea,button", el)?.focus();
  return el;
}
function editTask(id, defaults = {}) {
  if (isWidget) {
    bridge.desktop("open", id);
    return;
  }
  let t = state.tasks.find((t) => t.id === id);
  const originalTask = t ? JSON.stringify(t) : '';
  const v = t || {
      title: "",
      notes: "",
      date: view === "today" ? dateKey() : view === 'calendar' ? calendarDate : "",
      time: "",
      priority: "Normal",
      status: "To do",
      kind: state.preferences.defaultTaskKind || "Task",
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
      ...defaults,
    };
  const el = drawer(
    t ? "Task details" : "New task",
    taskForm({ value: { ...v, reminder: v.reminder ? localStamp(new Date(v.reminder)) : '' }, existing: t, state, field, select, esc }),
    async (f) => {
      if (t) {
        const current = state.tasks.find(x => x.id === id);
        if (!current || JSON.stringify(current) !== originalTask) throw Error('This task changed in another window. Reopen it to review the latest version before saving.');
        t = current;
      }
      if (t && !canEdit(t)) throw Error("This shared task is read-only.");
      const data = Object.fromEntries(f);
      data.estimateMinutes = effort(data.estimateMinutes);
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
  el.querySelector('#task-source')?.addEventListener('click',async()=>{try{const source=await bridge.syllabus('source',t.sourceRef);drawer('Syllabus source',`<p>${esc(source.filename)} · ${esc(source.location)}</p><pre class="source-passage">${esc(source.excerpt)}</pre><p class="small muted">Accepted deadline: ${esc(source.acceptedDate || 'No deadline')}. This excerpt is stored locally on this PC.</p>`);}catch(error){toast(error.message);}});
  el.classList.add("task-drawer");
  el.addEventListener("invalid", event => { event.target.closest("details")?.setAttribute("open", ""); }, true);
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
      "Deleted. Tasks from removed groups remain in Tasks.",
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
  let event = state.events.find((e) => e.id === id);
  if(event?._sync?.space)return sharing.editEvent(event);
  if(event?.externalCalendar) {drawer('Connected calendar event',`<h3>${esc(event.title)}</h3><p>${esc(prettyDate(event.start.slice(0,10)))}</p><p>${esc(event.start)} – ${esc(event.end)}</p><p>${esc(event.location || '')}</p><p class="muted">Read-only from ${event.source==='google'?'Google Calendar':'Outlook'}. Edit the original event there; Munka refreshes automatically while running.</p>`);return;}
  const originalEvent = event ? JSON.stringify(event) : '';
  const
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
    `${field("Title", "title", e.title, "text", "required")}${select("Type", "kind", e.kind, ["Study session", "Class", "Work shift", "Appointment", "Event"])}${select('Calendar color', 'color', e.color || 'auto', calendarColors)}${e.allDay ? field('Starts · all day', 'start', e.start.slice(0,10), 'date', 'required') + field('Ends · exclusive date', 'end', (e.end || addDays(e.start.slice(0,10),1)).slice(0,10), 'date', 'required') : field('Starts', 'start', localStamp(new Date(e.start)), 'datetime-local', 'required') + field('Ends', 'end', localStamp(new Date(e.end || e.start)), 'datetime-local', 'required')}${field('Location (optional)', 'location', e.location || '')}${select("Linked task", "taskId", e.taskId, [["", "None"], ...state.tasks.map((t) => [t.id, t.title])])}${
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
      if (id) {
        const current = state.events.find(item => item.id === id);
        if (!current || JSON.stringify(current) !== originalEvent) throw Error('This event changed in another window. Reopen it to review the latest version before saving.');
        event = current;
      }
      if (event && !canEdit(event)) throw Error('This shared event is read-only.');
      if (!validCalendarColor(data.color)) throw Error('Choose a valid event color.');
      if (e.allDay) { data.start += 'T00:00:00'; data.end += 'T00:00:00'; }
      if (!Number.isFinite(new Date(data.start).getTime()) || !Number.isFinite(new Date(data.end).getTime())) throw Error('Choose valid start and end times.');
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
          if (capabilities.wallpaper && state.preferences.wallpaper)
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
              widgetProjects: false,
              widgetClickThrough: false,
              launchAtLogin: state.preferences.launchAtLogin,
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
    if (/\.ics$/i.test(f.name)) {
      calendarTools().importSetup(f);
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
      ["goto-today", "Go to Home"],
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
      case "batch-tasks":
        return batchTasks();
      case "personalize": return openOnboarding(extensionTools());
      case "syllabus": return openSyllabus(extensionTools());
      case "connections": if(accessMode !== 'account') return munkaAccountPanel('Sign in to connect Google or Outlook calendars.'); return openCalendarConnections(extensionTools()).catch(error=>toast(error.message));
      case "account-sync": if(accessMode!=='account')return munkaAccountPanel('Sign in to sync your planner across devices.');return sharing.syncPanel();
      case "shared-calendars": if(accessMode!=='account')return munkaAccountPanel('Sign in to view invitations or share a calendar.');return sharing.calendars();
      case "capture-plan": return planPrompt(document.querySelector('#quick-add [name=title]')?.value || '');
      case "day-plan":
        return openDayPlan({getState:()=>state,save,drawer,field,esc,closeDrawer,toast});
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
            n * (calendarMode === "agenda" ? 14 : calendarMode === "week" ? 7 : 1),
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
        toast("Test sent. Check your system notifications.");
        return;
      case "open-main":
        return await bridge.desktop("open");
      case "widget-position":
        return await bridge.desktop("widget-position", isProjectsWidget ? 'projects' : 'daily');
      case "widget-off":
        return await bridge.desktop('widget-off', isProjectsWidget ? 'projects' : 'daily');
      case "widget-recover":
        return await bridge.desktop('widget-recover');
      case "wallpaper-preview": {
        if (!capabilities.wallpaper) throw Error('Wallpaper reminders are available in the Windows app.');
        const preview = await bridge.desktop('wallpaper-preview');
        if (preview) drawer('Wallpaper preview', `<p class="small muted">Preview only. Your wallpaper has not changed.</p><img class="wallpaper-preview-image" alt="Wallpaper reminder preview" src="data:image/png;base64,${preview}">`);
        return;
      }
      case "munka-signout":
        return leaveAccount(false);
      case "munka-switch-account":
        return leaveAccount(true);
      case "product-guide":
        return openProductGuide(extensionTools());
      case "munka-account":
        return munkaAccountPanel();
    }
  } catch (e) {
    toast(e.message);
  }
}
function bind() {
  if (view === 'calendar' && !isWidget) {
    const actions = calendarTools();
    const scope=()=>calendarScope(calendarSource,cloud.getStatus().calendars);
    const addShared=(day,title='')=>{
      const selected=scope();
      if(!selected.shared||!selected.canCreate) return toast('Adding events is not allowed for this calendar.');
      return sharing.editEvent(null,selected.calendar,{date:day,title,onSaved:()=>{
        calendarDrafts.delete('shared:'+selected.calendar.id);
        const form=$('#calendar-quick-add');if(form?.dataset.creationTarget==='shared:'+selected.calendar.id)form.elements.title.value='';
      }});
    };
    const quick = () => $('#calendar-quick-add input[name=title]')?.focus();
    bindCalendar({
      root: $('.calendar-workspace'), onError: error => toast(error.message),
      onMove: actions.move, onMoveDialog: actions.moveDialog,
      onOpen: (type, id) => type === 'task' ? editTask(id) : editEvent(id),
      onSelect: (day, showDetails = false) => {
        calendarDate = day; render();
        if (showDetails) { const panel = $('.cal-selected'); panel?.scrollIntoView({block:'nearest'}); panel?.focus({preventScroll:true}); }
      },
      onAdd: day => { calendarDate=day; if(scope().shared)return addShared(day); if(!scope().canCreate)return; render(); $('#calendar-quick-add input[name=date]').value = day; quick(); },
      onPlan: day => { calendarDate=day; if(scope().shared)return addShared(day); if(scope().canCreate)editEvent(); },
      onStudy: (id, day) => {
        const task = state.tasks.find(t => t.id === id);
        if (!task || !canEdit(task)) return toast('This task is no longer editable.');
        calendarDate = day; editEvent(null,id);
      },
      onQuick: async input => {
        if(scope().missing)return toast('Calendar access changed. Refresh or choose another calendar.');
        if(scope().shared)return addShared(input.date,input.title);
        if(!scope().canCreate)return toast('Choose My planner to add a task.');
        if (await actions.addDraft({...input,kind:state.preferences.defaultTaskKind || "Task"})) {
          $('#calendar-quick-add input[name=title]').value = '';
          quick();
        }
      },
      onFilter: async (key, value) => {
        if (key === 'empty') { state.preferences.calendarAgendaEmpty = value; await save(); return; }
        if (key === 'done') calendarShowDone = value; else if (key === 'focus') calendarFocus = value; else {calendarSource=value; if(value.startsWith('shared:'))calendarFocus='all';} render();
        if(key==='source')$('#calendar-picker-trigger')?.focus({preventScroll:true});
      },
      onAction: name => {
        if (name === 'clear') { calendarFocus = 'all'; calendarSource = 'all'; calendarShowDone = true; render(); }
        if (name === 'guided') actions.guided(calendarDate);
        if (name === 'batch') batchTasks();
        if (name === 'plan-prompt') planPrompt(document.querySelector('#calendar-quick-add [name=title]')?.value || '');
        if (name === 'connections') action('connections');
        if (name === 'shared') action('shared-calendars');
        if (name === 'share-current') {const selected=scope(); if(accessMode!=='account')return munkaAccountPanel('Sign in to invite people or share a calendar.'); if(selected.shared)sharing.shareCalendar(selected.calendar).catch(error=>toast(error.message)); else action('shared-calendars');}
        if (name === 'import') actions.importSetup();
        if (name === 'details') editTask(null, Object.fromEntries(new FormData($('#calendar-quick-add'))));
      },
    });
  }
  if (isWidget && window.munka) bindOverlayControls({ bridge, surface: isProjectsWidget ? 'projects' : 'daily', onError: error => toast(error.message) });
  const sizeControl = document.querySelector('#widget-size');
  if (sizeControl) sizeControl.onchange = async e => {
    const size = e.target.value;
    const key = isProjectsWidget ? 'projectsWidgetSize' : 'widgetSize';
    if (window.munka) {
      try { await bridge.desktop('widget-size', { surface: isProjectsWidget ? 'projects' : 'daily', size }); }
      catch (error) { toast(error.message); }
    } else { state.preferences[key] = size; await save(); }
  };
  const customize = document.querySelector('.widget-customize');
  const projectsSizeControl = document.querySelector('#projects-widget-size');
  if (projectsSizeControl) projectsSizeControl.onchange = async e => {
    try {
      if (window.munka) await bridge.desktop('widget-size', { surface: 'projects', size: e.target.value });
      else { state.preferences.projectsWidgetSize = e.target.value; await save(); }
    } catch (error) { toast(error.message); }
  };
  const designControl = document.querySelector('#widget-design');
  if (designControl) designControl.onchange = async e => {
    state.preferences.widgetSurface = e.target.value === 'seamless' ? 'seamless' : 'panel';
    if (e.target.value !== 'seamless') state.preferences.widgetDesign = e.target.value;
    await save();
  };
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
    (b) => (b.onclick = () => { b.closest('.account-menu')?.removeAttribute('open'); action(b.dataset.action); }),
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
  $$('[data-widget-hide]').forEach(button => button.onclick = async () => {
    const id=button.dataset.widgetHide;
    const nextId = button.closest('.task-row').nextElementSibling?.querySelector('[data-widget-hide]')?.dataset.widgetHide;
    const previousId = button.closest('.task-row').previousElementSibling?.querySelector('[data-widget-hide]')?.dataset.widgetHide;
    state.preferences.widgetHiddenTasks=[...new Set([...(state.preferences.widgetHiddenTasks || []),id])];
    if(await save()) {
      const next = $$('[data-widget-hide]').find(b => b.dataset.widgetHide === (nextId || previousId));
      (next || $('[data-widget-restore]') || $('.widget-customize summary'))?.focus({preventScroll:true});
      toast('Hidden from widgets. Still in your planner.',async()=>{
        state.preferences.widgetHiddenTasks=(state.preferences.widgetHiddenTasks || []).filter(hidden=>hidden!==id);
        if (await save()) {
          toast('Task restored to your widget.');
          $$('[data-widget-hide]').find(b => b.dataset.widgetHide === id)?.focus({preventScroll:true});
        }
      });
    }
  });
  $$('[data-widget-restore]').forEach(button => button.onclick = async () => {
    state.preferences.widgetHiddenTasks=[];
    if(await save())toast('Hidden tasks restored. Completed past-due tasks stay tucked away.');
  });
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
      (b.onclick = async () => {
        calendarMode = b.dataset.calendarMode;
        state.preferences.calendarMode = calendarMode;
        await save();
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
  $$("[data-toggle]").forEach(
    (b) =>
      (b.onclick = async () => {
        const k = b.dataset.toggle;
        try {
          if (k === 'launchAtLogin') {
            if (!capabilities.launchAtLogin) throw Error('Starting at login is available in the Windows app.');
            await bridge.desktop('launch-at-login', !state.preferences.launchAtLogin);
            state = await bridge.load(); render(); return;
          }
          if (k === "wallpaper") {
            if (!capabilities.wallpaper) throw Error('Wallpaper reminders are available in the Windows app.');
            await bridge.desktop(
              state.preferences.wallpaper
                ? "wallpaper-disable"
                : "wallpaper-enable",
            );
            state = await bridge.load();
            render();
            return;
          }
          if (['widget', 'widgetProjects', 'widgetClickThrough'].includes(k) && !capabilities.overlays)
            throw Error("Desktop overlays are available in the Mac and Windows desktop apps.");
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
          kind: state.preferences.defaultTaskKind || "Task",
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
        const submitted = String(title);
        if(await save()) {
          const input=$("#quick-add input");
          if(input?.value===submitted) input.value='';
        }
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
    ["widget-ink", "widgetInk"],
    ["widget-layer", "widgetLayer"],
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
function captureAccountReturn(intent = {}) {
  const quick = $('#calendar-quick-add');
  const capture = $('#quick-add');
  return {
    calendar: quick ? Object.fromEntries(new FormData(quick)) : null,
    capture: capture ? Object.fromEntries(new FormData(capture)) : null,
    ...intent,
  };
}
let leavingAccount = false;
async function leaveAccount(switching) {
  if (leavingAccount) return;
  leavingAccount = true;
  cloud.stop(); closeDrawer(); accountReturn = null;
  accessMode = 'locked'; state = null; accountStatus = null;
  cleanupEntry?.(); cleanupEntry = null;
  const host = $('#app'); host.inert = true;
  // Private planner content is removed immediately. Animate a neutral shell only.
  host.innerHTML = `<main class="account-entry" aria-busy="true"><div class="entry-form-wrap account-exit" role="status"><h1>${switching ? 'Switching accounts…' : 'Signing out…'}</h1><p>Your plans are saved.</p></div></main>`;
  let notice = switching ? 'Sign in with another account. Each account has its own planner.' : 'You’re signed out. Sign in or use your local planner.';
  try {
    const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? Promise.resolve() : new Promise(resolve => setTimeout(resolve,160));
    await Promise.all([bridge.account('signOut'),motion]);
  } catch(error) {
    try { await bridge.account('lock'); } catch { /* The renderer remains locked. */ }
    notice = `Your planner is locked. ${error.message}`;
  } finally {
    leavingAccount = false; host.inert = false; showAccountEntry(notice);
    $('#entry-email')?.focus();
  }
}
function showAccountEntry(notice = '') {
  calendarDrafts.clear(); calendarRefreshPending=false;
  cloud.stop();
  accessMode = 'locked'; closeDrawer(); state = null;
  cleanupEntry?.();
  cleanupEntry = mountAccountEntry({host: $('#app'), bridge, version: appVersion.version, notice, returning: !!accountReturn, onEnter: activatePlanner});
}
async function activatePlanner(status) {
  if (!['local','account'].includes(status.mode)) throw Error('Choose how to open Munka.');
  const next = await bridge.load();
  cleanupEntry?.(); cleanupEntry = null;
  accessMode = status.mode; accountStatus = status; state = next;
  calendarDrafts.clear(); calendarRefreshPending=false;
  calendarSource='all'; calendarFocus='all';
  calendarMode = ['day','week','month','agenda'].includes(state.preferences.calendarMode) ? state.preferences.calendarMode : 'month';
  render();
  if (!isWidget) {
    const host = $('#app'); host.classList.remove('planner-enter');
    void host.offsetWidth; host.classList.add('planner-enter');
    host.addEventListener('animationend', () => host.classList.remove('planner-enter'), {once:true});
  }
  displays = await bridge.desktop('displays');
  if(!isWidget&&status.mode==='account') {
    await cloud.start(status.id);
    if(location.hash.startsWith('#invite='))await sharing.calendars();
  }else if(!isWidget)cloud.stop();
  const returning = accountReturn;
  accountReturn = null;
  if (returning) {
    for (const [selector, values] of [['#calendar-quick-add', returning.calendar], ['#quick-add', returning.capture]]) {
      const form = $(selector);
      if (form && values) for (const [name, value] of Object.entries(values)) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
    }
    if (status.mode === 'account' && returning.assistantPrompt !== undefined) await planPrompt(returning.assistantPrompt);
    else ($('#calendar-quick-add [name=title]') || $('#quick-add [name=title]'))?.focus();
    return;
  }
  if (!isWidget && bridge.ready) {
    const pending = await bridge.ready();
    if (pending && state.tasks.some(task => task.id === pending)) editTask(pending);
  }
  if (!isWidget && !appVersion.testProfile && !state.preferences.onboardingVersion) openOnboarding(extensionTools());
}
async function munkaAccountPanel(notice = '', intent = {}) {
  if (accountStatus?.signedIn && accessMode === 'account') {
    drawer('Munka account', `<p>Signed in as <strong>${esc(accountStatus.email)}</strong>.</p><p>${esc(cloud.getStatus().message)}. Enable personal sync in Settings to use this planner across devices.</p><p class="muted small">${accountStatus.secure ? 'Your session is protected by the operating system.' : 'Your session lasts only while this app is open.'}</p><div class="actions"><button type="button" id="munka-switch-account">Switch account</button><button type="button" id="munka-signout">Sign out</button></div>`);
    $('#munka-signout').onclick = () => leaveAccount(false);
    $('#munka-switch-account').onclick = () => leaveAccount(true);
    return;
  }
  accountReturn = captureAccountReturn(intent);
  await bridge.account?.('lock');
  showAccountEntry(typeof notice === 'string' ? notice : '');
}
document.addEventListener("keydown", (e) => {
  if (accessMode === 'locked') return;
  if (e.key === "Escape") {
    const menu = $('.account-menu[open]');
    if (menu) { menu.removeAttribute('open'); $('#account-menu-toggle')?.focus(); return; }
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
document.addEventListener('click', event => {
  const menu = $('.account-menu[open]');
  if (menu && !menu.contains(event.target)) menu.removeAttribute('open');
});
matchMedia("(prefers-color-scheme:dark)").addEventListener("change", () => {
  if (state?.preferences.theme === 'system') render();
});
bridge.onChange(next => {
  if (accessMode === 'locked') return;
  state = next; if (!$('.drawer')) render();
});
bridge.onAccessChange?.(next => { if(next.mode === 'locked' && !leavingAccount) showAccountEntry('Sign in or choose Use locally to continue.'); });
bridge.onOpenTask?.(id => { if(accessMode !== 'locked' && state?.tasks.some(task => task.id === id)) editTask(id); });
try {
  if (bridge.version) appVersion = await bridge.version();
  capabilities = appVersion.capabilities || window.munka?.capabilities || platformCapabilities(appVersion.platform || 'web');
  document.body.classList.toggle('platform-mac', capabilities.platform === 'darwin');
  if (!window.munka) await registerMobile();
  const theme = appVersion.theme || 'system';
  document.body.classList.toggle('dark', theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches));
  if (isWidget) await activatePlanner({mode:'local',signedIn:false});
  else {
    let status = {mode:'locked',signedIn:false};
    try { if(bridge.account) status = await bridge.account('status'); } catch {}
    if (['account','local'].includes(status.mode)) await activatePlanner(status);
    else showAccountEntry();
    await bridge.ready?.();
  }
} catch(error) {
  if(!isWidget) showAccountEntry(error.message);
  else $('#app').textContent = error.message;
}
