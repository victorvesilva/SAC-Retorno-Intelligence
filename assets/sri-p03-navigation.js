/* MEL-EXTRA-004 — navegação interna; não usa histórico do navegador. */
(()=>{'use strict';
 let stack=[],goingBack=false,profile='',current=null;
 const states=new Map();
 const $=id=>document.getElementById(id);
 const active=()=>{
  const base=document.querySelector('.tab-content.active')?.id;
  if(base==='v20-mine'){
   const view=document.body.dataset.sriOperatorView;
   return view==='history'?'v20-mine-history':view==='pending'?'v20-operator-pending':base;
  }
  const pane=document.querySelector('.tab-content.active [data-v49-pane].active,.tab-content.active [data-v46-pane].active');
  return pane?base+'|'+(pane.dataset.v49Pane||pane.dataset.v46Pane):base||null;
 };
 function remember(){
  if(!current)return;
  const filters=[...document.querySelectorAll('.tab-content.active input[type=search],.tab-content.active input[type=date],.tab-content.active select')].filter(el=>el.id&&!el.closest('form'));
  states.set(current,{y:window.scrollY,filters:filters.map(el=>({id:el.id,values:el.multiple?[...el.selectedOptions].map(option=>option.value):el.value}))});
 }
 function restore(id){
  const saved=states.get(id);if(!saved)return;
  for(const {id:field,values}of saved.filters){
   const el=$(field);if(!el)continue;
   if(el.multiple)for(const option of el.options)option.selected=Array.isArray(values)&&values.includes(option.value);
   else el.value=values;
   el.dispatchEvent(new Event(el.type==='search'?'input':'change',{bubbles:true}));
  }
  requestAnimationFrame(()=>window.scrollTo({top:saved.y,behavior:'auto'}));
 }
 function canLeave(){
  const unsaved=document.querySelector('.tab-content.active form[data-sri-p03-dirty="true"],#sri33-treatment:not([hidden])[data-sri-p03-dirty="true"]');
  return !unsaved||window.confirm('Existem alterações não salvas. Deseja sair desta tela?');
 }

 const loggedOut=()=>document.body.classList.contains('v20-not-logged');
 const authKey=()=>document.body.getAttribute('data-v20-role')||document.body.getAttribute('data-role')||'';
 const btn=document.createElement('button');btn.type='button';btn.id='sri-p03-back';
 btn.textContent='← Voltar';btn.className='v20-button secondary';btn.disabled=true;
 btn.setAttribute('aria-label','Voltar à última categoria visitada');
 function restoreFocus(){if(btn.isConnected)return;const mount=$('v5-active-context')?.parentElement||document.querySelector('.v5-topbar')||document.querySelector('.topbar')||document.querySelector('main');mount?.append(btn);}
 function clear(){stack=[];states.clear();current=null;goingBack=false;btn.disabled=true;}
 function observe(){if(loggedOut()){clear();profile='';return;}
  const role=authKey();if(profile&&role&&role!==profile)clear();if(role)profile=role;
  const id=active();if(!id||id===current)return;
  if(current&&!goingBack)stack.push({id:current});
  current=id;goingBack=false;btn.disabled=!stack.length;
 }
 function route(target){const [id,pane]=target.split('|');const selectors=['[data-v20-go]','[data-v5-tab]','[data-tab]'];
  for(const sel of selectors){const node=[...document.querySelectorAll(sel)].find(el=>(el.dataset.v20Go||el.dataset.v5Tab||el.dataset.tab)===id&&!el.disabled);if(node){node.click();if(pane){const sub=[...document.querySelectorAll('[data-v49-pane],[data-v46-pane]')].find(el=>(el.dataset.v49Pane||el.dataset.v46Pane)===pane&&!el.disabled);sub?.click();}return active()===target;}}
  return false;
 }
 btn.addEventListener('click',()=>{if(!stack.length)return;
  if(!canLeave())return;
  remember();
  const entry=stack.pop();goingBack=true;
  if(!route(entry.id)){stack.push(entry);goingBack=false;btn.disabled=false;return;}
  current=entry.id;goingBack=false;btn.disabled=!stack.length;
  restore(entry.id);
 });
 document.addEventListener('click',e=>{
  if(e.target.closest?.('#sri-p03-back'))return;
  const link=e.target.closest?.('[data-v20-go],[data-v5-tab],[data-tab],[data-v49-pane],[data-v46-pane],[data-v20-rail-tab],[data-v20-rail-group]');
  if(!link||goingBack)return;
  if(!canLeave()){e.preventDefault();e.stopImmediatePropagation();return;}
  remember();
 },true);
 document.addEventListener('input',e=>{const f=e.target.closest?.('form,#sri33-treatment');if(f&&(f.closest('.tab-content.active')||f.id==='sri33-treatment'))f.dataset.sriP03Dirty='true';},true);
 document.addEventListener('reset',e=>{const f=e.target.closest?.('form');if(f)delete f.dataset.sriP03Dirty;},true);
 const prior=window.sriPackLogout;
 window.sriPackLogout=(...args)=>{clear();profile='';return typeof prior==='function'?prior(...args):undefined;};
 function boot(){restoreFocus();current=active();const obs=new MutationObserver(()=>{restoreFocus();observe()});obs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','data-v20-role','data-role','data-sri-operator-view']});observe();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
