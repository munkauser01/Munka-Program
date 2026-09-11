function wallpaperContent(state, day) {
  const limit = Math.max(1, Math.min(8, Number(state.preferences.wallpaperCount) || 5));
  const visible = state.tasks.filter(t => !state.courses.some(c => c.id === t.course && state.terms.some(term => term.id === c.term && term.archived)));
  const projectIds = new Set(state.projects.map(p => p.id));
  const mapTask = t => ({ title: state.preferences.privacy ? 'Upcoming task' : t.title, date: t.date, done: t.status === 'Done' });
  return {
    day,
    tasks: visible.filter(t => !projectIds.has(t.project)).slice(0, limit).map(mapTask),
    projects: state.preferences.widgetProjects === false ? [] : state.projects.filter(p => !p.archived).slice(0, 3).map(p => ({ name: state.preferences.privacy ? 'Current project' : p.name, tasks: visible.filter(t => t.project === p.id).slice(0, limit).map(mapTask) })),
    position: state.preferences.wallpaperPosition === 'left' ? 'left' : 'right',
    design: ['glass', 'sage', 'plain'].includes(state.preferences.widgetDesign) ? state.preferences.widgetDesign : 'glass',
  };
}
function matchMonitor(monitors, rect) {
  const found = monitors.filter(m => Math.abs(m.X - rect.x) < 2 && Math.abs(m.Y - rect.y) < 2 && Math.abs(m.Width - rect.width) < 2 && Math.abs(m.Height - rect.height) < 2);
  if (found.length !== 1) throw Error('Could not identify this display safely. Re-select the wallpaper display.');
  return found[0];
}
module.exports = { wallpaperContent, matchMonitor };

