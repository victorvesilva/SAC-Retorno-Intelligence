/* Layout only: existing handlers, report sources and authorization remain authoritative. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function element(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
function group(title,id){const box=element('section',null,'sri-clarity-group');box.id=id;box.append(element('h4',title));return box;}
function wallet(){
 const root=$('sri-pack-carteira');if(!root||root.dataset.clarity)return;
 root.dataset.clarity='1';
 const state=$('sri-p03-wallet-state');state.className='sri-clarity-state';state.append($('sri-p03-state').closest('label'));
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
  chip.onclick=()=>{if(input.multiple)for(const o of input.options)o.selected=false;else input.value=['sri-pack-filter','sri-pack-status-filter','sri-p03-state'].includes(input.id)?'all':'';input.dispatchEvent(new Event(input.type==='search'?'input':'change',{bubbles:true}));};wrap.append(chip);
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
function reportCatalog(){
 const root=$('reports');if(!root||$('sri-clarity-report-catalog'))return;
 const nav=element('nav',null,'sri-clarity-report-catalog');nav.id='sri-clarity-report-catalog';nav.setAttribute('aria-label','Tipos de relatório');nav.append(element('h3','Escolha a consulta'));
 const items=[['sri-p03-integrated-reports','Resultados por período','Indicadores, metas e detalhamento histórico.'],['v55-generate','Relatórios especializados em PDF','Documentos da extração e modelos de apresentação.'],['sri-p03-productivity','Carga e produtividade','Carga atribuída e participação por operador.'],['sri-movement-panel','Histórico de movimentações','Trilha das ações, responsáveis e justificativas.'],['v20-catalog','Consultas da base operacional','Distribuição atual, apurações e exportações por dia.']];
 for(const [target,label,description]of items){const link=element('a',label);link.href='#'+target;link.append(element('small',description));link.onclick=e=>{const destination=$(target);if(!destination)return;e.preventDefault();if(target==='v20-catalog')window.switchTab?.(target);destination.scrollIntoView({behavior:'smooth',block:'start'});const heading=destination.querySelector('h2,h3')||destination;heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});};nav.append(link);}
 root.prepend(nav);
}
function install(){
 wallet();reportCatalog();
 for(const id of ['sri-monitor-panel','sri-movement-panel','sri-p03-productivity','sri-p03-integrated-reports'])resultActions($(id));
 const catalog=$('v20-catalog-body');if(catalog)resultActions(catalog.querySelector('.v20-panel'));
 for(const b of document.querySelectorAll('.v54-clear-trigger'))if(b.textContent.trim()!=='Limpar filtros de todas as áreas'){b.textContent='Limpar filtros de todas as áreas';b.title='Remove os filtros globais de todas as áreas do sistema';}
 const notice=$('notice-upload'),duplicate=document.querySelector('[data-v114-tab="import"]');
 if(notice&&duplicate)duplicate.hidden=notice.getClientRects().length>0;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
// Modules are mounted after authentication and rebuilt when the account changes.
setInterval(install,1000);
})();
