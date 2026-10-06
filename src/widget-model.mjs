import { activePlannerTasks } from './planner-selectors.mjs';
import { dateKey } from './domain.mjs';
import { compareTasks } from './task-order.mjs';

export function widgetTaskState(task, today = dateKey()) {
  const pastDate = !!task.date && task.date < today;
  const overdue = pastDate && task.status !== 'Done';
  return { visible: !(pastDate && task.status === 'Done'), overdue, urgent: task.priority === 'High' || overdue };
}

export function widgetModel(state, today = dateKey()) {
  const tasks = activePlannerTasks(state).sort(compareTasks);
  const hidden = new Set(state.preferences?.widgetHiddenTasks || []);
  const visible = t => !hidden.has(t.id) && widgetTaskState(t, today).visible;
  const byProject = new Map();
  for (const t of tasks) {
    if (!byProject.has(t.project)) byProject.set(t.project, []);
    byProject.get(t.project).push(t);
  }
  const projects = state.projects.filter(p => !p.archived).map(project => {
    const items = byProject.get(project.id) || [];
    return { ...project, tasks: items, visibleTasks: items.filter(visible), done: items.filter(t => t.status === 'Done').length };
  });
  const projectIds = new Set(state.projects.map(p => p.id));
  const dailyTasks = tasks.filter(t => !projectIds.has(t.project));
  return { daily: dailyTasks.filter(visible), projects,
    hiddenCount: tasks.filter(t => hidden.has(t.id) && widgetTaskState(t, today).visible).length,
    dailyHiddenCount: dailyTasks.filter(t => hidden.has(t.id) && widgetTaskState(t, today).visible).length };
}
