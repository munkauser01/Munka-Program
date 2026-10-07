import { task, runRules, dateKey, addDays, validDate } from './domain.mjs';
import { calendarDateLabel, eventTimeLabel, moveCalendarItem, undoCalendarMove } from './calendar-model.mjs';
import { validateTaskDraft } from './task-drafts.mjs';
import { importRows } from './calendar-import.mjs';

export function calendarActions({ getState, save, drawer, field, select, esc, toast, closeDrawer, pickFile }) {
  async function addDraft(input) {
    const state = getState(), draft = validateTaskDraft(input, state), created = task(draft);
    state.tasks.push(created);
    runRules(state, 'created', created);
    if (!(await save())) return false;
    toast('Task added');
    return true;
  }
  async function move(type, id, date, from) {
    const change = moveCalendarItem(getState(), type, id, date, from);
    if (!(await save())) return false;
    toast(`Moved to ${calendarDateLabel(date)}${type === 'event' ? '. Task deadlines unchanged.' : '. Any dated reminder moved with it.'}`, async () => {
      try { undoCalendarMove(getState(), change); await save(); }
      catch (error) { toast(error.message); }
    });
    return true;
  }
  function moveDialog(type, id, from) {
    const item = getState()[type === 'task' ? 'tasks' : 'events'].find(x => x.id === id);
    if (!item) return;
    drawer('Move to a date', `<p>${esc(item.title)}</p>${field('New date', 'date', from || dateKey(), 'date', 'required')}<p class="muted small">${type === 'task' ? 'Moves the deadline and its existing reminder. Planned study time stays where it is.' : 'Moves this occurrence and preserves its duration. Assignment deadlines stay where they are.'}</p><div class="drawer-footer"><button class="primary">Move</button></div>`, async form => {
      if (await move(type, id, form.get('date'), from)) closeDrawer();
    });
  }
  function guided(date) {
    let draft = { title: '', date, time: '', kind: 'Task', course: '', notes: '' };
    function step(stage) {
      const intro = '<p class="muted small">Guided task · works offline without AI.</p>';
      if (stage === 0) {
        drawer('Let’s make a task', `${intro}<p class="cal-chat-message">What do you need to get done?</p>${field('Your task', 'title', draft.title, 'text', 'required maxlength="500" placeholder="Finish the first draft of my essay"')}<div class="drawer-footer"><button class="primary">Continue</button></div>`, async form => {
          draft.title = form.get('title').trim(); if (!draft.title) throw Error('Give your task a title.'); step(1);
        });
      } else if (stage === 1) {
        drawer('Give it a place', `${intro}<p class="cal-chat-answer">${esc(draft.title)}</p><p class="cal-chat-message">When is it due? Leave the date blank if you’re still deciding.</p>${field('Due date', 'date', draft.date, 'date')}${field('Due time (optional)', 'time', draft.time, 'time')}${select('Task type', 'kind', draft.kind, ['Task','Assignment','Exam','Personal'])}${select('Course (optional)', 'course', draft.course, [['','None'], ...getState().courses.map(c => [c.id,c.name])])}<div class="drawer-footer"><button type="button" id="guided-back">Back</button><button class="primary">Review task</button></div>`, async form => {
          draft = validateTaskDraft({ ...draft, ...Object.fromEntries(form) }, getState()); step(2);
        });
        document.querySelector('#guided-back').onclick = () => step(0);
      } else {
        drawer('Ready to add?', `${intro}<div class="cal-import-summary"><h3>${esc(draft.title)}</h3><p>${draft.date ? calendarDateLabel(draft.date) : 'No date yet'}${draft.time ? ' · ' + esc(draft.time) : ''}</p><p class="small">${esc(draft.kind)}${draft.course ? ' · ' + esc(getState().courses.find(c => c.id === draft.course)?.name) : ''}</p></div><p class="muted small">Nothing is added until you confirm. You can add notes, subtasks and a reminder in task details later.</p><div class="drawer-footer"><button type="button" id="guided-back">Back</button><button class="primary">Add task to planner</button></div>`, async () => {
          if (await addDraft(draft)) closeDrawer();
        });
        document.querySelector('#guided-back').onclick = () => step(1);
      }
    }
    step(0);
  }
  function importSetup(file = null) {
    drawer('Bring your calendars together', `<p>Upload a Google Calendar, Outlook or other <strong>.ics</strong> file. Review the events, then add them to Munka.</p><details><summary>How to get your calendar file</summary><p class="small">Google: open Calendar settings on a computer, choose Import & export → Export, then extract an .ics file from the ZIP.</p><p class="small">Classic Outlook: open Calendar → File → Save Calendar and save as .ics. In Outlook on the web, your organization may offer calendar publishing in Settings → Calendar → Shared calendars.</p></details>${select('Calendar source', 'source', 'google', [['google','Google Calendar'],['outlook','Outlook'],['ics','Other calendar']])}<div class="form-grid">${field('Import from', 'from', addDays(dateKey(), -30), 'date', 'required')}${field('Through', 'to', addDays(dateKey(), 365), 'date', 'required')}</div><p class="muted small">This adds local copies, not a live connection. Recurring events are expanded within your date range. Existing imports are skipped; reimporting does not overwrite your edits.</p>${file ? `<p>Selected: ${esc(file.name)}</p>` : ''}<div class="drawer-footer"><button class="primary">${file ? 'Preview events' : 'Choose .ics file'}</button></div>`, async form => {
      const options = Object.fromEntries(form);
      if (!validDate(options.from) || !validDate(options.to) || options.to < options.from || Date.parse(options.to) - Date.parse(options.from) > 732 * 86400000) throw Error('Choose a date range of up to two years.');
      const selected = file || await pickFile();
      if (!selected) return;
      if (!/\.ics$/i.test(selected.name)) throw Error('Choose an .ics file. Extract ZIP downloads first.');
      if (selected.text.length > 4 * 1024 * 1024) throw Error('Choose a file smaller than 4 MB.');
      const button = document.querySelector('#detail-form button.primary');
      button.disabled = true; button.textContent = 'Reading calendar…';
      try {
        const result = await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('./calendar-import-worker.mjs', import.meta.url), { type: 'module' });
          const timer = setTimeout(() => { worker.terminate(); reject(Error('The calendar took too long to read. Export a smaller date range.')); }, 10000);
          worker.onmessage = ({data}) => { clearTimeout(timer); worker.terminate(); data.error ? reject(Error(data.error)) : resolve(data.result); };
          worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(Error('Could not read this calendar. Check the file and try again.')); };
          worker.postMessage({ text: selected.text, options });
        });
        // Closing the drawer during parsing cancels presenting the result.
        if (!button.isConnected) return;
        showPreview(result, selected.name);
      } finally { button.disabled = false; button.textContent = file ? 'Preview events' : 'Choose .ics file'; }
    });
  }
  function showPreview(result, filename) {
    const rows = importRows(result.events, getState().events), ready = rows.filter(r => !r.duplicate);
    drawer('Review your calendar', `<p>${esc(result.calendarName || filename)}</p><div class="cal-import-summary"><strong>${ready.length} to add · ${rows.length - ready.length} duplicates skipped</strong><p class="small">${calendarDateLabel(result.from)} – ${calendarDateLabel(result.to)}</p></div>${result.warnings.map(w => `<p class="small">${esc(w)}</p>`).join('')}<p class="muted small">${result.outsideRange} occurrences outside the range. ${result.cancelled} cancelled occurrences skipped. Nothing has been added yet.</p><div class="cal-import-list">${rows.map(({event:e,duplicate}) => `<div class="cal-import-row"><strong>${esc(e.title)}</strong><p>${calendarDateLabel(e.allDay ? e.start.slice(0,10) : dateKey(new Date(e.start)))} · ${esc(eventTimeLabel(e,dateKey(new Date(e.start))))}${duplicate ? ' · Already imported' : ''}</p>${e.location ? `<p>${esc(e.location)}</p>` : ''}</div>`).join('') || '<p>No events in this range. Close this preview and choose a wider range.</p>'}</div><div class="drawer-footer"><button class="primary" ${!ready.length ? 'disabled' : ''}>Import ${ready.length} events</button></div>`, async () => {
      // Recheck at commit time in case another window imported the same file.
      const state = getState(), pending = importRows(result.events, state.events).filter(r => !r.duplicate).map(r => r.event);
      state.events.push(...pending);
      if (await save()) { closeDrawer(); toast(`Imported ${pending.length} events. Saved on this computer.`); }
    });
  }
  return { addDraft, move, moveDialog, guided, importSetup };
}
