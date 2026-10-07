const ranks = {High:0, Normal:1, Low:2};
// Stable equal keys retain the user's existing order. Undated tasks follow dated work.
export function compareTasks(a, b) {
  return (a.date || '9999').localeCompare(b.date || '9999') ||
    (ranks[a.priority] ?? 1) - (ranks[b.priority] ?? 1) ||
    (a.time || '99:99').localeCompare(b.time || '99:99');
}
