export function widgetModel(state) {
  const tasks = state.tasks.filter(t => !state.courses.some(c => c.id === t.course && state.terms.some(term => term.id === c.term && term.archived)));
  const projects = state.projects.filter(p => !p.archived).map(project => {
    const items = tasks.filter(t => t.project === project.id);
    return { ...project, tasks: items, done: items.filter(t => t.status === 'Done').length };
  });
  const projectIds = new Set(state.projects.map(p => p.id));
  return { daily: tasks.filter(t => !projectIds.has(t.project)), projects };
}
