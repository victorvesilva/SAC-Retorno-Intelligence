/* Layout only: existing handlers, report sources and authorization remain authoritative. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function element(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
function group(title,id){const box=element('details',null,'sri-clarity-group');box.id=id;box.append(element('summary',title));return box;}
function wallet(){
 const root=$('sri-pack-carteira');if(!root||root.dataset.clarity)return;
 root.dataset.clarity='1';
 const state=$('sri-p03-wallet-state');state.className='sri-clarity-state';state.append($('sri-p03-state').closest('label'));root.prepend(state);
 const basic=$('sri-pack-search').closest('.sri-pack-controls');basic.classList.add('sri-clarity-basic');
 const caption=element('h4','Buscar e filtrar');basic.before(caption);
 const shortcuts=$('sri-p03-shortcuts');shortcuts.setAttribute('aria-label','Atalhos combinados com os filtros selecionados');shortcuts.prepend(element('span','Atalhos:'));
 const display=group('Exibição da tabela','sri-clarity-display'),row=element('div',null,'sri-pack-controls');display.append(row);
 for(const id of ['sri-p03-density','sri-p03-sort'])row.append($(id).closest('label'));
 const preferences=$('sri-p03-preferences');if(preferences){preferences.querySelector('summary').textContent='Filtros favoritos';const columns=$('sri-p03-columns');if(columns)display.append(columns);}
 const paging=$('sri-p03-size').closest('.sri-pack-controls');paging.classList.add('sri-clarity-pagination');paging.setAttribute('aria-label','Paginação da carteira');
 const table=$('sri33-task-table');table.before(display);table.after(paging);
 const chips=element('div',null,'sri-clarity-chips');chips.id='sri-clarity-active';chips.setAttribute('aria-label','Filtros ativos');basic.after(chips);
 const panel=$('sri33-mine');panel.classList.add('sri-clarity-wallet');
 // Keep the cloud header as the single title and refresh action; legacy fallback retains its own.
 const outer=$('v20-mine')?.querySelector(':scope > .v20-between');if(outer)outer.classList.add('sri-clarity-legacy-header');
 const header=panel.querySelector(':scope > .v20-between');
 if(header){header.id='sri-wallet-header';header.classList.add('sri-module-header');$('v20-mine').prepend(header);}
 const summary=$('sri-pack-summary');
 display.before(summary);
 if(preferences)summary.before(preferences);
 refreshFilters();
}
function refreshFilters(){
 const wrap=$('sri-clarity-active');if(!wrap)return;wrap.replaceChildren();
 const controls=document.querySelectorAll('#sri-pack-carteira input[id],#sri-pack-carteira select');
 for(const input of controls){
  if(input.closest('#sri-p03-preferences,#sri-clarity-display,.sri-clarity-pagination'))continue;
  const values=input.multiple?[...input.selectedOptions].filter(o=>o.value).map(o=>o.textContent):input.value&&!['all',''].includes(input.value)?[input.tagName==='SELECT'?input.selectedOptions[0]?.textContent:input.value]:[];
  if(!values.length)continue;
  const label=input.closest('label')?.firstChild?.textContent.trim()||'Filtro';
  const chip=element('button',label+': '+values.join(', ')+' ×','v20-button secondary');chip.type='button';chip.setAttribute('aria-label','Remover filtro '+label);
  chip.onclick=()=>{if(input.multiple)for(const o of input.options)o.selected=false;else input.value=['sri-pack-filter','sri-pack-status-filter','sri-p03-state'].includes(input.id)?'all':'';if(input.type==='search')input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};wrap.append(chip);
 }
 for(const active of document.querySelectorAll('#sri-p03-shortcuts [aria-pressed="true"]')){const chip=element('button','Atalho: '+active.textContent+' ×','v20-button secondary');chip.type='button';chip.onclick=()=>active.click();wrap.append(chip);}
 if(!wrap.children.length)wrap.append(element('span','Nenhum filtro aplicado.'));
}
window.sriRefreshWalletFilters=refreshFilters;
function resultActions(root){
 if(!root)return;
 const candidates=[...root.querySelectorAll('button')].filter(b=>!b.closest('.sri-clarity-exports')&&/^(Exportar|Gerar PDF|Copiar diagnóstico)/.test(b.textContent.trim()));
 if(!candidates.length)return;
 let actions=root.querySelector(':scope > .sri-clarity-results');
 if(!actions){actions=element('div',null,'sri-clarity-results');root.append(actions);}
 let exports=actions.querySelector('details');if(!exports){exports=element('details',null,'sri-clarity-exports');exports.append(element('summary','Exportar resultados'));actions.append(exports);}
 for(const b of candidates)exports.append(b);
 for(const b of [...root.querySelectorAll('button')].filter(b=>!b.closest('.sri-clarity-results')&&/^(Anterior|Próxima|Carregar mais|Modo apresentação)$/.test(b.textContent.trim())))actions.prepend(b);
}
function togglePanel(panel,hidden){
 if(panel&&panel.classList.contains('sri-layout-panel-hidden')!==hidden)panel.classList.toggle('sri-layout-panel-hidden',hidden);
}
function tabs(root,id,label,items,selected,choose){
 let nav=$(id);
 if(!nav){
  nav=element('nav',null,'sri-layout-tabs');nav.id=id;
  nav.setAttribute('aria-label',label);nav.setAttribute('role','tablist');
  root.querySelector(':scope > .sri-module-header')?.after(nav);
  if(!nav.isConnected)root.prepend(nav);
  for(const [key,text]of items){
   const button=element('button',text,'v20-button secondary');button.type='button';button.dataset.layoutView=key;button.id=id+'-'+key;
   button.setAttribute('role','tab');button.onclick=()=>choose(key);nav.append(button);
  }
  nav.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   const buttons=[...nav.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
   if(index<0)return;
   event.preventDefault();
   const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
   buttons[next].focus();buttons[next].click();
  });
 }
 for(const [key,,panel]of items){
  const button=nav.querySelector('[data-layout-view="'+key+'"]'),active=key===selected;
  button.disabled=!panel;button.tabIndex=active?0:-1;button.setAttribute('aria-selected',String(active));
  if(panel){
   button.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
   togglePanel(panel,!active);
  }else button.removeAttribute('aria-controls');
 }
 return nav;
}
function reportCatalog(){
 const root=$('reports');if(!root)return;
 if(!root.classList.contains('sri-organized-reports'))root.classList.add('sri-organized-reports');
 const pdf=root.querySelector(':scope > .v55-shell');if(pdf)pdf.id='sri-layout-pdf';
 const items=[['period','Resultados por período',$('sri-p03-integrated-reports')],['pdf','Relatórios em PDF',pdf],['productivity','Carga e produtividade',$('sri-p03-productivity')],['movements','Movimentações',$('sri-movement-panel')]];
 const selected=root.dataset.layoutView||'period';
 const available=items.some(([key,,panel])=>key===selected&&panel)?selected:'pdf';
 const nav=tabs(root,'sri-report-tabs','Consultas e relatórios',items,available,key=>{root.dataset.layoutView=key;reportCatalog()});
 if(!root.querySelector('[data-layout-catalog]')){
  const link=element('button','Consultas e exportações','v20-button secondary');link.type='button';
  link.onclick=()=>window.switchTab?.('v20-catalog');nav.after(link);link.classList.add('sri-layout-catalog-link');
  // This is a separate destination, outside the tablist.
  link.dataset.layoutCatalog='';
 }
}
window.sriShowReportSection=key=>{const root=$('reports');if(root){root.dataset.layoutView=key;reportCatalog();}};
function headers(){
 for(const section of document.querySelectorAll('.tab-content')){
  let header=section.querySelector(':scope > .go-head,:scope > .section-heading,:scope > .v49-main-head,:scope > .v55-header,:scope > .v20-between:not(.sri-clarity-legacy-header),:scope > .sri-module-header:not(.sri-clarity-legacy-header)');
  if(!header){
   const heading=section.querySelector(':scope > h2');
   if(heading){
    header=element('div',null,'sri-module-header');heading.before(header);
    const eyebrow=header.previousElementSibling;if(eyebrow?.classList.contains('eyebrow'))header.append(eyebrow);
    const description=heading.nextElementSibling;header.append(heading);
    if(description?.tagName==='P')header.append(description);
   }
  }
  if(!header)continue;
  header.classList.add('sri-module-header');
  if(section.firstElementChild!==header)section.prepend(header);
  const nav=section.querySelector(':scope > .sri-layout-tabs,:scope > .v46-subtabs,:scope > .v49-tabs')||section.querySelector(':scope > .v20-module-tabs');
  if(nav&&header.nextElementSibling!==nav)header.after(nav);
 }
 const operatorHeader=$('sri-wallet-header');
 if(operatorHeader){
  const mode=document.body.dataset.sriOperatorView||'active';
  const title=mode==='history'?'Meu Histórico':mode==='pending'?'Pendências anteriores':'Minha Carteira';
  const heading=operatorHeader.querySelector('h3');if(heading&&heading.textContent!==title)heading.textContent=title;
  const refresh=$('sri33-mine-refresh');if(refresh)refresh.hidden=mode!=='active';
 }
 const overview=$('overview')?.querySelector(':scope > .sri-module-header'),upload=$('hero-actions');
 if(overview&&upload){
  let actions=$('sri-overview-actions');
  if(!actions){actions=element('div',null,'sri-layout-header-actions');actions.id='sri-overview-actions';overview.append(actions);}
  const previous=$('v55-prior-day-shortcut');
  if(previous&&previous.parentElement!==actions)actions.prepend(previous);
  if(upload.parentElement!==actions)actions.append(upload);
 }
 const active=document.querySelector('.tab-content.active'),controls=$('global-controls');
 if(active&&controls&&['overview','priorities','intelligence','agents','details'].includes(active.id)){
  const anchor=active.querySelector(':scope > .v46-subtabs,:scope > .v49-tabs,:scope > .v20-module-tabs')||active.querySelector(':scope > .sri-module-header');
  if(anchor&&anchor.nextElementSibling!==controls)anchor.after(controls);
 }
}
function qualityNavigation(){
 const root=$('details'),alerts=$('v20-alerts');if(!root||!alerts)return;
 if(!root.classList.contains('sri-organized-quality'))root.classList.add('sri-organized-quality');
 if(!alerts.classList.contains('sri-organized-quality'))alerts.classList.add('sri-organized-quality');
 const nav=root.querySelector('.v46-subtabs');
 if(nav&&!$('sri-quality-alerts-link')){
  const link=element('button','Conciliação e alertas','v46-subtab');link.id='sri-quality-alerts-link';link.type='button';
  // Existing data panes keep their handlers. Alerts uses its authorized route.
  link.onclick=()=>window.switchTab?.('v20-alerts');nav.append(link);
 }
 if(!$('sri-quality-return')){
  const menu=element('nav',null,'sri-layout-tabs');menu.id='sri-quality-return';menu.setAttribute('aria-label','Base e qualidade');
  for(const [pane,label]of [['records','Base apurada'],['quality','Qualidade dos dados'],['reconcile','Conciliação de dados']]){
   const button=element('button',label,'v20-button secondary');button.type='button';
   button.onclick=()=>{window.switchTab?.('details');window.v46SetPane?.(pane);};menu.append(button);
  }
  const current=element('button','Conciliação e alertas','v20-button secondary');current.type='button';current.setAttribute('aria-current','page');menu.append(current);
  alerts.querySelector(':scope > .sri-module-header')?.after(menu);
 }
 const heading=root.querySelector(':scope > .sri-module-header');
 if(nav&&heading&&heading.nextElementSibling!==nav)heading.after(nav);
}
function distributionLayout(){
 const root=$('distribution'),nav=root?.querySelector('.dist-tabbar');if(!nav)return;
 const header=root.querySelector(':scope > .sri-module-header');if(header&&header.nextElementSibling!==nav)header.after(nav);
 const shortcut=$('v194-from-distribution');
 if(shortcut&&shortcut.parentElement===nav)header.append(shortcut);
 for(const [key,label,target]of [['followup','Acompanhamento','sri33-progress'],['history','Histórico de atribuições','sri-distribution-history']]){
  const content=$(target),existing=nav.querySelector('[data-dist-pane="'+key+'"]');
  if(existing){
   existing.hidden=!content;
   if(!content&&$('dist-pane-'+key)?.classList.contains('active'))window.distPane?.('protocols');
  }
  if(!content)continue;
  let pane=$('dist-pane-'+key);
  if(!pane){
   pane=element('div',null,'dist-pane');pane.id='dist-pane-'+key;root.append(pane);
   const button=element('button',label,'dist-tab');button.type='button';button.dataset.distPane=key;
   button.onclick=()=>window.distPane?.(key);nav.querySelector('[data-dist-pane="exports"]')?.before(button);
  }
  if(content.parentElement!==pane)pane.append(content);
 }
 const filters=$('dist-query')?.closest('.dist-controls'),metrics=root.querySelector(':scope > .dist-kpis');
 if(filters&&metrics&&filters.nextElementSibling!==metrics)filters.after(metrics);
 const exports=nav.querySelector('[data-dist-pane="exports"]');if(exports)exports.textContent='Exportações e backup';
 const active=root.querySelector('.dist-pane.active');
 for(const button of nav.querySelectorAll('[data-dist-pane]'))button.setAttribute('aria-current',String('dist-pane-'+button.dataset.distPane===active?.id));
}
function settingsLayout(){
 const root=$('v20-settings'),monitor=$('sri-monitor-panel'),body=$('v20-settings-body');
 const nav=root?.querySelector(':scope > .v20-row');if(!nav||!body)return;
 nav.classList.add('sri-layout-tabs');nav.setAttribute('aria-label','Configurações');
 let button=$('sri-settings-monitor');
 if(monitor&&!button){
  button=element('button','Monitor operacional','v20-button secondary');button.id='sri-settings-monitor';button.type='button';
  button.onclick=()=>{root.dataset.layoutSettings='monitor';settingsLayout();};nav.append(button);
 }
 if(button)button.hidden=!monitor;
 const active=!!monitor&&root.dataset.layoutSettings==='monitor';
 togglePanel(body,active);togglePanel(monitor,!active);
 if(button)button.setAttribute('aria-current',String(active));
}
function tableActions(){
 for(const [source,table]of [['v3-export-agents','v3-agent-body'],['export-details','details-body']]){
  const button=$(source),body=$(table),card=body?.closest('.v3-card,.card');if(!button||!card)continue;
  let actions=card.querySelector(':scope > .sri-layout-table-actions');
  if(!actions){actions=element('div',null,'sri-layout-table-actions');card.append(actions);}
  if(button.parentElement!==actions)actions.append(button);
 }
 const priorities=$('priorities'),filters=$('v3-risk-search')?.closest('.v3-controls');
 const alerts=$('v3-sla-alerts')?.closest('.v3-card');
 if(priorities&&filters&&alerts&&filters.parentElement!==priorities){alerts.before(filters);filters.classList.add('sri-layout-filters');}
}
function install(){
 wallet();headers();qualityNavigation();distributionLayout();settingsLayout();tableActions();reportCatalog();
 for(const id of ['sri-monitor-panel','sri-movement-panel','sri-p03-productivity','sri-p03-integrated-reports'])resultActions($(id));
 resultActions($('v20-catalog-body'));
 for(const b of document.querySelectorAll('.v54-clear-trigger'))if(b.textContent.trim()!=='Limpar filtros de todas as áreas'){b.textContent='Limpar filtros de todas as áreas';b.title='Remove os filtros globais de todas as áreas do sistema';}
 const notice=$('notice-upload'),duplicate=document.querySelector('[data-v114-tab="import"]');
 if(notice&&duplicate)duplicate.hidden=notice.getClientRects().length>0;
}
let layoutQueued=false;
function scheduleLayout(){
 if(layoutQueued)return;
 layoutQueued=true;
 requestAnimationFrame(()=>{layoutQueued=false;install();});
}
function boot(){
 install();
 const observer=new MutationObserver(scheduleLayout);
 for(const section of document.querySelectorAll('.tab-content'))observer.observe(section,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
document.addEventListener('click',event=>{
 if(event.target.closest?.('#v20-settings [data-v20^="settings"]'))delete $('v20-settings').dataset.layoutSettings;
 scheduleLayout();
});
// Modules are mounted after authentication and rebuilt when the account changes.
setInterval(install,1000);
})();
