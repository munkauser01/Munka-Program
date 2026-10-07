import { initialState, validateBackup } from './domain.mjs';

export const cloudCollections = ['tasks','courses','terms','projects','events','habits','rules','views'];
const syncedPreferences = ['theme','calendarMode','calendarAgendaEmpty','defaultTaskKind','dayBudgets','planningFocus','focus','profile','onboardingVersion'];
const copy = value => structuredClone(value);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function personalBody(state) {
  const body = { version: 1, preferences: {} };
  for (const collection of cloudCollections) body[collection] = state[collection].filter(item => !item._sync?.space && !item.externalCalendar).map(item => {
    const clean = copy(item); delete clean._sync; return clean;
  });
  for (const key of syncedPreferences) if (state.preferences[key] !== undefined) body.preferences[key] = copy(state.preferences[key]);
  return body;
}
export function mergePersonal(base, local, remote) {
  const result = {version:1,preferences:{}}, conflicts = [];
  base ||= personalBody(initialState()); remote ||= personalBody(initialState());
  for (const collection of cloudCollections) {
    const maps = [base,local,remote].map(body => new Map((body[collection] || []).map(item => [item.id,item])));
    result[collection] = [];
    for (const id of new Set(maps.flatMap(map => [...map.keys()]))) {
      const [before,mine,theirs] = maps.map(map => map.get(id));
      let value;
      if (same(mine,theirs) || same(theirs,before)) value=mine;
      else if (same(mine,before)) value=theirs;
      else { conflicts.push({collection,id,local:mine ?? null,remote:theirs ?? null}); value=mine; }
      if (value) result[collection].push(copy(value));
    }
  }
  for (const key of new Set([...Object.keys(local.preferences||{}),...Object.keys(remote.preferences||{})])) {
    const [before,mine,theirs] = [base,local,remote].map(body=>body.preferences?.[key]);
    if (!same(mine,theirs) && !same(mine,before) && !same(theirs,before)) conflicts.push({collection:'preferences',id:key,local:mine??null,remote:theirs??null});
    const value = same(mine,before) ? theirs : mine;
    if (value !== undefined) result.preferences[key]=copy(value);
  }
  return {body:result,conflicts};
}
function applyPersonal(state, body) {
  const next=copy(state);
  for (const collection of cloudCollections) next[collection]=[...(body[collection]||[]),...state[collection].filter(item=>item._sync?.space || item.externalCalendar)];
  for(const key of syncedPreferences) if(body.preferences[key]!==undefined)next.preferences[key]=copy(body.preferences[key]);
  return validateBackup(next);
}
export function createCloudSync({bridge,onStatus=()=>{},onPlannerChange=()=>{}}) {
  let user=null,generation=0,busy=false,applying=false,timer;
  let status={enabled:false,busy:false,message:'Sync is off',conflicts:[],calendars:[],invitations:[]};
  const publish=patch=>{status={...status,...patch};onStatus(status);return status;};
  function stop(){generation++;user=null;busy=false;clearInterval(timer);publish({enabled:false,busy:false,message:'Sign in to sync',conflicts:[],calendars:[],invitations:[]});}
  async function rpc(action,data={}) {
    if(!user)throw Error('Sign in to sync and share calendars.');
    const token=generation, identity=user;
    const result=await bridge.cloud(action,data,identity);
    if(token!==generation||identity!==user)throw Error('Your account changed. Reopen the planner.');
    return result;
  }
  async function commit(next,revision,token=generation){
    if(token!==generation||!user)throw Error('Your account changed.');
    const identity=user;
    applying=true;try{
      const saved=await bridge.save(next,revision,identity);
      if(token===generation&&user===identity)onPlannerChange(saved,identity);
      return saved;
    }finally{applying=false;}
  }
  async function shared() {
    const token=generation;
    const [snapshot,invitations]=await Promise.all([rpc('calendar_list'),rpc('invitation_list')]);
    const state=await bridge.load();
    if(token!==generation||!user)throw Error('Your account changed.');
    const spaces=new Map(snapshot.calendars.map(calendar=>[calendar.id,calendar]));
    const events=snapshot.events.map(record=>({ ...record.body,_sync:{space:record.space_id,version:record.version,role:spaces.get(record.space_id)?.role,permissions:spaces.get(record.space_id)?.permissions},sharedCalendarName:spaces.get(record.space_id)?.name }));
    const next={...state,events:[...state.events.filter(event=>!event._sync?.space),...events]};
    if(!same(next.events,state.events))await commit(next,state.revision,token);
    publish({calendars:snapshot.calendars,invitations});
    return snapshot;
  }
  async function sync() {
    if(!user||busy)return status;
    busy=true;const token=generation;
    publish({busy:true,message:'Syncing…'});
    try {
      const first=await bridge.load();
      if(first.cloudSync?.enabled) {
        let saved=false;
        for(let attempt=0;attempt<3;attempt++) {
          const remote=await rpc('planner_read'), current=await bridge.load();
          const local=personalBody(current), merged=mergePersonal(current.cloudSync?.base,local,remote.body);
          if(JSON.stringify(merged.body).length>1500000)throw Error('This beta supports cloud planners up to 1.5 MB. Export a backup and archive older records before enabling sync.');
          if(merged.conflicts.length) {
            await commit({...current,cloudSync:{...current.cloudSync,conflicts:merged.conflicts}},current.revision,token);
            publish({enabled:true,conflicts:merged.conflicts,message:'Review conflicting changes'});break;
          }
          try {
            const uploaded=same(merged.body,remote.body)?remote:await rpc('planner_write',{revision:remote.revision,body:merged.body});
            // A local edit while uploading remains pending and is merged on the next pass.
            const latest=await bridge.load();
            const combined=mergePersonal(local,personalBody(latest),merged.body);
            const next=applyPersonal(latest,combined.body);
            next.cloudSync={enabled:true,base:copy(uploaded.body),remoteRevision:uploaded.revision,conflicts:combined.conflicts,lastSync:new Date().toISOString()};
            await commit(next,latest.revision,token);saved=true;
            publish({enabled:true,conflicts:combined.conflicts,message:combined.conflicts.length?'Review conflicting changes':'Synced'});break;
          }catch(error){if(error.code!=='40001'&&!/changed; merge|another (tab|window)/i.test(error.message))throw error; if(attempt===2)throw Error('Another device is busy saving. Your edits remain on this device; retry sync.');}
        }
        if(!saved&&status.conflicts.length===0)publish({message:'Your changes are waiting to sync'});
      }else publish({enabled:false,message:'Personal sync is off'});
      await shared();
    }catch(error){if(token===generation)publish({message:'Saved on this device · '+error.message});}
    finally{if(token===generation){busy=false;publish({busy:false});}}
    return status;
  }
  async function start(identity){stop();user=identity;const token=generation,current=await bridge.load();if(token!==generation||user!==identity)return;publish({enabled:!!current.cloudSync?.enabled,conflicts:current.cloudSync?.conflicts||[],message:current.cloudSync?.enabled?'Waiting to sync':'Personal sync is off'});timer=setInterval(()=>sync(),60000);timer.unref?.();await sync();}
  async function enable(value=true){const token=generation,current=await bridge.load();await commit({...current,cloudSync:{...current.cloudSync,enabled:value}},current.revision,token);publish({enabled:value});return sync();}
  async function resolve(index,choice){
    const token=generation;
    const state=await bridge.load(), conflicts=state.cloudSync?.conflicts||[], conflict=conflicts[index];
    if(!conflict||!['local','remote'].includes(choice))throw Error('Reopen the conflict review.');
    const remote=await rpc('planner_read');
    const currentValue=conflict.collection==='preferences'?remote.body?.preferences?.[conflict.id]:(remote.body?.[conflict.collection]||[]).find(item=>item.id===conflict.id);
    if(!same(currentValue??null,conflict.remote))throw Error('The cloud copy changed again. Refresh and review it.');
    const selected=conflict[choice];
    const next=copy(await bridge.load()), base=copy(next.cloudSync.base||personalBody(initialState()));
    if(conflict.collection==='preferences') {if(selected===null)delete next.preferences[conflict.id];else next.preferences[conflict.id]=selected; if(conflict.remote===null)delete base.preferences[conflict.id];else base.preferences[conflict.id]=conflict.remote;}
    else {next[conflict.collection]=next[conflict.collection].filter(item=>item.id!==conflict.id);if(selected)next[conflict.collection].push(selected);base[conflict.collection]=base[conflict.collection].filter(item=>item.id!==conflict.id);if(conflict.remote)base[conflict.collection].push(conflict.remote);}
    next.cloudSync={...next.cloudSync,base,conflicts:conflicts.filter((_,i)=>i!==index)};
    await commit(next,next.revision,token);return sync();
  }
  async function eventWrite(calendar,event,deleted=false){
    const body={};for(const key of ['id','title','start','end','allDay','notes','location','color','kind','source','deadlineDate'])if(event[key]!==undefined)body[key]=event[key];
    const result=await rpc('event_write',{calendar,id:event.id,version:event._sync?.version||0,body,deleted});await shared();return result;
  }
  return {start,stop,sync,enable,resolve,rpc,shared,eventWrite,getStatus:()=>status,changed:()=>{if(!applying&&user&&status.enabled&&!busy)queueMicrotask(()=>sync());}};
}
