import { activePlannerTasks } from './planner-selectors.mjs';
import { compareTasks } from './task-order.mjs';
import { dateKey } from './domain.mjs';

// One fresh set of indexes per render; never cache a mutable planner across saves.
export function plannerRenderModel(state) {
  const courses = new Map(state.courses.map(c => [c.id,c]));
  const projects = new Map(state.projects.map(p => [p.id,p]));
  const tasks = new Map(state.tasks.map(t => [t.id,t]));
  const byCourse = new Map(), byProject = new Map();
  for (const t of state.tasks) {
    for (const [index,id] of [[byCourse,t.course],[byProject,t.project]]) {
      if (!id) continue;
      if (!index.has(id)) index.set(id,[]);
      index.get(id).push(t);
    }
  }
  const blocked = t => t.dependencies.some(id => tasks.has(id) && tasks.get(id).status !== 'Done');
  return {courses,projects,byCourse,byProject,blocked,active:activePlannerTasks(state)};
}

export function filteredPlannerTasks(model, {filter='open',courseFilter='',query='',today=dateKey()} = {}) {
  const search=query.toLowerCase();
  return model.active.filter(t =>
    (filter==='all' || (filter==='done' ? t.status==='Done' : filter==='high' ? t.priority==='High' && t.status!=='Done' :
      filter==='undated' ? !t.date && t.status!=='Done' :
      filter==='overdue' ? !!t.date && t.date < today && t.status!=='Done' :
      filter==='blocked' ? t.status!=='Done' && model.blocked(t) : t.status!=='Done')) &&
    (!courseFilter || t.course===courseFilter || t.project===courseFilter) &&
    (!search || [t.title,t.notes,model.courses.get(t.course)?.name,model.projects.get(t.project)?.name].join(' ').toLowerCase().includes(search)))
    .sort(compareTasks);
}
