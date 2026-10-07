import { activePlannerTasks } from './planner-selectors.mjs';
import { addDays, dateKey } from './domain.mjs';
import { compareTasks } from './task-order.mjs';

// Deadline facts come from current local records, never from generated prose.
export function deadlineSummary(state, {window = 'week', course = '', now = new Date()} = {}) {
  if (!['today','week','overdue','upcoming'].includes(window)) throw Error('Choose a supported deadline view.');
  if (course && !state.courses.some(c => c.id === course)) throw Error('Choose an existing course.');
  const today = dateKey(now), end = addDays(today, 6);
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const active = activePlannerTasks(state).filter(t => t.status !== 'Done' && (!course || t.course === course));
  const overdue = t => t.date < today || (t.date === today && !!t.time && t.time < time);
  const matches = active.filter(t => t.date && (window === 'today' ? t.date === today :
    window === 'overdue' ? overdue(t) : window === 'week' ? t.date <= end : true))
    .sort(compareTasks);
  return {window, today, total: matches.length, undated: active.filter(t => !t.date).length,
    items: matches.slice(0, 40).map(t => ({title: t.title, date: t.date, time: t.time || '',
      course: state.courses.find(c => c.id === t.course)?.name || '', overdue: overdue(t)}))};
}
