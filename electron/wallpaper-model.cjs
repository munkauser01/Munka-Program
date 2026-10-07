const { compareTasks } = require('../src/task-order.mjs');
const { dateKey, validDate } = require('../src/domain.mjs');
const { activePlannerTasks } = require('../src/planner-selectors.mjs');
const { widgetTaskState } = require('../src/widget-model.mjs');
function wallpaperContent(state, today = dateKey()) {
  if (!validDate(today)) throw Error('Wallpaper reminders require a calendar date.');
  const day = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const limit = Math.max(1, Math.min(8, Number(state.preferences.wallpaperCount) || 5));
  // Wallpaper visibility is independent of manual widget dismissals.
  const visible = activePlannerTasks(state).filter(t => widgetTaskState(t, today).visible).sort(compareTasks);
  const projectIds = new Set(state.projects.map(p => p.id));
  const mapTask = t => ({ title: state.preferences.privacy ? 'Hidden task' : t.title, date: t.date, done: t.status === 'Done', urgent: widgetTaskState(t, today).urgent });
  return {
    day,
    tasks: visible.filter(t => !projectIds.has(t.project)).slice(0, limit).map(mapTask),
    projects: state.preferences.widgetProjects === false ? [] : state.projects.filter(p => !p.archived).slice(0, 3).map(p => ({ name: state.preferences.privacy ? 'Current project' : p.name, tasks: visible.filter(t => t.project === p.id).slice(0, limit).map(mapTask) })),
    position: state.preferences.wallpaperPosition === 'left' ? 'left' : 'right',
    design: state.preferences.widgetSurface === 'panel' ? (['glass', 'sage', 'plain'].includes(state.preferences.widgetDesign) ? state.preferences.widgetDesign : 'glass') : 'seamless',
    ink: state.preferences.widgetInk === 'light' ? 'light' : 'dark',
  };
}
function matchMonitor(monitors, rect) {
  const found = monitors.filter(m => Math.abs(m.X - rect.x) < 2 && Math.abs(m.Y - rect.y) < 2 && Math.abs(m.Width - rect.width) < 2 && Math.abs(m.Height - rect.height) < 2);
  if (found.length !== 1) throw Error('Could not identify this display safely. Re-select the wallpaper display.');
  return found[0];
}
module.exports = { wallpaperContent, matchMonitor };
