import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, task, complete, validateBackup } from '../src/domain.mjs';
import { widgetModel, widgetTaskState } from '../src/widget-model.mjs';
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
test('completed tasks disappear only after their due date; project totals retain history', () => {
  const s=initialState();s.projects=[{id:'p',name:'Research'}];
  s.tasks=[
    task({title:'Past done',date:'2026-09-20',status:'Done'}),
    task({title:'Today done',date:'2026-09-21',status:'Done'}),
    task({title:'Future done',date:'2026-09-22',status:'Done'}),
    task({title:'Undated done',status:'Done'}),
    task({title:'Past open',date:'2026-09-20'}),
    task({title:'Project done',date:'2026-09-20',status:'Done',project:'p'}),
    task({title:'Project open',date:'2026-09-20',project:'p'}),
  ];
  const m=widgetModel(s,'2026-09-21');
  assert.deepEqual(m.daily.map(t=>t.title),['Past open','Today done','Future done','Undated done']);
  assert.equal(m.projects[0].tasks.length,2);assert.equal(m.projects[0].done,1);
  assert.deepEqual(m.projects[0].visibleTasks.map(t=>t.title),['Project open']);
  assert.ok(!widgetModel(s,'2026-09-22').daily.some(t=>t.title==='Today done'));
  assert.equal(s.tasks.length,7);
});
test('whole-row urgency is high priority or an unfinished task before today',()=>{
  for(const status of ['To do','In progress','Done']) {
    assert.equal(widgetTaskState(task({title:'High',priority:'High',status}),'2026-09-21').urgent,true);
    assert.equal(widgetTaskState(task({title:'Past',date:'2026-09-20',status}),'2026-09-21').overdue,status!=='Done');
  }
  for(const date of ['','2026-09-21','2026-09-22'])assert.equal(widgetTaskState(task({title:'Normal',date}),'2026-09-21').urgent,false);
});
test('hidden counts describe restorable work, excluding deleted and already expired tasks',()=>{
  const s=initialState();
  s.tasks=[task({title:'Hidden',date:'2026-09-22'}),task({title:'Expired',date:'2026-09-20',status:'Done'})];
  s.preferences.widgetHiddenTasks=[...s.tasks.map(t=>t.id),'deleted-id'];
  const model=widgetModel(s,'2026-09-21');
  assert.equal(model.daily.length,0);assert.equal(model.dailyHiddenCount,1);assert.equal(model.hiddenCount,1);
});
