import ICAL from './vendor/ical.mjs';
import { addDays, dateKey, validDate } from './domain.mjs';

function stamp(value, property) {
  const raw = value.toString();
  if (!validDate(raw.slice(0, 10))) throw Error('The calendar contains an invalid date.');
  if (value.isDate) return raw.slice(0, 10) + 'T00:00:00';
  const tzid = property?.getParameter('tzid');
  if (!tzid || value.zone.tzid !== 'floating') return value.toJSDate().toISOString();
  // Google files may omit VTIMEZONE for standard IANA names. Resolve those with
  // the OS time-zone database; Outlook's embedded VTIMEZONE is handled by ICAL.
  let format;
  try { format = new Intl.DateTimeFormat('en-CA', { timeZone: tzid, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { throw Error(`Unknown time zone: ${tzid}. Export with time-zone definitions or UTC times.`); }
  const desired = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
  let instant = desired;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const actual = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    if (desired === actual) return new Date(instant).toISOString();
    instant += desired - actual;
  }
  throw Error(`A time in ${tzid} does not exist because of daylight saving. Correct it before importing.`);
}

export function calendarImportPreview(text, { from = addDays(dateKey(), -30), to = addDays(dateKey(), 365), source = 'ics' } = {}) {
  if (!validDate(from) || !validDate(to) || to < from || Date.parse(to) - Date.parse(from) > 732 * 86400000) throw Error('Choose a calendar range of up to two years.');
  if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) throw Error('Choose an ICS file smaller than 4 MB.');
  if (!['google', 'outlook', 'ics'].includes(source)) throw Error('Choose a calendar source.');
  const unfolded = text.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').trim();
  if (!/^BEGIN:VCALENDAR\r?\n/i.test(unfolded) || !/END:VCALENDAR$/i.test(unfolded)) throw Error('Choose a complete .ics calendar file. Extract Google downloads from their ZIP first.');
  const stack = [];
  for (const line of unfolded.split(/\r?\n/)) {
    if (line.startsWith('BEGIN:')) stack.push(line.slice(6));
    if (line.startsWith('END:') && stack.pop() !== line.slice(4)) throw Error('This calendar has an incomplete event. Nothing was imported.');
    if (/^(DTSTART|DTEND|RECURRENCE-ID)[;:]/.test(line)) {
      const raw = line.slice(line.indexOf(':') + 1), m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
      if (!m || !validDate(`${m[1]}-${m[2]}-${m[3]}`) || (m[4] && (+m[4] > 23 || +m[5] > 59 || +m[6] > 59))) throw Error('The calendar contains an invalid date or time.');
    }
  }
  if (stack.length) throw Error('This calendar file is incomplete.');
  const root = new ICAL.Component(ICAL.parse(unfolded));
  const components = root.getAllSubcomponents('vevent');
  if (components.length > 10000) throw Error('This file has too many events. Export a smaller calendar.');
  const events = [], keys = new Set();
  let outsideRange = 0, cancelled = 0, recurring = false, steps = 0;
  const lower = new Date(from + 'T00:00:00'), upper = new Date(addDays(to, 1) + 'T00:00:00');
  const append = (event, start, end, recurrenceId) => {
    if (event.component.getFirstPropertyValue('status') === 'CANCELLED') { cancelled++; return; }
    if (!event.summary?.trim() || event.summary.length > 500) throw Error('Each event needs a title of 1–500 characters.');
    const startProp = event.component.getFirstProperty('dtstart');
    const row = {
      id: crypto.randomUUID(), title: event.summary, kind: 'Event',
      start: stamp(start, startProp), end: stamp(end, event.component.getFirstProperty('dtend') || startProp),
      allDay: start.isDate, source, importId: event.uid || '',
      recurrenceId: recurrenceId?.toString() || '',
      location: event.location || '', notes: event.description || '',
      sourceTimeZone: startProp?.getParameter('tzid') || '',
    };
    if (new Date(row.end) < new Date(row.start)) throw Error('An event ends before it starts.');
    if (new Date(row.start) >= upper || (new Date(row.end) <= lower && new Date(row.start) < lower)) { outsideRange++; return; }
    const key = row.importId ? `${row.importId}|${row.recurrenceId}` : `${row.title}|${row.start}`;
    if (keys.has(key)) return;
    keys.add(key);
    events.push(row);
    if (events.length > 10000) throw Error('More than 10,000 occurrences. Choose a shorter range.');
  };
  for (const component of components) {
    if (!component.hasProperty('dtstart')) {
      if (component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      throw Error('An event is missing its start date.');
    }
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) continue;
    if (!event.isRecurring()) { append(event, event.startDate, event.endDate); continue; }
    recurring = true;
    for (const rule of component.getAllProperties('rrule')) {
      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.getFirstValue().freq)) throw Error('Recurrence more frequent than daily is not supported.');
    }
    const iterator = event.iterator();
    let occurrence;
    while ((occurrence = iterator.next())) {
      if (++steps > 100000) throw Error('This recurrence is too large. Export a shorter series.');
      if (occurrence.toString().slice(0, 10) > addDays(to, 2)) break;
      const details = event.getOccurrenceDetails(occurrence);
      append(details.item, details.startDate, details.endDate, occurrence);
    }
  }
  // Include moved exceptions that land inside the requested range even if their
  // original recurrence date was outside it. Duplicate keys are suppressed.
  for (const component of components.filter(c => c.hasProperty('recurrence-id') && c.hasProperty('dtstart'))) {
    const event = new ICAL.Event(component);
    append(event, event.startDate, event.endDate, event.recurrenceId);
  }
  return { events, from, to, source, recurring, outsideRange, cancelled,
    calendarName: root.getFirstPropertyValue('x-wr-calname') || '',
    warnings: recurring ? ['Recurring events are imported as individual occurrences within this range. Reimport to add later dates.'] : [] };
}

export function parseICS(text, options) { return calendarImportPreview(text, options).events; }

export function importRows(incoming, existing) {
  const occurrences = new Set(), starts = new Set();
  for (const event of existing) {
    if (event.importId) occurrences.add(JSON.stringify([event.importId, event.recurrenceId || '']));
    const time = +new Date(event.start);
    if (Number.isFinite(time)) starts.add(JSON.stringify([event.title, time]));
  }
  return incoming.map(event => ({ event, duplicate:
    Boolean(event.importId && occurrences.has(JSON.stringify([event.importId, event.recurrenceId || '']))) ||
    (!event.recurrenceId && starts.has(JSON.stringify([event.title, +new Date(event.start)]))) }));
}
