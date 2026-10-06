import { task } from './domain.mjs';
import { validateTaskDraft } from './task-drafts.mjs';

export const MAX_BATCH_TASKS = 50;

// Plain text only: dates and instructions in a pasted title are never executed or inferred.
export function parseTaskLines(text) {
  if (typeof text !== 'string' || text.length > 30000) throw Error('Paste up to 30,000 characters at a time.');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw Error('Paste at least one task, with one task on each line.');
  if (lines.length > MAX_BATCH_TASKS) throw Error(`Review up to ${MAX_BATCH_TASKS} tasks at a time. Split this list into smaller batches.`);
  return lines.map((title, index) => {
    if (title.length > 500) throw Error(`Task ${index + 1} is too long. Keep each task under 500 characters.`);
    return { title, date: '', time: '', kind: 'Task', course: '', notes: '' };
  });
}

const key = t => JSON.stringify([t.title.trim().replace(/\s+/g, ' ').toLowerCase(), t.date || '', t.time || '', t.kind || 'Task', t.course || '']);

// Validate every selected row before returning any records. Re-run against current state at save.
export function previewTaskBatch(drafts, state) {
  if (!Array.isArray(drafts) || !drafts.length || drafts.length > MAX_BATCH_TASKS) throw Error(`Select between 1 and ${MAX_BATCH_TASKS} tasks.`);
  const valid = drafts.map((draft, index) => {
    try { return validateTaskDraft(draft, state); }
    catch (error) { throw Error(`Selected task ${index + 1}: ${error.message}`); }
  });
  // Personal capture never suppresses a task because an unrelated project contains it.
  const seen = new Set(state.tasks.filter(t => !t.project).map(key));
  return valid.map(draft => {
    const signature = key(draft), duplicate = seen.has(signature);
    seen.add(signature);
    return { draft, duplicate };
  });
}

export function prepareTaskBatch(drafts, state) {
  const rows = previewTaskBatch(drafts, state);
  return { tasks: rows.filter(row => !row.duplicate).map(row => task(row.draft)), skipped: rows.filter(row => row.duplicate).length };
}
