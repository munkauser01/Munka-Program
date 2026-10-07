import { addDays, dateKey, validDate } from './domain.mjs';
import { activePlannerTasks } from './planner-selectors.mjs';
import { compareTasks } from './task-order.mjs';

export const calendarDateLabel = (day, options = { weekday: 'long', month: 'short', day: 'numeric' }) =>
  new Date(day + 'T12:00:00').toLocaleDateString('en-US', options);

export function calendarDays(day, mode) {
  const d = new Date(day + 'T12:00:00');
  if (!validDate(day)) throw Error('Choose a valid calendar date.');
  let start = day, count = 1;
  if (mode === 'agenda') count = 14;
  else if (mode === 'week') {
    start = addDays(day, -((d.getDay() + 6) % 7));
    count = 7;
  } else if (mode === 'month') {
    const first = dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
    const offset = (new Date(first + 'T12:00:00').getDay() + 6) % 7;
    start = addDays(first, -offset);
    count = Math.ceil((offset + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) / 7) * 7;
  }
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function eventOnDay(event, day) {
  // All-day DTEND is exclusive; never parse date-only values as UTC midnights.
  if (event.allDay) return event.start.slice(0, 10) <= day &&
    day < (event.end?.slice(0, 10) || addDays(event.start.slice(0, 10), 1));
  const start = new Date(event.start), end = new Date(event.end || event.start);
  const a = new Date(day + 'T00:00:00'), b = new Date(addDays(day, 1) + 'T00:00:00');
  return start < b && (end > a || (start >= a && end.getTime() === start.getTime()));
}

export function calendarItems(state, days, { showDone = true, source = 'all', focus = 'all' } = {}) {
  const byDay = new Map(days.map(day => [day, { tasks: [], events: [] }]));
  const taskIndex = new Map(state.tasks.map(t => [t.id, t]));
  const matches = item => focus === 'all' || (focus === 'personal' ? !item.course && !item.project : focus.startsWith('course:') ? item.course === focus.slice(7) : focus.startsWith('project:') && item.project === focus.slice(8));
  const active = activePlannerTasks(state).filter(t => (showDone || t.status !== 'Done') && matches(t));
  const ranges = days.map(day => ({ day, start: +new Date(day + 'T00:00:00'), end: +new Date(addDays(day, 1) + 'T00:00:00') }));
  if (source === 'all' || source === 'personal' || source === 'tasks') {
    for (const t of active) byDay.get(t.date)?.tasks.push(t);
  }
  if (source !== 'tasks') for (const event of state.events) {
    if (!source.startsWith('shared:') && (state.preferences?.hiddenSharedCalendars || []).includes(event._sync?.space)) continue;
    if(source.startsWith('shared:')) { if(event._sync?.space!==source.slice(7))continue; }
    else if(source === 'personal') { if(event._sync?.space || event.externalCalendar || !['munka',undefined,''].includes(event.source))continue; }
    else if (source !== 'all' && (event._sync?.space || source !== (event.source || 'munka'))) continue;
    if (!matches(event.taskId ? taskIndex.get(event.taskId) || event : event)) continue;
    if (event.allDay) {
      const start = event.start.slice(0, 10), end = event.end?.slice(0, 10) || addDays(start, 1);
      for (const {day} of ranges) if (start <= day && day < end) byDay.get(day).events.push(event);
    } else {
      const start = +new Date(event.start), end = +new Date(event.end || event.start);
      for (const range of ranges) if (start < range.end && (end > range.start || (start >= range.start && end === start))) byDay.get(range.day).events.push(event);
    }
  }
  for (const group of byDay.values()) {
    group.tasks.sort(compareTasks);
    group.events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || new Date(a.start) - new Date(b.start));
  }
  return { byDay, unscheduled: (source === 'all' || source === 'personal' || source === 'tasks') ? active.filter(t => !t.date && t.status !== 'Done').sort(compareTasks) : [] };
}

// Merge occupied intervals so overlaps are not double-counted.
export function plannedMinutes(events, day) {
  const start = +new Date(day + 'T00:00:00'), end = +new Date(addDays(day, 1) + 'T00:00:00');
  const spans = events.filter(e => !e.allDay).map(e => [Math.max(start, +new Date(e.start)), Math.min(end, +new Date(e.end || e.start))]).filter(([a,b]) => b > a).sort((a,b) => a[0]-b[0]);
  let total = 0, until = start;
  for (const [a,b] of spans) { total += Math.max(0, b - Math.max(a, until)); until = Math.max(until, b); }
  return Math.round(total / 60000);
}

export function eventTimeLabel(event, day) {
  if (event.allDay) return 'All day';
  const start = new Date(event.start), end = new Date(event.end || event.start);
  const fmt = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (dateKey(start) < day ? 'Continues' : fmt(start)) +
    (end > start ? ` – ${dateKey(end) > day ? 'next day' : fmt(end)}` : '');
}

export function moveCalendarItem(state, type, id, day, fromDay) {
  if (!['task', 'event'].includes(type) || !validDate(day)) throw Error('Choose a valid destination date.');
  const item = state[type === 'task' ? 'tasks' : 'events'].find(x => x.id === id);
  if (!item) throw Error('This item no longer exists.');
  if(item._sync?.space)throw Error('Open the shared event to change its dates.');
  if (item.externalCalendar || item._sync?.role === 'viewer') throw Error('This shared item is read-only.');
  const fields = type === 'task' ? ['date', 'reminder', 'remindedAt'] : ['start', 'end'];
  const before = Object.fromEntries(fields.map(key => [key, item[key]]));
  const originalDay = type === 'task' ? item.date : item.allDay ? item.start.slice(0, 10) : dateKey(new Date(item.start));
  const referenceDay = type === 'event' && validDate(fromDay) ? fromDay : originalDay;
  const days = referenceDay ? Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(referenceDay + 'T12:00:00Z')) / 86400000) : 0;
  if (type === 'task') {
    item.date = day;
    if (item.reminder && originalDay) {
      const reminder = new Date(item.reminder);
      reminder.setDate(reminder.getDate() + days);
      item.reminder = reminder.toISOString();
      if (days) delete item.remindedAt;
    }
  } else if (item.allDay) {
    item.start = addDays(originalDay, days) + 'T00:00:00';
    item.end = addDays(before.end?.slice(0, 10) || addDays(originalDay, 1), days) + 'T00:00:00';
  } else {
    const start = new Date(item.start), end = new Date(item.end || item.start);
    const duration = end.getTime() - start.getTime();
    const localHour = start.getHours(), localMinute = start.getMinutes();
    start.setDate(start.getDate() + days);
    if (start.getHours() !== localHour || start.getMinutes() !== localMinute) throw Error('That time does not exist on this date because of daylight saving. Choose a time in the event details.');
    item.start = start.toISOString();
    item.end = new Date(start.getTime() + duration).toISOString();
  }
  item.updatedAt = new Date().toISOString();
  return { type, id, before, after: Object.fromEntries(fields.map(key => [key, item[key]])) };
}

export function undoCalendarMove(state, change) {
  const item = state[change.type === 'task' ? 'tasks' : 'events'].find(x => x.id === change.id);
  if (!item || item.externalCalendar || item._sync?.role === 'viewer') throw Error('This item is no longer editable.');
  if (Object.entries(change.after).some(([key, value]) => item[key] !== value)) throw Error('This item changed again. Open its details to choose a date.');
  for (const [key, value] of Object.entries(change.before)) value === undefined ? delete item[key] : item[key] = value;
  item.updatedAt = new Date().toISOString();
}
