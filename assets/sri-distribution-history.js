/* Historical assignment correction. Never loads a historical extraction over the active one. */
(()=>{'use strict';
if(window.__sriDistributionHistory)return;window.__sriDistributionHistory=true;
let owner='',panel=null,generation=0,checking=false,subscription=false;
const node=(tag,text,parent)=>{const e=document.createElement(tag);if(text)e.textContent=text;parent?.append(e);return e;};
function clear(){generation++;owner='';panel?.remove();panel=null;}
async function identity(){const client=await window.sriGetSupabaseClient?.();if(!client)return null;const {data}=await client.auth.getUser();if(!data?.user)return null;const result=await client.from('profiles').select('id,role').eq('id',data.user.id).single();if(result.error||!['admin','manager'].includes(result.data?.role))return null;return {client,id:data.user.id};}
function mount(root){
 panel=node('section',null,root);panel.id='sri-distribution-history';panel.className='v20-panel';
 node('h3','Consultar e remover atribuições de outra extração',panel);
 node('p','Selecione a data, o período e a rodada para conferir os responsáveis. A remoção afeta somente a extração escolhida, exige justificativa e preserva protocolos e históricos. Protocolos com tratativa ou conclusão e dias/turnos fechados ficam protegidos.',panel);
 const controls=node('div',null,panel);controls.className='sri-pack-controls';
 function field(label,type='text'){const l=node('label',label,controls);l.className='v20-field';const e=node(type==='select'?'select':'input',null,l);if(type!=='select')e.type=type;return e;}
 function option(select,value,label){const e=node('option',label,select);e.value=value;}
 const day=field('Data da extração','date');day.id='sri-dist-history-day';day.value=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 const period=field('Período','select');period.id='sri-dist-history-period';option(period,'','Todos');
 const snapshots=field('Extração / rodada','select');snapshots.id='sri-dist-history-snapshot';option(snapshots,'','Consulte a data');
 function button(parent,text,fn){const b=node('button',text,parent);b.type='button';b.className='v20-button secondary';b.onclick=fn;return b;}
 const find=button(controls,'Buscar extrações',()=>void loadSnapshots());
 const consult=button(controls,'Consultar atribuições',()=>void loadRows());consult.disabled=true;
 const filterRow=node('div',null,panel);filterRow.className='sri-pack-controls';
 const label=node('label','Buscar protocolo ou responsável',filterRow);label.className='v20-field';const search=node('input',null,label);search.type='search';search.id='sri-dist-history-search';
 const status=node('p','Informe a data e busque as extrações.',panel);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const tableWrap=node('div',null,panel);tableWrap.className='sri-dist-history-table';tableWrap.style.overflow='auto';tableWrap.style.maxHeight='60vh';
 const pagination=node('div',null,panel);pagination.className='sri-pack-controls';
 const prev=button(pagination,'Página anterior',()=>{page--;render();}),next=button(pagination,'Próxima página',()=>{page++;render();});
 const count=node('span',null,pagination);
 const actions=node('div',null,panel);actions.className='sri-dist-history-actions';
 const reasonLabel=node('label','Justificativa da remoção (10 a 1500 caracteres)',actions);reasonLabel.className='v20-field';
 const reason=node('textarea',null,reasonLabel);reason.maxLength=1500;reason.rows=3;reason.id='sri-dist-history-reason';
 const selection=node('p','Nenhuma atribuição selecionada.',actions);
 const reset=button(actions,'Limpar seleção',()=>{selected.clear();render();});
 const remove=button(actions,'Remover atribuições selecionadas',()=>void unassign());remove.classList.add('sri-dist-history-remove');remove.disabled=true;
 let items=[],rows=[],context=null,selected=new Set(),page=0,request=0,busy=false;
 const alive=(epoch,seq)=>epoch===generation&&seq===request&&panel?.isConnected;
 function message(text){status.textContent=text;}
 function invalidate(){request++;rows=[];context=null;selected.clear();page=0;render();}
 function selectionState(){selection.textContent=selected.size+' atribuição(ões) selecionada(s).';remove.disabled=busy||!context||!selected.size||reason.value.trim().length<10;reset.disabled=busy||!selected.size;}
 function render(){
  tableWrap.replaceChildren();const query=search.value.trim().toLocaleLowerCase('pt-BR'),list=rows.filter(r=>!query||(r.protocol+' '+r.operator+' '+r.profile).toLocaleLowerCase('pt-BR').includes(query));
  const pages=Math.max(1,Math.ceil(list.length/50));page=Math.max(0,Math.min(page,pages-1));prev.disabled=busy||page===0;next.disabled=busy||page===pages-1;
  count.textContent=list.length+' atribuições · página '+(page+1)+'/'+pages;
  if(list.length){const table=node('table',null,tableWrap);table.className='v20-table';const header=table.createTHead().insertRow();
   for(const title of ['Selecionar','Protocolo','Responsável','Perfil','Carteira publicada','Tratativa / proteção']){const th=node('th',title,header);th.scope='col';}
   for(const r of list.slice(page*50,page*50+50)){const body=table.tBodies[0]||table.createTBody();const line=body.insertRow();const td=line.insertCell();
    const check=node('input',null,td);check.type='checkbox';check.checked=selected.has(r.protocol);check.disabled=busy||!r.can_remove;check.setAttribute('aria-label','Selecionar protocolo '+r.protocol);
    check.onchange=()=>{if(check.checked){if(selected.size>=500){check.checked=false;message('Limite de 500 protocolos por remoção.');return;}selected.add(r.protocol);}else selected.delete(r.protocol);selectionState();};
    for(const value of [r.protocol,r.operator,r.profile,r.active?'Ativa':'Inativa / não publicada',r.can_remove?'Sem tratativa: pode remover':r.has_treatment||r.work_status==='completed_in_tool'?'Com tratativa/conclusão: preservado':'Sem atribuição removível'])node('td',String(value||'—'),line);
   }
  }else node('p',context?'Nenhuma atribuição para esta seleção.':'Consulte uma extração para exibir as atribuições.',tableWrap);
  selectionState();
 }
 function lock(value){busy=value;for(const e of [day,period,snapshots,find,consult,search,reason])e.disabled=value;consult.disabled=value||!snapshots.value;render();}
 async function call(name,args){const auth=await identity();if(!auth||auth.id!==owner)throw Error('Sua sessão mudou. Entre novamente para consultar.');const result=await auth.client.rpc(name,args);if(result.error)throw Error(result.error.message||'Não foi possível concluir a operação.');return result.data;}
 function chooseSnapshots(){invalidate();snapshots.replaceChildren();option(snapshots,'','Selecione a extração');
  for(const item of items.filter(s=>!period.value||s.shift===period.value)){option(snapshots,item.id,item.shift+' · rodada '+item.reference+' · registrada '+new Date(item.registered_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · '+item.team+' · '+item.id.slice(0,8));}
  consult.disabled=!snapshots.value;message(items.length?'Escolha a extração e consulte as atribuições.':'Nenhuma extração com distribuição salva para esta data.');
 }
 async function loadSnapshots(){if(busy)return;invalidate();const epoch=generation,seq=++request;items=[];snapshots.replaceChildren();option(snapshots,'','Consultando…');lock(true);message('Buscando extrações…');
  try{if(!day.value)throw Error('Informe a data da extração.');const data=await call('sri_distribution_history',{p_day:day.value,p_snapshot:null});if(!alive(epoch,seq))return;items=data||[];const old=period.value;period.replaceChildren();option(period,'','Todos');for(const value of [...new Set(items.map(s=>s.shift))])option(period,value,value);period.value=[...period.options].some(o=>o.value===old)?old:'';chooseSnapshots();}
  catch(error){if(epoch===generation&&panel?.isConnected){message(error.message);snapshots.replaceChildren();option(snapshots,'','Consulte novamente');}}
  finally{if(epoch===generation&&panel?.isConnected)lock(false);}
 }
 async function loadRows(){if(busy||!snapshots.value)return;invalidate();const epoch=generation,seq=++request,chosen={day:day.value,snapshot:snapshots.value};lock(true);message('Consultando atribuições…');
  try{const data=await call('sri_distribution_history',{p_day:chosen.day,p_snapshot:chosen.snapshot});if(!alive(epoch,seq))return;rows=data.rows||[];context={...chosen,revision:data.revision};message(rows.length+' atribuições encontradas. Selecione apenas as que deseja remover.');render();}
  catch(error){if(alive(epoch,seq))message(error.message);}finally{if(alive(epoch,seq))lock(false);}
 }
 async function unassign(){if(busy||remove.disabled)return;const saved={...context},protocols=[...selected],justification=reason.value.trim();
  if(!window.confirm('Remover '+protocols.length+' atribuição(ões) da extração selecionada em '+saved.day+'? Protocolos e históricos serão preservados.'))return;
  const epoch=generation,seq=++request;lock(true);message('Removendo atribuições e registrando auditoria…');
  try{const data=await call('sri_distribution_unassign',{p_day:saved.day,p_snapshot:saved.snapshot,p_revision:saved.revision,p_protocols:protocols,p_reason:justification});if(!alive(epoch,seq))return;
   rows=[];context=null;selected.clear();reason.value='';message(data.removed+' atribuição(ões) removida(s). A extração ativa não foi substituída. Consulte novamente para atualizar a lista.');render();
   window.dispatchEvent(new CustomEvent('sri:historical-distribution-changed',{detail:{snapshotId:saved.snapshot}}));
  }catch(error){if(alive(epoch,seq)){context=null;selected.clear();message(error.message+' Consulte novamente antes de tentar outra remoção.');render();}}
  finally{if(alive(epoch,seq))lock(false);}
 }
 day.onchange=()=>{items=[];invalidate();snapshots.replaceChildren();option(snapshots,'','Busque as extrações desta data');consult.disabled=true;message('Data alterada. Busque as extrações novamente.');};period.onchange=chooseSnapshots;
 snapshots.onchange=()=>{invalidate();consult.disabled=!snapshots.value;message('Extração alterada. Consulte as atribuições.');};search.oninput=()=>{page=0;render();};reason.oninput=selectionState;render();
}
async function install(){if(checking)return;checking=true;const epoch=generation;try{const auth=await identity();if(epoch!==generation)return;if(!auth){if(owner)clear();return;}if(auth.id!==owner){clear();owner=auth.id;}if(!panel&&document.getElementById('distribution'))mount(document.getElementById('distribution'));
 if(!subscription){auth.client.auth.onAuthStateChange(event=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)){clear();setTimeout(install,0);}});subscription=true;}
}catch(_){if(owner)clear();}finally{checking=false;}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else void install();setInterval(install,5000);
})();
