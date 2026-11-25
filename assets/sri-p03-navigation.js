/* MEL-EXTRA-004 — navegação interna; não usa histórico do navegador. */
(()=>{'use strict';
 let stack=[],goingBack=false,profile='',current=null;
 const $=id=>document.getElementById(id);
 const active=()=>document.querySelector('.tab-content.active')?.id||null;
 const loggedOut=()=>document.body.classList.contains('v20-not-logged');
 const authKey=()=>document.body.getAttribute('data-v20-role')||document.body.getAttribute('data-role')||'';
 const btn=document.createElement('button');btn.type='button';btn.id='sri-p03-back';
 btn.textContent='← Voltar';btn.className='v20-button secondary';btn.disabled=true;
 btn.setAttribute('aria-label','Voltar à última categoria visitada');
 function restoreFocus(){if(btn.isConnected)return;const mount=$('v5-active-context')?.parentElement||document.querySelector('.v5-topbar')||document.querySelector('.topbar')||document.querySelector('main');mount?.append(btn);}
 function clear(){stack=[];current=null;goingBack=false;btn.disabled=true;}
 function observe(){if(loggedOut()){clear();profile='';return;}
  const role=authKey();if(profile&&role&&role!==profile)clear();if(role)profile=role;
  const id=active();if(!id||id===current)return;
  if(current&&!goingBack)stack.push({id:current,y:window.scrollY});
  current=id;goingBack=false;btn.disabled=!stack.length;
 }
 function route(id){const selectors=['[data-v20-go]','[data-v5-tab]','[data-tab]'];
  for(const sel of selectors){const node=[...document.querySelectorAll(sel)].find(el=>(el.dataset.v20Go||el.dataset.v5Tab||el.dataset.tab)===id&&!el.disabled);if(node){node.click();return true;}}
  return false;
 }
 btn.addEventListener('click',()=>{if(!stack.length)return;
  const unsaved=document.querySelector('.tab-content.active form[data-sri-p03-dirty="true"]');
  if(unsaved&&!window.confirm('Existem alterações não salvas. Deseja voltar e mantê-las para revisão?'))return;
  const entry=stack.pop();goingBack=true;
  if(!route(entry.id)){stack.push(entry);goingBack=false;btn.disabled=false;return;}
  current=entry.id;goingBack=false;btn.disabled=!stack.length;
  requestAnimationFrame(()=>window.scrollTo({top:entry.y,behavior:'auto'}));
 });
 document.addEventListener('input',e=>{const f=e.target.closest?.('form');if(f&&f.closest('.tab-content.active'))f.dataset.sriP03Dirty='true';},true);
 document.addEventListener('submit',e=>{const f=e.target.closest?.('form');if(f)delete f.dataset.sriP03Dirty;},true);
 const prior=window.sriPackLogout;
 window.sriPackLogout=(...args)=>{clear();profile='';return typeof prior==='function'?prior(...args):undefined;};
 function boot(){restoreFocus();current=active();const obs=new MutationObserver(()=>{restoreFocus();observe()});obs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','data-v20-role','data-role']});observe();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
