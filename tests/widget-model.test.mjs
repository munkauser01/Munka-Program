import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, task, complete, validateBackup } from '../src/domain.mjs';
import { widgetModel } from '../src/widget-model.mjs';
test('widget retains every daily task in place after completion, including more than eight', () => {
  const s = initialState();
  s.tasks = Array.from({length: 12}, (_,i) => task({title: 'Task ' + i}));
  const ids = widgetModel(s).daily.map(t => t.id);
  complete(s, ids[0]);
  assert.deepEqual(widgetModel(s).daily.map(t => t.id), ids);
  assert.equal(widgetModel(s).daily[0].status, 'Done');
});
test('project work is separate and completion changes project progress', () => {
  const s = initialState();
  s.projects = [{id:'p',name:'Research'}, {id:'empty',name:'New project'}, {id:'archived',name:'Old',archived:true}];
  s.tasks = [task({title:'Daily'}), task({title:'Draft',project:'p'}), task({title:'Old work',project:'archived'})];
  complete(s, s.tasks[1].id);
  const m = widgetModel(s);
  assert.equal(m.daily.length, 1);
  assert.equal(m.projects.length, 2);
  assert.equal(m.projects[0].done, 1);
  assert.equal(m.projects[1].tasks.length, 0);
});
test('appearance and project visibility survive backup validation', () => {
  const s = initialState();
  s.preferences.widgetDesign = 'plain'; s.preferences.widgetProjects = false;
  const restored = validateBackup(s);
  assert.equal(restored.preferences.widgetDesign, 'plain');
  assert.equal(restored.preferences.widgetProjects, false);
});
