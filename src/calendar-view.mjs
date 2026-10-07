import { calendarDays, calendarItems, calendarDateLabel, eventTimeLabel, plannedMinutes } from './calendar-model.mjs';

import { dateKey, overlaps, validDate } from './domain.mjs';

import { validCalendarColor } from './calendar-colors.mjs';
import { calendarPicker, calendarScope, bindCalendarPicker } from './calendar-picker.mjs';



export function calendarView({ state, date, mode, showDone, source, focus = 'all', sharedCalendars = [], invitations = 0, esc, icon }) {

  const scope = calendarScope(source, sharedCalendars);
  const addLabel = scope.shared ? 'Add event' : 'Add task';
  const shareLabel = scope.shared ? scope.calendar.role === 'owner' ? 'Invite people' : 'Calendar access' : 'Share & invite';
  const capture = scope.canCreate ? `<form id="calendar-quick-add" data-creation-target="${esc(scope.shared ? 'shared:'+scope.calendar.id : 'personal')}" class="cal-capture" aria-label="${scope.shared ? 'Quick shared event' : 'Quick calendar task'}"><label class="cal-capture-title"><span class="sr-only">${scope.shared ? 'Event' : 'Task'} title</span><input name="title" required maxlength="500" placeholder="${scope.shared ? 'Add an event to ' + esc(scope.name) + '…' : 'Add a task…'}" aria-label="Calendar ${scope.shared ? 'event' : 'task'} title"></label><label><span class="sr-only">${scope.shared ? 'Event date' : 'Due date'}</span><input name="date" type="date" value="${date}" aria-label="${scope.shared ? 'Quick event date' : 'Quick task due date'}"></label><button type="submit" class="primary">${scope.shared ? 'Review event' : 'Add task'} ${icon('plus')}</button>${scope.shared ? '' : `<details class="action-menu"><summary>More options</summary><div class="action-menu-items"><button type="button" data-cal-action="details">${icon('plus')}Task details</button><button type="button" data-cal-action="plan-prompt">${icon('chat')}Plan with Munka</button><button type="button" data-cal-action="batch">${icon('inbox')}Paste tasks</button><button type="button" data-cal-action="guided">${icon('chat')}Guided task</button></div></details>`}</form>` : `<div class="cal-readonly">${icon('eye')}<p>${scope.shared ? scope.calendar.permissions?.edit ? 'You can edit existing events. Adding events is turned off for your access.' : 'You can view this calendar. Adding events is turned off for your access.' : 'This is an imported calendar view. Choose My planner to add tasks or plan time.'}</p></div>`;

  const days = calendarDays(date, mode), today = dateKey();

  const { byDay, unscheduled } = calendarItems(state, [...new Set([...days, date])], { showDone, source, focus });

  const courseIndex = new Map(state.courses.map(c => [c.id,c]));

  const conflicts = new Map();

  const summary = day => {

    const group = byDay.get(day), open = group.tasks.filter(t => t.status !== 'Done').length, minutes = plannedMinutes(group.events, day);

    return `${open} open · ${minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`} planned`;

  };

  const sourceLabel = value => ({ google: 'Google', outlook: 'Outlook', ics: 'Imported', munka: 'Munka' })[value] || 'Munka';

  const bubble = (item, type, day, compact = false) => {

    const isTask = type === 'task', done = isTask && item.status === 'Done';

    const readOnly = !!item.externalCalendar || item._sync?.role === 'viewer' || (item._sync?.space && !item._sync?.permissions?.edit);

    const course = isTask && courseIndex.get(item.course);

    if (!isTask && !item.allDay && !conflicts.has(item.id)) conflicts.set(item.id, state.events.some(e => e.id !== item.id && !e.allDay && overlaps(e, item)));

    const conflict = !isTask && conflicts.get(item.id);

    const tone = isTask ? (item.project ? 'project' : 'task') : item.kind === 'Study session' ? 'study' : 'event';

    const color = validCalendarColor(item.color) && item.color !== 'auto' ? item.color : isTask && item.kind === 'Exam' ? 'peach' : isTask && item.kind === 'Personal' ? 'sky' : 'auto';

    const label = isTask ? `${done ? 'Done' : item.date && item.date < today ? 'Overdue' : item.date ? 'Due' : 'No date'}${item.time ? ' · ' + item.time : ''}${item.priority === 'High' ? ' · High priority' : ''}${course ? ' · ' + course.name : ''}` : `${eventTimeLabel(item, day)} · ${item.source ? sourceLabel(item.source) : item.kind || 'Event'}`;

    const category = isTask ? (done ? 'Done' : item.date ? 'Due' : 'Task') : item.kind === 'Study session' ? 'Study' : item.kind === 'Class' ? 'Class' : 'Event';

    const urgent = isTask && (item.priority === 'High' || (item.date && item.date < today && !done));

    return `<article class="cal-bubble cal-${tone} ${done ? 'is-done' : ''} ${urgent ? 'is-urgent' : ''} ${compact ? 'is-compact' : ''}" data-color="${color}" ${readOnly || item._sync?.space ? '' : 'draggable="true"'} data-cal-item="${type}" data-cal-id="${esc(item.id)}" data-cal-from="${day || ''}">

      <button class="cal-bubble-open" data-${isTask ? 'task' : 'event'}="${esc(item.id)}" title="${esc(item.title + ', ' + label)}" aria-label="${esc(item.title + ', ' + label)}"><span class="cal-bubble-title">${done ? icon('check') : ''}${compact ? `<span class="cal-kind">${category} · </span>` : ''}${esc(item.title)}</span><span class="cal-bubble-meta">${esc(label)}${conflict ? ' · Overlap' : ''}${readOnly ? ' · Read only' : ''}</span></button>

      ${compact ? '' : `<div class="cal-bubble-actions">${isTask ? `<button class="cal-check ${done ? 'checked' : ''}" data-complete="${esc(item.id)}" aria-label="${done ? 'Reopen' : 'Complete'} ${esc(item.title)}" ${readOnly ? 'disabled' : ''}>${icon(done ? 'check' : 'circle')}</button>` : ''}${readOnly || item._sync?.space ? '' : `<button class="cal-move" data-cal-move="${type}" data-cal-id="${esc(item.id)}" data-cal-from="${day || ''}" aria-label="Move ${esc(item.title)} to a date" title="Move to date">${icon('calendar')}</button>${isTask && !done ? `<button data-cal-study="${esc(item.id)}" data-cal-from="${day || date}" aria-label="Plan study time for ${esc(item.title)}" title="Plan study time">${icon('clock')}</button>` : ''}`}</div>`}

    </article>`;

  };

  const dayContent = (day, compact = false) => {

    const items = byDay.get(day);

    const entries = [...items.tasks.map(item => ({item,type:'task'})), ...items.events.map(item => ({item,type:'event'}))];

    const visible = compact ? entries.slice(0,1) : entries;

    return visible.map(({item,type}) => bubble(item,type,day,compact)).join('') + (compact && entries.length > 1 ? `<button class="cal-more" data-cal-more="${day}">Show all ${entries.length} items</button>` : '');

  };

  const chosen = byDay.get(date);

  const rangeLabel = mode === 'week' || mode === 'agenda' ? `${calendarDateLabel(days[0], { month: 'short', day: 'numeric' })} – ${calendarDateLabel(days.at(-1), { month: 'short', day: 'numeric', year: 'numeric' })}` : calendarDateLabel(date, mode === 'month' ? { month: 'long', year: 'numeric' } : { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const count = days.reduce((n, day) => n + byDay.get(day).tasks.filter(t => t.status !== 'Done').length, 0);

  const hasFilters = focus !== 'all' || source !== 'all' || !showDone;

  const agendaDays = days.filter(day => state.preferences.calendarAgendaEmpty || day === date || byDay.get(day).tasks.length + byDay.get(day).events.length);

  const agenda = mode === 'agenda' ? `<div class="cal-agenda" aria-label="Fourteen-day agenda">${agendaDays.map(day => `<section class="cal-agenda-day calendar-cell ${day === today ? 'is-today' : ''}" data-cal-drop="${day}" aria-label="${calendarDateLabel(day)}"><header><div><h3>${calendarDateLabel(day,{weekday:'short',month:'short',day:'numeric'})}</h3><p>${summary(day)}</p></div>${scope.canCreate ? `<button class="quiet" data-cal-add="${day}" ${scope.canCreate ? '' : 'disabled'} aria-label="${addLabel} on ${calendarDateLabel(day)}">${icon('plus')}${addLabel}</button>` : ''}</header><div class="cal-agenda-items">${dayContent(day) || '<p class="cal-empty">Nothing on this date. Choose another day or calendar above.</p>'}</div></section>`).join('')}<p class="cal-empty">${state.preferences.calendarAgendaEmpty ? 'All fourteen dates are shown, including days with nothing planned.' : 'Dates without items are tucked away. Turn on Show empty dates to see all fourteen.'}</p></div>` : '';

  return `<section class="calendar-workspace" aria-label="Calendar workspace">

    <div class="cal-heading"><div><h1>Calendar</h1><p>Make space for your whole day.</p></div><div class="cal-heading-actions"><button type="button" class="cal-share-button" data-cal-action="share-current">${icon('person')}${shareLabel}${invitations ? `<span class="cal-invite-count" aria-label="${invitations} pending invitation${invitations === 1 ? '' : 's'}">${invitations}</span>` : ''}</button><details class="action-menu"><summary>Calendar options</summary><div class="action-menu-items"><button type="button" data-cal-action="import">${icon('inbox')}Import calendar</button><button type="button" data-cal-action="connections">${icon('calendar')}Connect calendars</button></div></details></div></div>
    <div class="cal-context">${calendarPicker({source,calendars:sharedCalendars,esc,icon})}<p class="cal-scope-note">${scope.shared ? `<span class="cal-access-label">${esc(scope.access)}</span><span>${scope.canCreate ? 'New events go to this calendar' : 'Permissions set by the owner'}</span>` : scope.external ? 'Imported events · choose My planner for new items' : 'New items go to My planner'}</p></div>

    ${capture}

    <div class="cal-toolbar"><div class="cal-period"><button data-action="calendar-prev" aria-label="Previous period">${icon('back')}</button><button data-action="calendar-next" aria-label="Next period">${icon('arrow')}</button><h2>${rangeLabel}</h2><button data-action="calendar-now">Today</button></div><div class="cal-segment" role="group" aria-label="Calendar view">${['day', 'week', 'month','agenda'].map(m => `<button data-calendar-mode="${m}" aria-pressed="${mode === m}" class="${mode === m ? 'active' : ''}">${m === 'month' ? 'Full calendar' : m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>

    <details class="cal-help"><summary>Calendar tips</summary><p>Full calendar shows every date. Agenda shows a two-week list. Your view choice is saved.</p><p id="calendar-drag-help">Drag an item to another date, or use its calendar button to move it with the keyboard.</p></details><div class="cal-filters"><label class="cal-filter cal-jump"><span>Jump to</span><input id="calendar-jump" type="date" value="${date}" aria-label="Jump to date"></label><label class="cal-filter"><span class="sr-only">Course or project</span><select id="calendar-focus" aria-label="Course or project" ${scope.shared ? 'disabled' : ''}>${[['all','All courses & projects'],['personal','Unassigned'],...state.courses.map(c => ['course:'+c.id,c.name]),...state.projects.filter(p => !p.archived).map(p => ['project:'+p.id,p.name])].map(([v,n]) => `<option value="${esc(v)}" ${focus === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>${mode === 'agenda' ? `<label class="checkline"><input id="calendar-empty" type="checkbox" ${state.preferences.calendarAgendaEmpty ? 'checked' : ''}>Show empty dates</label>` : ''}<label class="checkline"><input id="calendar-done" type="checkbox" ${showDone ? 'checked' : ''}>Completed</label>${hasFilters ? '<button class="quiet cal-clear" data-cal-action="clear">Clear filters</button>' : ''}</div>

    <div class="cal-layout"><div class="cal-board-area">

      ${mode === 'agenda' ? agenda : mode === 'day' ? `<div class="cal-day-view calendar-cell" data-cal-drop="${date}" aria-label="${calendarDateLabel(date)}"><div class="cal-day-section"><h3>Deadlines <span>${chosen.tasks.length}</span></h3>${chosen.tasks.map(t => bubble(t, 'task', date)).join('') || `<p class="cal-empty">${hasFilters ? 'No deadlines match these filters.' : 'No deadlines here. Add a task above.'}</p>`}</div><div class="cal-day-section"><h3>Planned time <span>${summary(date)}</span></h3>${chosen.events.map(e => bubble(e, 'event', date)).join('') || '<p class="cal-empty">Leave some room, or plan a session.</p>'}<button data-cal-plan="${date}" ${scope.canCreate ? '' : 'disabled'} class="quiet">${icon('plus')}${scope.shared ? 'Add event' : 'Plan time'}</button></div></div>` : `<div class="cal-grid-scroll" tabindex="0" role="region" aria-label="${mode} calendar" aria-describedby="calendar-drag-help"><div class="cal-grid cal-${mode}" data-weeks="${days.length / 7}">${days.map(day => {

        const group = byDay.get(day), total = group.tasks.length + group.events.length;

        return `<section class="calendar-cell ${day === today ? 'is-today' : ''} ${day === date ? 'is-selected' : ''} ${day.slice(0,7) !== date.slice(0,7) ? 'outside-month' : ''}" data-cal-drop="${day}" aria-label="${calendarDateLabel(day)}"><div class="cal-cell-head"><button class="cal-day-button" data-cal-select="${day}" aria-pressed="${day === date}" aria-label="Select ${calendarDateLabel(day)}"><span>${calendarDateLabel(day, {weekday:'short'})}</span><strong>${+day.slice(-2)}</strong></button><button class="cal-day-add" data-cal-add="${day}" ${scope.canCreate ? '' : 'disabled'} aria-label="${addLabel} on ${calendarDateLabel(day)}" title="${addLabel}">${icon('plus')}</button></div><div class="cal-cell-items">${dayContent(day, mode === 'month')}</div>${!total && mode === 'week' ? '<p class="cal-free">Room to plan</p>' : ''}${mode === 'week' ? `<button class="cal-plan-link" data-cal-plan="${day}" ${scope.canCreate ? '' : 'disabled'}>${icon('plus')}${scope.shared ? 'Add event' : 'Plan time'}</button>` : ''}</section>`;

      }).join('')}</div></div>`}

      <div class="cal-foot"><span>${count} open deadline${count === 1 ? '' : 's'} in this view</span><span>Times shown in ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span></div>

    </div><aside class="cal-sidebar" aria-label="Calendar planning panel">

      ${['day','agenda'].includes(mode) ? '' : `<section class="cal-selected" tabindex="-1" aria-label="Selected date details"><h2>${calendarDateLabel(date, {weekday:'long'})}<span>${calendarDateLabel(date,{month:'short',day:'numeric'})}</span></h2><p class="muted small">${summary(date)}</p>${(chosen.tasks.length || chosen.events.length ? `<h3 class="cal-group-label">Deadlines</h3>${chosen.tasks.map(t => bubble(t, 'task', date)).join('') || '<p class="cal-empty">No deadlines.</p>'}<h3 class="cal-group-label">Planned time</h3>${chosen.events.map(e => bubble(e, 'event', date)).join('') || '<p class="cal-empty">No time planned.</p>'}` : '') || `<p class="cal-empty">${hasFilters ? 'Nothing matches these filters on this date.' : 'A little breathing room. Add something you want to make time for.'}</p>`}<button class="quiet" data-cal-plan="${date}" ${scope.canCreate ? '' : 'disabled'}>${icon('clock')}${scope.shared ? 'Add event' : 'Plan time'}</button></section>`}

      <section class="cal-unscheduled"><h2>Unscheduled <span>${unscheduled.length}</span></h2><p class="muted small">Drag a task onto a day to set its deadline.</p>${unscheduled.map(t => bubble(t, 'task', '')).join('') || '<p class="cal-empty">Everything has a place. New undated tasks will appear here.</p>'}</section>

    </aside></div></section>`;

}



export function bindCalendar({ root, onMove, onSelect, onAdd, onPlan, onStudy, onAction, onQuick, onFilter, onMoveDialog, onOpen, onError }) {

  if (!root) return;

  root.querySelectorAll('[data-cal-select]').forEach(b => b.onclick = () => onSelect(b.dataset.calSelect));

  root.querySelectorAll('[data-cal-more]').forEach(b => b.onclick = () => onSelect(b.dataset.calMore, true));

  root.querySelectorAll('[data-cal-study]').forEach(b => b.onclick = () => onStudy(b.dataset.calStudy, b.dataset.calFrom));

  root.querySelector('#calendar-jump').onchange = e => { if (validDate(e.target.value)) onSelect(e.target.value); };

  root.querySelector('#calendar-focus').onchange = e => onFilter('focus', e.target.value);
  bindCalendarPicker(root, value => onFilter('source', value));

  root.querySelectorAll('[data-cal-add]').forEach(b => b.onclick = () => onAdd(b.dataset.calAdd));

  root.querySelectorAll('[data-cal-plan]').forEach(b => b.onclick = () => onPlan(b.dataset.calPlan));

  root.querySelectorAll('[data-cal-action]').forEach(b => b.onclick = () => { b.closest('details')?.removeAttribute('open'); onAction(b.dataset.calAction); });

  root.querySelectorAll('[data-cal-move]').forEach(b => b.onclick = () => onMoveDialog(b.dataset.calMove, b.dataset.calId, b.dataset.calFrom));


  const emptyDates = root.querySelector('#calendar-empty');

  if (emptyDates) emptyDates.onchange = e => onFilter('empty', e.target.checked);

  root.querySelector('#calendar-done').onchange = e => onFilter('done', e.target.checked);

  const quickAdd = root.querySelector('#calendar-quick-add');
  if (quickAdd) quickAdd.onsubmit = async e => {

    e.preventDefault();

    const submit = e.target.querySelector('[type=submit]');

    submit.disabled = true;

    try { await onQuick(Object.fromEntries(new FormData(e.target))); }

    catch (error) { onError(error); }

    finally { submit.disabled = false; }

  };

  let dragging = null;

  root.querySelectorAll('[data-cal-item]').forEach(item => item.onclick = e => {

    if (!e.target.closest('button') && !dragging) onOpen(item.dataset.calItem, item.dataset.calId);

  });

  root.querySelectorAll('[data-cal-item][draggable]').forEach(item => {

    item.ondragstart = e => {

      dragging = { type: item.dataset.calItem, id: item.dataset.calId, fromDay: item.dataset.calFrom };

      e.dataTransfer.setData('application/x-munka-calendar', JSON.stringify(dragging));

      e.dataTransfer.effectAllowed = 'move';

      item.classList.add('is-dragging');

      root.classList.add('is-moving');

    };

    item.ondragend = () => {

      dragging = null;

      root.querySelectorAll('.is-drop-target,.is-dragging').forEach(x => x.classList.remove('is-drop-target','is-dragging'));

      root.classList.remove('is-moving');

    };

  });

  root.querySelectorAll('[data-cal-drop]').forEach(cell => {

    cell.ondragover = e => {

      if (!dragging) return;

      e.preventDefault(); e.dataTransfer.dropEffect = 'move';

      root.querySelectorAll('.is-drop-target').forEach(x => x.classList.remove('is-drop-target'));

      cell.classList.add('is-drop-target');

    };

    cell.ondragleave = e => { if (!cell.contains(e.relatedTarget)) cell.classList.remove('is-drop-target'); };

    cell.ondrop = async e => {

      if (!dragging) return;

      e.preventDefault();

      const current = dragging; dragging = null;

      root.classList.remove('is-moving'); cell.classList.remove('is-drop-target');

      try { await onMove(current.type, current.id, cell.dataset.calDrop, current.fromDay); }

      catch (error) { onError(error); }

    };

  });

}

