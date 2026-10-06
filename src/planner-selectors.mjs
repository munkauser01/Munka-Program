// Rebuild small indexes per snapshot; never retain stale planner records.
export function activePlannerTasks(state) {
  const archivedTerms = new Set(state.terms.filter(t => t.archived).map(t => t.id));
  const archivedCourses = new Set(state.courses.filter(c => archivedTerms.has(c.term)).map(c => c.id));
  return state.tasks.filter(t => !archivedCourses.has(t.course));
}
