import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initialState, task} from '../src/domain.mjs';
const {wallpaperContent,matchMonitor}=createRequire(import.meta.url)('../electron/wallpaper-model.cjs');
test('wallpaper retains completed daily tasks and separates project work',()=>{
 const s=initialState();s.projects=[{id:'p',name:'Research'}];
 s.tasks=[task({title:'Daily',status:'Done'}),task({title:'Project task',project:'p'})];
 const c=wallpaperContent(s,'Today');assert.equal(c.tasks.length,1);assert.equal(c.tasks[0].done,true);assert.equal(c.projects[0].tasks[0].title,'Project task');
 s.preferences.widgetProjects=false;assert.deepEqual(wallpaperContent(s,'Today').projects,[]);
 s.preferences.privacy=true;assert.equal(wallpaperContent(s,'Today').tasks[0].title,'Upcoming task');
});
test('wallpaper excludes archived terms and uses an explicit count',()=>{
 const s=initialState();s.terms=[{id:'old',archived:true}];s.courses=[{id:'c',term:'old'}];
 s.tasks=[task({title:'Archived',course:'c'}),task({title:'First'}),task({title:'Second'})];s.preferences.wallpaperCount=1;
 assert.deepEqual(wallpaperContent(s,'Today').tasks.map(t=>t.title),['First']);
});
test('wallpaper selects monitor by physical rectangle independent of enumeration order',()=>{
 const a={Id:'a',X:0,Y:0,Width:1920,Height:1080};const b={Id:'b',X:1920,Y:0,Width:2560,Height:1440};
 assert.equal(matchMonitor([b,a],{x:0,y:0,width:1920,height:1080}).Id,'a');
 assert.throws(()=>matchMonitor([a],{x:0,y:0,width:1280,height:720}),/identify/);
 assert.throws(()=>matchMonitor([a,a],{x:0,y:0,width:1920,height:1080}),/identify/);
});

