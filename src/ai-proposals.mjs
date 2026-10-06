import { validateTaskDraft } from './task-drafts.mjs';

// Data only: no IDs, permissions, scripts or executable app actions.
export const aiTaskSchema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'date', 'time', 'kind', 'notes'],
  properties: {
    title: { type: 'string', maxLength: 200 }, date: { type: 'string', maxLength: 10 },
    time: { type: 'string', maxLength: 5 },
    kind: { type: 'string', enum: ['Task', 'Assignment', 'Exam', 'Personal'] },
    notes: { type: 'string', maxLength: 2000 },
  },
};

export const aiProposalSchema = {
  type: 'object', additionalProperties: false, required: ['decision', 'clarification', 'tasks'],
  properties: {
    decision: { type: 'string', enum: ['plan', 'clarify', 'out_of_scope'] },
    clarification: { type: 'string', enum: ['none', 'title', 'date', 'time', 'details'] },
    tasks: { type: 'array', maxItems: 8, items: aiTaskSchema },
  },
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

export function validateAIProposal(value, state, course = '', maxTasks = 8) {
  if (!exactKeys(value, ['decision', 'clarification', 'tasks']) ||
      !aiProposalSchema.properties.decision.enum.includes(value.decision) ||
      !aiProposalSchema.properties.clarification.enum.includes(value.clarification) ||
      !Array.isArray(value.tasks) || value.tasks.length > maxTasks)
    throw Error('AI returned an unsupported plan. Try a smaller planning request.');
  if (value.decision === 'plan' ? (!value.tasks.length || value.clarification !== 'none') :
      (value.tasks.length || (value.decision === 'clarify' ? value.clarification === 'none' : value.clarification !== 'none')))
    throw Error('AI returned an inconsistent plan. Try again.');
  const tasks = value.tasks.map(input => {
    if (!exactKeys(input, Object.keys(aiTaskSchema.properties)) ||
        Object.entries(input).some(([k,v]) => typeof v !== 'string' || v.length > (aiTaskSchema.properties[k].maxLength || 20)))
      throw Error('AI returned unsupported task fields. Nothing was added.');
    const draft = validateTaskDraft({ ...input, course }, state);
    if (draft.time && !draft.date) throw Error('A due time needs a date. Ask AI to clarify the date.');
    return draft;
  });
  return { decision: value.decision, clarification: value.clarification, tasks };
}
export function proposalMessage(proposal) {
  if (proposal.decision === 'out_of_scope') return 'I can help create tasks and planning checklists in Munka. What would you like to plan?';
  if (proposal.decision === 'plan') return `${proposal.tasks.length} task${proposal.tasks.length === 1 ? '' : 's'} ready for your review. Check the titles and dates before adding.`;
  return {
    title: 'What task or goal would you like to plan?',
    date: 'Which date do you mean? Include the month and day, or say no deadline.',
    time: 'What local time should the task be due? You can also leave the time blank.',
    details: 'What are the steps, deadlines, or constraints for this plan?',
  }[proposal.clarification];
}
export function duplicateDraft(draft, tasks) {
  const title = draft.title.trim().toLocaleLowerCase();
  return tasks.some(t => t.title.trim().toLocaleLowerCase() === title &&
    (t.date || '') === draft.date && (t.time || '') === draft.time && (t.course || '') === draft.course);
}
