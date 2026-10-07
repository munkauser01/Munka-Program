// The desktop owns review authority. The hosted model has no Electron/OS tools.
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const path=require('node:path');

function serviceURL(value) {
  if (!value) return '';
  const url=new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol==='https:' || (url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))))
    throw Error('Munka AI needs a secure service origin.');
  return url.origin;
}
function createManagedAIService({url='',getSession,saveSession,clearSession,getState,appendTasks,fetchImpl=fetch,now=()=>new Date()}) {
  const origin=serviceURL(url);
  const modules=Promise.all(['managed-ai-contract','ai-proposals','ai-deadlines','domain'].map(n=>import(pathToFileURL(path.join(__dirname,'../src/'+n+'.mjs')).href)));
  let pending=null, active=null;
  const committed=new Map();
  const session=()=> {const s=getSession(); return s && s.url===origin && typeof s.token==='string' && s.token ? s : null;};
  const identity=()=>session()?.token || '';
  const cancel=()=>{pending?.abort();active=null;};
  async function request(route,{body,token,signal}={}) {
    const response=await fetchImpl(origin+route,{method:body?'POST':'GET',redirect:'error',
      signal:signal || AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    let text='',size=0;
    if(!response.body)throw Error('Munka AI returned an empty response.');
    const reader=response.body.getReader(), decoder=new TextDecoder();
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>100000){await reader.cancel();throw Error('Munka AI returned too much data.');}text+=decoder.decode(value,{stream:true});
    }text+=decoder.decode();}finally{reader.releaseLock();}
    let result;try{result=JSON.parse(text);}catch{throw Error('Munka AI is temporarily unavailable.');}
    if(!response.ok) {
      const serviceErrors={
        ai_billing_unavailable:'The AI service needs API credit from its owner. Your message is kept; nothing was added.',
        ai_auth_unavailable:'The AI connection needs attention from its owner. Your message is kept; nothing was added.',
        ai_model_unavailable:'The configured AI service is unavailable to this account. Your message is kept; nothing was added.',
        ai_provider_busy:'The AI service is busy. Wait a little before trying again. Nothing was added.',
      };
      if(Object.hasOwn(serviceErrors,result.code))throw Error(serviceErrors[result.code]);
      if(response.status===401)throw Error('Sign in to Munka again to use AI.');
      if(response.status===429)throw Error('The request allowance has been reached. Try again after the reset shown below.');
      if(response.status===409)throw Error('A plan is already being prepared. Wait before sending again.');
      if(route==='/auth/login')throw Error('Sign-in failed. Check your email and password.');
      throw Error('Munka AI could not complete this request. Nothing was added. If it reached the model, the attempt counts.');
    }
    return result;
  }
  async function status() {
    const [contract]=await modules;
    const base={managed:true,provider:'managed',model:contract.AI_MODEL,limit:3,maxTasks:5,used:0,remaining:null,
      configured:false,available:false,signedIn:!!session(),serviceReady:!!origin};
    if(!origin)return {...base,notice:'Munka AI is not connected yet. Check your saved deadlines below, or use Guided task in the calendar.'};
    const s=session();
    if(!s)return {...base,notice:'Munka AI is being connected to your new account. Saved deadlines are available below.'};
    try{
      const result=await request('/ai/status',{token:s.token});
      if(identity()!==s.token)return {...base,signedIn:false,notice:'Your account changed. Sign in again.'};
      if(result.limit!==3 || !Number.isInteger(result.used) || result.used<0 || result.used>3 ||
          typeof result.resetsAt!=='string' || !Number.isFinite(Date.parse(result.resetsAt)))throw Error('Invalid service allowance.');
      return {...base,configured:result.configured===true,available:result.available===true,
        used:result.used,remaining:3-result.used,resetsAt:result.resetsAt,
        notice:!result.configured?'Munka AI is not connected yet. Your saved deadlines are available.':
          !result.available?'Munka AI is unavailable for today. Your saved deadlines are available.':''};
    }catch(e){return {...base,notice:e.message};}
  }
  async function signIn({email,password}={}) {
    if(!origin)throw Error('Munka AI is not connected yet.');
    if(pending)throw Error('Cancel the current request before signing in.');
    if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length<12||password.length>1024)
      throw Error('Enter your Munka email and password (at least 12 characters).');
    const result=await request('/auth/login',{body:{email,password}});
    if(typeof result.token!=='string'||result.token.length>512||typeof result.user?.id!=='string')throw Error('Invalid sign-in response.');
    cancel();committed.clear();saveSession({url:origin,token:result.token,user:result.user});
    return status();
  }
  async function disconnect() {
    const s=session();cancel();committed.clear();clearSession();
    if(s)try{await request('/auth/logout',{token:s.token,body:{}});}catch{/* Local sign-out still completes; server sessions expire. */}
    return status();
  }
  async function deadlines({window='week',course=''}={}) {
    const [,,{deadlineSummary}]=await modules;
    return deadlineSummary(getState(),{window,course,now:now()});
  }
  async function propose({messages,course='',consent=false}={}) {
    if(pending)throw Error('An AI request is already running.');
    if(consent!==true)throw Error('Agree to send this conversation before continuing.');
    const s=session();if(!origin||!s)throw Error('Sign in to Munka to use AI.');
    const controller=new AbortController();pending=controller;active=null;
    const timer=setTimeout(()=>controller.abort(),55000);
    try{
      const [contract,,,domain]=await modules;
      const state=getState(),selected=state.courses.find(c=>c.id===course);
      if(typeof course!=='string'||(course&&!selected))throw Error('Choose an existing course.');
      const payload=contract.validateManagedRequest({messages,context:{today:domain.dateKey(now()),
        timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,courseName:selected?.name.slice(0,200)||''}});
      if(controller.signal.aborted)throw Error('Cancelled');
      const result=await request('/ai/plan',{body:payload,token:s.token,signal:controller.signal});
      if(controller.signal.aborted||identity()!==s.token)throw Error('The request was cancelled or the account changed.');
      const proposal=contract.validateManagedProposal(result.proposal,getState(),course);
      const proposalId=proposal.decision==='plan'?randomUUID():null;
      if(proposalId)active={id:proposalId,token:s.token,course,count:proposal.tasks.length,expires:now().getTime()+900000};
      const summary=proposal.decision==='deadlines'?await deadlines({window:proposal.dueWindow,course}):null;
      return {proposalId,proposal,summary};
    }catch(e){if(controller.signal.aborted)throw Error('Request cancelled or timed out. A sent attempt still counts. Nothing was added.');
      if(e instanceof TypeError)throw Error('Could not reach Munka AI. Check your connection.');throw e;
    }finally{clearTimeout(timer);if(pending===controller)pending=null;}
  }
  async function approve({proposalId,tasks,confirmed=false}={}) {
    if(confirmed!==true)throw Error('Review and confirm the tasks before adding.');
    const token=identity(), saved=committed.get(proposalId);
    if(saved && saved.token===token && token)return saved.result;
    const ticket=active;
    if(pending||!ticket||ticket.id!==proposalId||ticket.token!==token||!token||ticket.expires<=now().getTime())
      throw Error('This plan has expired or was cancelled. Generate a fresh plan.');
    const [,{validateAIProposal,duplicateDraft}]=await modules;
    if(active!==ticket||identity()!==token||ticket.expires<=now().getTime()||!Array.isArray(tasks)||!tasks.length||tasks.length>ticket.count)
      throw Error('Select only tasks from the current plan.');
    const validated=validateAIProposal({decision:'plan',clarification:'none',tasks},getState(),ticket.course,ticket.count).tasks;
    const seen=[...getState().tasks];
    for(const draft of validated){if(duplicateDraft(draft,seen))throw Error('A matching task already exists. Deselect it or edit its title/date.');seen.push(draft);}
    const result=appendTasks(validated);active=null;committed.set(proposalId,{token,result});
    if(committed.size>32)committed.delete(committed.keys().next().value);
    return result;
  }
  return {status,signIn,disconnect,deadlines,propose,approve,cancel,
    configure:()=>{throw Error('Munka manages AI setup and your allowance. No API key needed.');}};
}
module.exports={createManagedAIService,serviceURL};
