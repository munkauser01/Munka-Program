import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserBridge } from '../src/browser-bridge.mjs';
import { task } from '../src/domain.mjs';

function fixture() {
  const records=new Map(), storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
  let current={id:'alice',email:'alice@example.test'}, options;
  const bridge=createBrowserBridge({storage,clientFactory:(_url,_key,config)=>{
    options=config;
    return {auth:{onAuthStateChange(){},stopAutoRefresh(){},
      async signInWithPassword(credentials){if(credentials.password==='incorrect')return {error:Error('Invalid login credentials')};return {data:{session:{},user:current}};},
      async signUp(){return {data:{user:current,session:null}};},
      async getUser(){return {data:{user:current}};}, async signOut(){return {};},
    }};
  }});
  return {bridge,records,storage,setUser:value=>current=value,options:()=>options};
}
test('planner is gated until local mode or verified sign-in',async()=>{
  const {bridge}=fixture();await assert.rejects(bridge.load(),/Sign in/);
  await bridge.account('useLocal');assert.equal((await bridge.load()).preferences.calendarMode,'agenda');
});
test('local save persists, increments revision and refuses stale writes',async()=>{
  const {bridge}=fixture();await bridge.account('useLocal');const state=await bridge.load();
  state.tasks.push(task({title:'Local work'}));const next=await bridge.save(state,0);
  assert.equal(next.revision,1);assert.equal((await bridge.load()).tasks[0].title,'Local work');
  await assert.rejects(bridge.save(state,0),/another tab/);
});
test('corrupt stored data is preserved and reported',async()=>{
  const {bridge,records}=fixture();records.set('munka','broken');await bridge.account('useLocal');
  await assert.rejects(bridge.load(),/not been overwritten/);assert.equal(records.get('munka'),'broken');
});
test('storage failure surfaces without claiming a save',async()=>{
  const {bridge,storage}=fixture();await bridge.account('useLocal');const state=await bridge.load();
  storage.setItem=()=>{throw Error('Quota');};await assert.rejects(bridge.save(state,0),/could not save/);
});
test('accounts and local planner have isolated records; no session persistence',async()=>{
  const f=fixture();await f.bridge.account('useLocal');let state=await f.bridge.load();
  state.tasks.push(task({title:'Local private work'}));await f.bridge.save(state,0);
  await f.bridge.account('signIn',{email:'alice@example.test',password:'test-only-password'});
  assert.equal(f.options().auth.persistSession,false);assert.equal((await f.bridge.load()).tasks.length,0);
  state=await f.bridge.load();state.tasks.push(task({title:'Alice private work'}));await f.bridge.save(state,0);
  await f.bridge.account('signOut');await assert.rejects(f.bridge.load(),/Sign in/);
  f.setUser({id:'bob',email:'bob@example.test'});
  await f.bridge.account('signIn',{email:'bob@example.test',password:'test-only-password'});
  assert.equal((await f.bridge.load()).tasks.length,0);
  await f.bridge.account('useLocal');assert.equal((await f.bridge.load()).tasks[0].title,'Local private work');
  assert.ok([...f.records.keys()].every(key=>key==='munka'||key.startsWith('munka.account.')));
});
test('registration confirmation never unlocks planner early',async()=>{
  const {bridge}=fixture();const result=await bridge.account('register',{email:'alice@example.test',password:'test-only-password'});
  assert.equal(result.confirmationRequired,true);await assert.rejects(bridge.load(),/Sign in/);
});
test('invalid or unverified sign-in does not unlock planner',async()=>{
  const {bridge,setUser}=fixture();
  await assert.rejects(bridge.account('signIn',{email:'alice@example.test',password:'incorrect'}),/Invalid/);
  setUser(null);await assert.rejects(bridge.account('signIn',{email:'alice@example.test',password:'test-only-password'}),/verify/);
  await assert.rejects(bridge.load(),/Sign in/);
});
