import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, task } from '../src/domain.mjs';
import { calendarItems } from '../src/calendar-model.mjs';
import { calendarScope, calendarPicker } from '../src/calendar-picker.mjs';
const day='2026-10-06';
const record=(id,other={})=>({id,title:id,start:day+'T09:00',end:day+'T10:00',...other});

test('explicit shared selection reveals a hidden calendar without exposing another calendar or private records',()=>{
  const state=initialState();state.preferences.hiddenSharedCalendars=['selected'];
  state.tasks.push(task({title:'Private deadline',date:day}));
  state.events.push(record('private'),record('chosen',{_sync:{space:'selected'}}),record('other',{_sync:{space:'another'}}));
  assert.deepEqual(calendarItems(state,[day],{source:'shared:selected'}).byDay.get(day).events.map(event=>event.id),['chosen']);
  assert.equal(calendarItems(state,[day],{source:'shared:selected'}).byDay.get(day).tasks.length,0);
  assert.deepEqual(calendarItems(state,[day],{source:'all'}).byDay.get(day).events.map(event=>event.id),['private','other']);
});
test('private planner keeps tasks and personal events separate from shared and provider records',()=>{
  const state=initialState();state.tasks.push(task({title:'Private deadline',date:day}));
  state.events.push(record('private'),record('shared',{source:'munka',_sync:{space:'team'}}),record('provider',{source:'google',externalCalendar:true}));
  const personal=calendarItems(state,[day],{source:'personal'}).byDay.get(day);
  assert.deepEqual(personal.events.map(event=>event.id),['private']);assert.equal(personal.tasks.length,1);
  assert.deepEqual(calendarItems(state,[day],{source:'munka'}).byDay.get(day).events.map(event=>event.id),['private']);
});
test('creation destination honors calendar access and detects removed selection',()=>{
  const calendars=[{id:'owner',name:'Owned',role:'owner',permissions:{}},{id:'editor',name:'Editing',role:'editor',permissions:{create:false,edit:true}},{id:'viewer',name:'Viewing',role:'viewer',permissions:{create:true}}];
  assert.equal(calendarScope('shared:owner',calendars).canCreate,true);
  assert.equal(calendarScope('shared:editor',calendars).canCreate,false);
  assert.equal(calendarScope('shared:viewer',calendars).canCreate,false);
  assert.equal(calendarScope('shared:removed',calendars).missing,true);
  assert.equal(calendarScope('shared:removed',calendars).canCreate,false);
});
test('names containing markup stay text in the custom picker',()=>{
  const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const html=calendarPicker({source:'shared:team',calendars:[{id:'team',name:'<img src=x onerror=alert(1)>',role:'viewer'}],esc,icon:()=>''});
  assert.equal(html.includes('<img src=x'),false);assert.ok(html.includes('&lt;img src=x'));assert.ok(html.includes('aria-selected="true"'));
});
