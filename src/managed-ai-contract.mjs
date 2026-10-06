import { aiProposalSchema, validateAIProposal } from './ai-proposals.mjs';
import { validDate } from './domain.mjs';

export const AI_DAILY_LIMIT = 3;
export const AI_MAX_TASKS = 5;
export const AI_MODEL = 'gpt-5.6-luna';
const windows = ['none', 'today', 'week', 'overdue', 'upcoming'];
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).sort().join(',') === [...keys].sort().join(',');
export const managedProposalSchema = {
  ...aiProposalSchema, required: [...aiProposalSchema.required, 'dueWindow'],
  properties: {
    ...aiProposalSchema.properties,
    decision: { type: 'string', enum: ['plan', 'clarify', 'out_of_scope', 'deadlines'] },
    dueWindow: { type: 'string', enum: windows },
    tasks: { ...aiProposalSchema.properties.tasks, maxItems: AI_MAX_TASKS },
  },
};
export function validateManagedProposal(value, state = {courses: []}, course = '') {
  if (!exact(value, ['decision', 'clarification', 'tasks', 'dueWindow']) || !windows.includes(value.dueWindow))
    throw Error('AI returned an unsupported plan. Nothing was added.');
  const { dueWindow, ...base } = value;
  if (base.decision === 'deadlines') {
    if (dueWindow === 'none' || base.clarification !== 'none' || !Array.isArray(base.tasks) || base.tasks.length)
      throw Error('AI returned an unsupported deadline request.');
    return value;
  }
  if (dueWindow !== 'none') throw Error('AI returned an inconsistent plan.');
  return {...validateAIProposal(base, state, course, AI_MAX_TASKS), dueWindow};
}
export function validateManagedRequest(value) {
  if (!exact(value, ['messages', 'context'])) throw Error('Unsupported planning request.');
  const { messages, context } = value;
  if (!Array.isArray(messages) || !messages.length || messages.length > 11 ||
      messages.some((m, i) => !exact(m, ['role','content']) || m.role !== (i % 2 ? 'assistant' : 'user') ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 6000) ||
      messages.at(-1).role !== 'user' || messages.reduce((n,m) => n + m.content.length, 0) > 16000)
    throw Error('Start a new plan and keep each message under 6,000 characters.');
  if (!exact(context, ['today','timeZone','courseName']) || typeof context.today !== 'string' || !validDate(context.today) ||
      typeof context.timeZone !== 'string' || context.timeZone.length > 80 ||
      typeof context.courseName !== 'string' || context.courseName.length > 200)
    throw Error('Invalid planning context.');
  try { new Intl.DateTimeFormat('en', {timeZone: context.timeZone}); } catch { throw Error('Invalid time zone.'); }
  if (/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/.test(JSON.stringify(value)))
    throw Error('Remove the API key from your message. Munka never needs a key in chat.');
  return value;
}
