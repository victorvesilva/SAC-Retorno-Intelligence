/* SRI 2.0: navegação móvel acessível para todos os perfis autorizados. */
(function(){
  'use strict';
  function init(){
    const app=document.querySelector('.app.v5-app');
    const sidebar=app?.querySelector('.sidebar');
    if(!app||!sidebar||document.getElementById('sri-mobile-toggle'))return;
    const toggle=document.createElement('button');
    toggle.type='button';toggle.id='sri-mobile-toggle';toggle.textContent='☰';
    toggle.setAttribute('aria-label','Abrir menu de navegação');
    toggle.setAttribute('aria-controls','sri-mobile-sidebar');
    toggle.setAttribute('aria-expanded','false');
    sidebar.id='sri-mobile-sidebar';
    const backdrop=document.createElement('div');backdrop.id='sri-mobile-backdrop';
    backdrop.setAttribute('aria-hidden','true');
    document.body.append(backdrop,toggle);
    const mobile=window.matchMedia('(max-width:760px)');
    let lastFocus=null;
    function isOpen(){return document.body.classList.contains('sri-mobile-nav-open')}
    function setOpen(open){
      const should=Boolean(open&&mobile.matches&&!document.body.classList.contains('v20-not-logged'));
      if(should&&!isOpen())lastFocus=document.activeElement;
      document.body.classList.toggle('sri-mobile-nav-open',should);
      toggle.textContent=should?'×':'☰';
      toggle.setAttribute('aria-label',should?'Fechar menu de navegação':'Abrir menu de navegação');
      toggle.setAttribute('aria-expanded',String(should));
      sidebar.inert=mobile.matches&&!should;
      if(should){const first=sidebar.querySelector('.v20-nav-group-title, .v20-nav-entry, .nav-link, .v5-rail-link');first?.focus({preventScroll:true})}
      else if(lastFocus?.isConnected&&mobile.matches&&lastFocus!==document.activeElement){lastFocus.focus({preventScroll:true})}
      if(!should)lastFocus=null;
    }
    toggle.addEventListener('click',()=>setOpen(!isOpen()));
    backdrop.addEventListener('click',()=>setOpen(false));
    sidebar.addEventListener('click',e=>{
      if(!mobile.matches)return;
      if(e.target.closest('[data-tab],[data-v20-go],[data-v20-rail-tab],[data-v5-tab]')){
        setOpen(false);
      }
    });
    document.addEventListener('keydown',e=>{
      if(!isOpen())return;
      if(e.key==='Escape'){e.preventDefault();setOpen(false)}
      if(e.key==='Tab'){
        const nodes=[...sidebar.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects().length&&!x.closest('[hidden]'));
        if(!nodes.length)return;
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    },true);
    if(typeof mobile.addEventListener==='function')mobile.addEventListener('change',()=>setOpen(false));
    else mobile.addListener(()=>setOpen(false));
    const observer=new MutationObserver(()=>{
      if(document.body.classList.contains('v20-not-logged')&&isOpen())setOpen(false);
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    sidebar.inert=mobile.matches;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();