
import { icon } from './icons.mjs';
window.paint = async data => {
  const bg = document.querySelector('#background');
  bg.src = 'data:'+data.mime+';base64,'+data.background;
  await bg.decode();
  document.body.dataset.design = data.design;
  document.body.dataset.ink = data.ink === 'light' ? 'light' : 'dark';
  const panels = document.querySelector('#panels');
  panels.replaceChildren();
  panels.style.left = data.position === 'left' ? '4vw' : 'auto';
  panels.style.right = data.position === 'left' ? 'auto' : '4vw';
  function text(tag, value, parent, cls) { const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;parent.append(el);return el; }
  function rows(tasks, panel) {
    if (!tasks.length) text('p','No tasks to show.',panel);
    for (const task of tasks) {
      const row=document.createElement('article');row.className=[task.done?'done':'',task.urgent?'urgent':''].filter(Boolean).join(' ');
      const mark=text('span','',row,'mark');
      if(task.done) mark.innerHTML=icon('check');
      text('span',task.title,row,'title');text('small',task.done?'Done':task.date || 'Anytime',row);panel.append(row);
    }
  }
  const daily=document.createElement('section');daily.className='panel';
  const header=document.createElement('header');const logo=document.createElement('img');logo.src='data:image/png;base64,'+data.logo;logo.alt='';header.append(logo);text('span','Munka',header);daily.append(header);
  text('h1','Tasks and reminders',daily);text('p',data.day,daily);rows(data.tasks,daily);panels.append(daily);
  if(data.projects.length){const p=document.createElement('section');p.className='panel project';text('h1','Projects',p);for(const project of data.projects){text('h2',project.name,p);rows(project.tasks,p)}panels.append(p)}
  await logo.decode();
  const scale=Math.min(1,(innerHeight*.90)/panels.scrollHeight);
  panels.style.transformOrigin=data.position==='left'?'top left':'top right';panels.style.transform='scale('+scale+')';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
