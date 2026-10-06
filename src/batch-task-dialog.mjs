import { parseTaskLines, prepareTaskBatch, previewTaskBatch } from './batch-tasks.mjs';
import { runRules } from './domain.mjs';

export function openBatchTasks({ getState, save, drawer, field, select, esc, closeDrawer, toast }) {
  let text = '', course = '', remembered = [], rememberedSelection = [];
  function paste() {
    drawer('Paste several tasks', `<p>Bring in an assignment list or a few things on your mind. Use one task per line.</p><label class="field"><span>Your tasks</span><textarea name="tasks" rows="9" maxlength="30000" required placeholder="Read chapter 4&#10;Draft the lab report&#10;Review lecture notes">${esc(text)}</textarea></label>${select('Course for these tasks (optional)', 'course', course, [['', 'None'], ...getState().courses.map(c => [c.id, c.name])])}<p class="muted small">Up to 50 tasks. Works offline. Dates are left blank for you to review; this does not extract a syllabus automatically.</p><div class="drawer-footer"><button class="primary">Review tasks</button></div>`, form => {
      text = form.get('tasks'); course = form.get('course');
      const parsed = parseTaskLines(text);
      review(parsed.map((draft, i) => ({ ...draft, ...(remembered[i]?.title === draft.title ? remembered[i] : {}), course })), parsed.map((draft, i) => remembered[i]?.title === draft.title ? rememberedSelection[i] : true));
    });
  }
  function review(drafts, selection) {
    const el = drawer('Review pasted tasks', `<div class="batch-body"><p>Edit each task and choose a due date if you know it. Uncheck anything you do not want to add.</p><p class="muted small">Matching title, date, time, type and course are treated as duplicates, including completed tasks. Duplicates are skipped when you save.</p><div class="batch-rows">${drafts.map((draft, i) => `<fieldset class="batch-task"><legend>Task ${i + 1}</legend><label class="checkline"><input type="checkbox" name="include-${i}" ${selection[i] ? 'checked' : ''}>Include this task</label>${field('Title', 'title-'+i, draft.title, 'text', 'required maxlength="500"')}<div class="form-grid">${field('Due date (optional)', 'date-'+i, draft.date, 'date')}${select('Type', 'kind-'+i, draft.kind, ['Task','Assignment','Exam','Personal'])}</div><p class="batch-row-status small muted" data-batch-status="${i}"></p></fieldset>`).join('')}</div></div><p class="batch-summary small" role="status" aria-live="polite"></p><div class="drawer-footer"><button type="button" id="batch-back">Back</button><button class="primary" id="batch-add">Add tasks</button></div>`, async form => {
      const result = prepareTaskBatch(read(form), getState());
      if (!result.tasks.length) throw Error('These tasks already exist. Edit them above or close this preview.');
      const state = getState();
      state.tasks.push(...result.tasks);
      for (const created of result.tasks) runRules(state, 'created', created);
      if (!(await save())) return;
      closeDrawer();
      toast(`${result.tasks.length} task${result.tasks.length === 1 ? '' : 's'} added${result.skipped ? ` · ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}`);
    });
    el.classList.add('batch-drawer');
    function read(form) {
      return drafts.flatMap((draft, i) => form.has('include-'+i) ? [{ ...draft, title: form.get('title-'+i), date: form.get('date-'+i), kind: form.get('kind-'+i) }] : []);
    }
    const summary = el.querySelector('.batch-summary'), add = el.querySelector('#batch-add');
    function update() {
      let form = new FormData(el.querySelector('form'));
      drafts.forEach((_, i) => {
        const included = form.has('include-'+i);
        el.querySelectorAll(`[name="title-${i}"],[name="date-${i}"],[name="kind-${i}"]`).forEach(input => input.disabled = !included);
      });
      form = new FormData(el.querySelector('form'));
      el.querySelectorAll('[data-batch-status]').forEach(status => status.textContent = '');
      try {
        const rows = previewTaskBatch(read(form), getState()), count = rows.filter(row => !row.duplicate).length;
        let selected = 0;
        drafts.forEach((_, i) => {
          if (form.has('include-'+i) && rows[selected++].duplicate) el.querySelector(`[data-batch-status="${i}"]`).textContent = 'Duplicate · will be skipped';
        });
        summary.textContent = `${count} ready to add · ${rows.length - count} duplicates will be skipped`;
        add.textContent = `Add ${count} task${count === 1 ? '' : 's'}`;
        add.disabled = !count;
      } catch (error) { summary.textContent = error.message; add.disabled = true; }
    }
    el.querySelector('#batch-back').onclick = () => {
      rememberedSelection = drafts.map((_, i) => el.querySelector(`[name="include-${i}"]`).checked);
      remembered = drafts.map((draft, i) => ({ ...draft, title: el.querySelector(`[name="title-${i}"]`).value, date: el.querySelector(`[name="date-${i}"]`).value, kind: el.querySelector(`[name="kind-${i}"]`).value }));
      text = remembered.map(draft => draft.title).join('\n');
      paste();
    };
    el.querySelector('form').addEventListener('input', update);
    el.querySelector('form').addEventListener('change', update);
    update();
  }
  paste();
}
