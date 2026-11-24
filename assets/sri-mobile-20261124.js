/* SAC Intelligence 2.0 — drawer mobile com todas as categorias acessiveis */
(function(){
 'use strict';
 const app=document.querySelector('.app.v5-app'),trigger=document.getElementById('v5-menu-toggle'),panel=document.querySelector('.v5-app .v5-nav-panel');
 if(!app||!trigger||!panel)return;
 const mq=window.matchMedia('(max-width:760px)');
 panel.id=panel.id||'sri-mobile-full-menu';
 const overlay=document.createElement('button');overlay.type='button';overlay.id='sri-mobile-backdrop';overlay.hidden=true;overlay.setAttribute('aria-label','Fechar o menu');document.body.appendChild(overlay);
 let opener=null;
 function close(focus){app.classList.remove('sri-mobile-open');overlay.hidden=true;document.body.classList.remove('sri-mobile-locked');trigger.setAttribute('aria-expanded','false');if(focus&&opener?.isConnected)opener.focus()}
 function open(){opener=document.activeElement;app.classList.add('sri-mobile-open');overlay.hidden=false;document.body.classList.add('sri-mobile-locked');trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-label','Fechar menu completo');panel.querySelector('.nav-link,.v20-nav-entry,button')?.focus({preventScroll:true})}
 trigger.addEventListener('click',e=>{if(!mq.matches)return;e.preventDefault();e.stopImmediatePropagation();app.classList.contains('sri-mobile-open')?close(true):open()},true);
 overlay.addEventListener('click',()=>close(true));
 panel.addEventListener('click',e=>{if(mq.matches&&!e.target.closest('.v20-nav-group-title')&&e.target.closest('.nav-link,.v20-nav-entry,[data-v20-go],[data-tab]'))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&app.classList.contains('sri-mobile-open')){e.preventDefault();close(true)}});
 const responsive=()=>{if(!mq.matches)close();else if(!app.classList.contains('sri-mobile-open')){trigger.setAttribute('aria-label','Abrir menu completo');trigger.setAttribute('aria-expanded','false')}};
 mq.addEventListener?.('change',responsive);responsive();
})();