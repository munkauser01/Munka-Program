import { task, validDate } from './domain.mjs';

// Shared trust boundary for quick capture, guided answers and future AI proposals.
// Providers propose these fields only; this module never calls a model or saves data.
export const taskDraftSchema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'date', 'time', 'kind', 'course', 'notes'],
  properties: {
    title: { type: 'string', maxLength: 500 }, date: { type: 'string' },
    time: { type: 'string' }, kind: { type: 'string', enum: ['Task', 'Assignment', 'Exam', 'Personal'] },
    course: { type: 'string' }, notes: { type: 'string', maxLength: 10000 },
  },
};
export function validateTaskDraft(input, state) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Expected one task draft.');
  const allowed = Object.keys(taskDraftSchema.properties);
  if (Object.keys(input).some(k => !allowed.includes(k))) throw Error('The draft contains unsupported fields.');
  if (Object.values(input).some(v => typeof v !== 'string')) throw Error('Draft fields must be text.');
  const draft = { title: '', date: '', time: '', kind: 'Task', course: '', notes: '', ...input };
  draft.title = draft.title.trim();
  if (draft.date && !validDate(draft.date)) throw Error('Choose a valid due date.');
  if (draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) throw Error('Choose a valid due time.');
  if (!taskDraftSchema.properties.kind.enum.includes(draft.kind)) throw Error('Choose a task type.');
  if (draft.course && !state.courses.some(c => c.id === draft.course)) throw Error('Choose an existing course.');
  if (draft.notes.length > 10000) throw Error('Keep draft notes under 10,000 characters.');
  task(draft);
  return draft;
}
