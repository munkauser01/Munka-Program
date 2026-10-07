import { calendarColors } from './calendar-colors.mjs';

// Collapsed sections remain in the form so edits preserve every saved field.
export function taskForm({ value: v, existing, state, field, select, esc }) {
  const planning = v.planDate || v.estimateMinutes;
  const advanced = (v.status && v.status !== 'To do') || (v.recurrence && v.recurrence !== 'None') || v.reminder || v.assignee || v.subtasks.length || (v.color && v.color !== 'auto');
  return `<div class="task-form-body">
    ${field('Task', 'title', v.title, 'text', 'required maxlength="500"')}
    <div class="form-grid">${field('Due date', 'date', v.date, 'date')}${field('Due time (optional)', 'time', v.time, 'time')}
    ${select('Priority', 'priority', v.priority, ['Low', 'Normal', 'High'])}${select('Type', 'kind', v.kind, ['Task', 'Assignment', 'Exam', 'Personal'])}
    ${select('Course', 'course', v.course, [['', 'None'], ...state.courses.map(c => [c.id, c.name])])}${select('Project', 'project', v.project, [['', 'None'], ...state.projects.map(c => [c.id, c.name])])}</div>
    <label class="field"><span>Notes</span><textarea name="notes" rows="3">${esc(v.notes)}</textarea></label>
    <details class="task-options" ${planning ? 'open' : ''}><summary>Plan work <span>Work date and estimate</span></summary><div class="form-grid">
    ${field('Planned work date', 'planDate', v.planDate || '', 'date')}${field('Estimate (minutes)', 'estimateMinutes', v.estimateMinutes ?? '', 'number', 'min="1" max="1440" step="1"')}</div></details>
    <details class="task-options" ${advanced ? 'open' : ''}><summary>More options <span>Status, reminders and subtasks</span></summary>
    <div class="form-grid">${select('Status', 'status', v.status, ['To do', 'In progress', 'Done'])}${select('Repeat', 'recurrence', v.recurrence, ['None', 'Daily', 'Weekly'])}</div>
    ${field('Reminder', 'reminder', v.reminder || '', 'datetime-local')}${field('Assignee (one email)', 'assignee', v.assignee || '', 'email')}
    <label class="field"><span>Subtasks (one per line; prefix completed items with [x])</span><textarea name="subtasks">${esc(v.subtasks.map(s => (s.done ? '[x] ' : '') + s.title).join('\n'))}</textarea></label>
    ${select('Calendar color', 'color', v.color || 'auto', calendarColors)}
    ${state.preferences.dev ? `<label class="field"><span>Depends on</span><select name="dependencies" multiple>${state.tasks.filter(x => x.id !== existing?.id).map(x => `<option value="${esc(x.id)}" ${v.dependencies.includes(x.id) ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>` : ''}
    </details>
    ${existing?.sourceRef ? '<button type="button" id="task-source">View syllabus source</button>' : ''}
    ${existing ? '<div class="actions"><button type="button" id="snooze-task">Snooze 15 min</button><button type="button" id="plan-task">Plan study time</button></div>' : ''}
    </div><div class="drawer-footer">${existing ? '<button type="button" class="danger quiet" id="delete-task">Delete</button>' : '<span></span>'}<button class="primary" type="submit">${existing ? 'Save changes' : 'Create task'}</button></div>`;
}
