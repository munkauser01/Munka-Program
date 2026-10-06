import { proposalMessage } from './ai-proposals.mjs';
import { AI_PROVIDERS } from './ai-providers.mjs';

export function aiActions({bridge, getState, drawer, field, select, esc, closeDrawer, refresh, toast}) {
  let messages=[], proposal=null, proposalId=null, summary=null, course='', consent=false, pendingText='', status;
  const clearChat=()=>{messages=[];proposal=null;proposalId=null;summary=null;pendingText='';consent=false;};
  const canSend=()=>status.configured && (!status.managed || status.available) && status.used<status.limit;
  const usage=()=>status.managed ? (status.remaining===null?'Your AI allowance will appear when connected.':
    `Refreshes ${new Date(status.resetsAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}.`) :
    `${status.used} / ${status.limit} requests used today.`;
  const percent=()=>Math.round(100*(status.remaining||0)/status.limit);
  function updateUsage(el){
    el.querySelector('.ai-usage').textContent=usage();
    const meter=el.querySelector('#ai-allowance-meter');
    if(meter){meter.value=percent();meter.setAttribute('aria-valuetext',status.remaining===null?'Allowance unavailable':`${percent()} percent remaining`);meter.classList.toggle('is-unavailable',status.remaining===null);el.querySelector('#ai-allowance-percent').textContent=status.remaining===null?'—':percent()+'%';}
  }
  function planDrawer(title, html, submit) {
    const footer = html.lastIndexOf('<div class="drawer-footer">');
    return drawer(title, '<div class="ai-body">' + html.slice(0, footer) + '</div>' + html.slice(footer), submit);
  }
  async function open(initialText='') {
    pendingText=String(initialText).slice(0,4000);
    if(!bridge.ai){drawer('Plan with Munka','<p>AI is not available in the mobile beta yet. Use the desktop app for AI, or use Quick capture and Guided task here.</p>');return;}
    status=await bridge.ai('status');status.managed||status.configured?chat():settings();
  }
  function settings() {
    const el=planDrawer('AI settings',`<p class="ai-intro">Turn your goals into a plan.</p><p>Choose a provider. Ollama runs locally without a key; cloud providers use their own API keys. Munka only proposes tasks for you to review.</p>
      ${select('AI provider','provider',status.provider,Object.entries(AI_PROVIDERS).filter(([id])=>id!=='managed').map(([id,p])=>[id,p.label]))}
      <p class="small muted" id="ai-provider-info" aria-live="polite"></p>
      <div id="ai-key-wrap">${field(status.configured?'API key (blank keeps the same provider’s key)':'Provider API key','key','','password',`${status.configured?'':'required'} maxlength="512" autocomplete="off" spellcheck="false"`)}</div>
      <div id="ai-model-wrap" hidden>${field('Ollama model name','model',status.model || 'llama3.2:3b','text','required maxlength="80" pattern="[A-Za-z0-9._:-]+" autocomplete="off" spellcheck="false"')}<p class="small muted">Use the exact model you pulled locally, for example <code>ollama pull llama3.2:3b</code>.</p></div>
      <p class="small muted" id="ai-key-help">Cloud keys are saved with Windows encryption, separately from planner backups. Never paste a key into chat.</p>
      <div class="form-grid">${field('Requests per day','limit',status.limit,'number','required min="1" max="100" step="1"')}${field('Tasks per plan','maxTasks',status.maxTasks,'number','required min="1" max="8" step="1"')}</div>
      ${select('Response style','pace',status.pace,[['balanced','Balanced · think through the plan'],['fast','Fast · simple task capture']])}
      <p class="small muted">Balanced gives the model time to reason. Fast uses less reasoning for simple requests. Both require your review.</p>
      <p class="small muted">${status.used} requests used today on this PC. Failed and cancelled attempts count. This is not a dollar spending cap. Pricing checked September 14, 2026.</p>
      <p class="small">AI cannot open files, run commands, change settings or trigger automations. You decide which tasks to add.</p>
      ${status.secure?'':'<p id="ai-encryption-warning">Windows encryption is unavailable. Cloud keys cannot be saved.</p>'}
      <div class="drawer-footer">${status.configured?'<button type="button" id="ai-disconnect">Disconnect</button><button type="button" id="ai-back">Back to plan</button>':''}<button class="primary" id="ai-save" ${status.secure?'':'disabled'}>Save AI settings</button></div>`,async form=>{
        const provider=form.get('provider'),key=String(form.get('key')||'').trim(),model=String(form.get('model')||'').trim();el.querySelector('[name=key]').value='';form.delete('key');
        status=await bridge.ai('configure',{provider,key,model,limit:Number(form.get('limit')),maxTasks:Number(form.get('maxTasks')),pace:form.get('pace')});
        const keepText=pendingText;clearChat();pendingText=keepText;if(el.isConnected)chat();
      });
    el.classList.add('ai-drawer');
    const updateProvider=()=>{
      const provider=el.querySelector('[name=provider]').value;
      el.querySelector('#ai-provider-info').textContent=AI_PROVIDERS[provider].description;
      const local=provider==='ollama', key=el.querySelector('[name=key]'), model=el.querySelector('[name=model]');
      el.querySelector('#ai-key-wrap').hidden=local;el.querySelector('#ai-model-wrap').hidden=!local;
      key.required=!local && (!status.configured||provider!==status.provider);key.disabled=local;
      model.required=local;model.disabled=!local;
      el.querySelector('#ai-key-help').hidden=local;
      el.querySelector('#ai-encryption-warning')?.toggleAttribute('hidden',local || status.secure);
      el.querySelector('#ai-save').disabled=!(local || status.secure);
    };
    el.querySelector('[name=provider]').onchange=()=>{el.querySelector('[name=key]').value='';updateProvider();};updateProvider();
    el.querySelector('#ai-back')?.addEventListener('click',chat);
    el.querySelector('#ai-disconnect')?.addEventListener('click',async()=>{
      try{status=await bridge.ai('disconnect');clearChat();if(el.isConnected)settings();}
      catch(e){el.querySelector('.form-error').textContent=e.message;}
    });
  }
  function chat() {
    let busy=false;
    const provider=AI_PROVIDERS[status.provider];
    const showComposer=!status.managed || (status.signedIn && status.configured);
    const el=planDrawer('Plan with Munka',`<p class="ai-intro">What would you like to get done?</p><p>Describe a task or break a goal into up to ${status.maxTasks} steps. Review the plan before adding anything.</p>
      ${status.managed?`<div class="ai-allowance"><div class="ai-allowance-heading"><strong>Munka AI</strong><span class="small muted">No API key needed</span></div><div class="ai-meter-label"><label class="small muted" for="ai-allowance-meter">AI allowance remaining</label><span id="ai-allowance-percent" class="small muted">${status.remaining===null?'—':percent()+'%'}</span></div><progress id="ai-allowance-meter" max="100" value="${percent()}" class="${status.remaining===null?'is-unavailable':''}" aria-valuetext="${status.remaining===null?'Allowance unavailable':percent()+' percent remaining'}"></progress><p class="ai-usage" aria-live="polite">${esc(usage())}</p></div>
        ${status.notice?`<p class="ai-notice" role="status">${esc(status.notice)}</p>`:''}
        <div class="ai-starters">${showComposer?'<button type="button" data-ai-prompt="Help me create a task. Ask me what it is and when it is due.">Create a task</button><button type="button" data-ai-prompt="Help me break a goal into a small plan. Ask me about the goal and deadline.">Plan my work</button>':''}<button type="button" id="ai-due">What’s due?</button></div><p class="small muted">Checking saved deadlines is free and works offline.</p>`:''}
      <div class="ai-conversation" role="log" aria-label="Planning conversation">${messages.map(m=>`<div class="ai-message ${m.role==='user'?'is-user':''}"><strong>${m.role==='user'?'You':'Munka AI'}</strong><p>${esc(m.display||m.content)}</p></div>`).join('')}</div>
      ${summary?`<section class="ai-deadlines" aria-label="Saved deadlines"><h3>${esc({today:'Due today',week:'Next seven days + overdue',overdue:'Overdue work',upcoming:'All upcoming + overdue'}[summary.window])}</h3>
        <p class="small muted">From your saved Munka tasks${course?' in the selected course':''}. Completed and archived work is excluded.</p>
        ${summary.items.length?`<ol class="ai-plan-summary">${summary.items.map(t=>`<li><strong>${esc(t.title)}</strong><span>${t.overdue?'Overdue · ':''}${esc(t.date)} · ${esc(t.time||'No time set')}${t.course?' · '+esc(t.course):''}</span></li>`).join('')}</ol>`:'<p>No saved deadlines in this view.</p>'}
        ${summary.total>summary.items.length?`<p>Showing ${summary.items.length} of ${summary.total}. See the calendar for the full list.</p>`:''}
        ${summary.undated?`<p class="small muted">${summary.undated} open task${summary.undated===1?' has':'s have'} no due date.</p>`:''}</section>`:''}
      ${proposal?.tasks.length?`<div class="ai-proposal"><ol class="ai-plan-summary">${proposal.tasks.map(t=>`<li><strong>${esc(t.title)}</strong><span class="small muted">${esc(t.date||'No deadline')}${t.time?' · '+esc(t.time):''}</span></li>`).join('')}</ol><button type="button" id="ai-review">Review ${proposal.tasks.length} task${proposal.tasks.length===1?'':'s'}</button></div>`:''}
      ${select(showComposer?'Share a course (optional)':'Course (optional)','course',course,[['',showComposer?'No course shared':'All courses'],...getState().courses.map(c=>[c.id,c.name])])}
      <fieldset class="ai-compose" ${showComposer?'':'hidden disabled'} aria-label="Describe your plan">
      <label class="field"><span>${messages.length?'Your reply or changes':'Describe your plan'}</span><textarea name="message" required maxlength="6000" rows="3" placeholder="Plan three study sessions for my biology exam next Friday.">${esc(pendingText)}</textarea></label>
      <label class="checkline ai-consent"><input name="consent" type="checkbox" ${consent?'checked':''} required>${status.managed?'Send this conversation, selected course name, and local date/time zone to OpenAI through Munka’s AI service.':provider.name==='Ollama (local)'?'Keep this conversation on this PC and send it only to your local Ollama service.':'Send this conversation, selected course name, and local date/time zone to '+esc(provider.name)+'.'}</label>
      ${status.provider==='gemini'?'<p class="small muted">Google may use free-tier content to improve its products.</p>':''}
      <p class="small muted">Other planner records are not sent. Chat clears when closed. ${status.managed?'Sent attempts count, including failed or cancelled requests.':`<span class="ai-usage">${esc(usage())}</span>`}</p>
      </fieldset>
      ${status.used>=status.limit?'<p class="ai-notice" role="status">Your allowance is used up. You can still review your plan, add its tasks, and check saved deadlines.</p>':''}
      <p id="ai-status" role="status"></p>
      <div class="drawer-footer">${status.managed?'':'<button type="button" id="ai-settings">AI settings</button>'}${messages.length?'<button type="button" id="ai-new">New plan</button>':''}<button type="button" id="ai-cancel" hidden>Cancel request</button><button class="primary" id="ai-send" ${showComposer?'':'hidden'} ${canSend()?'':'disabled'}>Send</button></div>`,async form=>{
        if(!canSend())throw Error('AI is unavailable or your daily allowance is used up. You can still check saved deadlines.');
        const text=form.get('message').trim();if(!text)throw Error('Describe the task or goal you want to plan.');
        pendingText=text;course=form.get('course');consent=form.get('consent')==='on';busy=true;proposal=null;proposalId=null;summary=null;
        el.querySelector('.ai-proposal')?.remove();el.querySelector('.ai-deadlines')?.remove();
        const controls=[...el.querySelectorAll('input,textarea,select,button')].filter(b=>!['close-drawer','ai-cancel'].includes(b.id));
        controls.forEach(b=>b.disabled=true);el.querySelector('#ai-cancel').hidden=false;el.querySelector('#ai-status').textContent='Preparing a plan for your review…';
        try{
          const result=await bridge.ai('propose',{messages:[...messages.map(({role,content})=>({role,content})),{role:'user',content:text}],course,consent});
          if(!el.isConnected)return;
          proposal=result.proposal;proposalId=result.proposalId;summary=result.summary||null;
          const response={...proposal,tasks:proposal.tasks.map(({course,...t})=>t)};
          messages.push({role:'user',content:text},{role:'assistant',content:JSON.stringify(response),display:proposal.decision==='deadlines'?'Here are the matching deadlines from your saved Munka tasks.':proposalMessage(proposal)});
          pendingText='';busy=false;status=await bridge.ai('status');if(el.isConnected)chat();
        }finally{
          busy=false;if(el.isConnected){
            try{status=await bridge.ai('status');updateUsage(el);}catch{/* Preserve the request error. */}
            controls.forEach(b=>b.disabled=false);el.querySelector('#ai-send').disabled=!canSend();el.querySelector('#ai-cancel').hidden=true;el.querySelector('#ai-status').textContent='Nothing was added to your planner.';
          }
        }
      });
    el.classList.add('ai-drawer');
    el.addEventListener('munka-drawer-close',()=>{if(busy)bridge.ai('cancel').catch(()=>{});},{once:true});
    el.querySelector('#ai-cancel').onclick=()=>bridge.ai('cancel').catch(e=>{el.querySelector('.form-error').textContent=e.message;});
    el.querySelector('#ai-settings')?.addEventListener('click',()=>{pendingText=el.querySelector('[name=message]').value;settings();});
    el.querySelectorAll('[data-ai-prompt]').forEach(button=>button.onclick=()=>{el.querySelector('[name=message]').value=button.dataset.aiPrompt;el.querySelector('[name=message]').focus();});
    el.querySelector('#ai-due')?.addEventListener('click',async()=>{try{pendingText=el.querySelector('[name=message]').value;course=el.querySelector('[name=course]').value;consent=el.querySelector('[name=consent]').checked;summary=await bridge.ai('deadlines',{course});if(el.isConnected)chat();}catch(e){el.querySelector('.form-error').textContent=e.message;}});
    el.querySelector('#ai-new')?.addEventListener('click',async()=>{await bridge.ai('cancel');clearChat();chat();});
    el.querySelector('#ai-review')?.addEventListener('click',review);
    el.querySelector('.ai-conversation').scrollTop=el.querySelector('.ai-conversation').scrollHeight;
    const result=el.querySelector('.ai-deadlines') || el.querySelector('.ai-proposal');
    if(status.managed && result){
      result.tabIndex=-1;result.focus({preventScroll:true});
      const body=el.querySelector('.ai-body');body.scrollTop=result.getBoundingClientRect().top-body.getBoundingClientRect().top+body.scrollTop;
    }else if(status.managed){
      el.querySelector('#ai-due').focus({preventScroll:true});el.querySelector('.ai-body').scrollTop=0;
    }else el.querySelector('[name=message]').focus();
  }
  function review() {
    let committed=false;
    const courseName=getState().courses.find(c=>c.id===proposal.tasks[0]?.course)?.name;
    const el=planDrawer('Review your plan',`<p>Check dates and edit the steps. Deselect anything you do not want to add.</p><p class="small muted">${courseName?'Course: '+esc(courseName):'No course selected'} · New tasks only. Automations will not run.</p>
      ${proposal.tasks.map((t,i)=>`<fieldset class="ai-review-task" data-task="${i}"><legend>Task ${i+1}</legend>
        <label class="checkline"><input type="checkbox" name="include-${i}" checked>Include this task</label>
        ${field('Task title','title-'+i,t.title,'text','required maxlength="200"')}
        <div class="form-grid">${field('Due date','date-'+i,t.date,'date')}${field('Due time','time-'+i,t.time,'time')}</div>
        ${select('Task type','kind-'+i,t.kind,['Task','Assignment','Exam','Personal'])}
        <label class="field"><span>Notes</span><textarea name="notes-${i}" maxlength="2000" rows="2">${esc(t.notes)}</textarea></label></fieldset>`).join('')}
      <div class="drawer-footer"><button type="button" id="ai-revise">Back to plan</button><button class="primary" id="ai-add">Add selected tasks</button></div>`,async form=>{
        if(committed)return;
        const tasks=proposal.tasks.flatMap((_,i)=>form.get('include-'+i)==='on'?[Object.fromEntries(['title','date','time','kind','notes'].map(k=>[k,form.get(k+'-'+i)]))]:[]);
        if(!tasks.length)throw Error('Select at least one task to add.');
        const result=await bridge.ai('approve',{proposalId,tasks,confirmed:true});
        committed=true;closeDrawer();await refresh();toast(`Added ${result.count} task${result.count===1?'':'s'} to your planner.`);
      });
    el.classList.add('ai-drawer');
    const updateSelection=()=>{
      let count=0;el.querySelectorAll('.ai-review-task').forEach(box=>{
        const checked=box.querySelector('input[type=checkbox]').checked;if(checked)count++;
        box.querySelectorAll('input:not([type=checkbox]),select,textarea').forEach(input=>input.disabled=!checked);
      });
      el.querySelector('#ai-add').textContent=`Add ${count} task${count===1?'':'s'}`;el.querySelector('#ai-add').disabled=count===0;
    };
    el.querySelectorAll('input[type=checkbox]').forEach(input=>input.onchange=updateSelection);updateSelection();el.querySelector('#ai-revise').onclick=chat;
  }
  return {open};
}
