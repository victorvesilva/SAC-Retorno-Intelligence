/* Central de tratativas e conciliação — dados autorizados pelo banco. */
(function(){
'use strict';
const $=id=>document.getElementById(id),h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mutationVersion=0,epoch=0,busy=false,refreshQueued=false,map=new Map(),scope='',actor=null,actorRole=null,client=null,reviewRows=[],reviewBusy=false,editBusy=false,request=null;
const roles=['admin','manager','supervisor'];
window.sriCloudTreatment=(id)=>{const snapshot=window.sriGetSavedDistributionContext?.()?.snapshotId;return snapshot&&scope===snapshot?map.get(String(id)):undefined};
window.sriCloudTreatmentReset=()=>{epoch++;refreshQueued=false;map.clear();scope='';actor=null;actorRole=null;client=null;request=null;reviewRows=[];$('sri-reconcile-panel')?.remove();$('sri-reconcile-overview')?.remove();$('sri-cloud-treatment-toolbar')?.remove();$('sri-treatment-details')?.remove();};
async function auth(){const c=await window.sriGetSupabaseClient?.();if(!c)return null;const {data,error}=await c.auth.getUser();if(error||!data?.user)return null;const p=await c.from('profiles').select('role').eq('id',data.user.id).single();if(p.error||!roles.includes(p.data?.role))return null;return {client:c,id:data.user.id,role:p.data.role}}
window.sriTreatmentDetailsCell=id=>{
 const task=window.sriCloudTreatment(id);if(!task)return '—';
 if(!task.is_special&&(!task.treatment_status||task.treatment_status==='SEM STATUS'))return 'Sem tratativa';
 return '<button type="button" class="v20-button secondary sri-treatment-details-button" data-sri-treatment-details="'+h(id)+'">'+(task.is_special?'<span class="sri-special-badge">Caso sensível</span>':'Ver observação')+'</button>';
};
let detailsRequest=0;
async function showDetails(protocol,background=false){
 const task=window.sriCloudTreatment(protocol);if(!task)return;
 const token=epoch,version=++detailsRequest,snapshot=scope;
 let dialog=$('sri-treatment-details');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='sri-treatment-details';dialog.className='sri-treatment-details';
  dialog.setAttribute('aria-labelledby','sri-treatment-details-title');
  dialog.innerHTML='<header><h2 id="sri-treatment-details-title"></h2><button type="button" class="v20-button secondary">Fechar</button></header><div class="sri-treatment-details-content" role="status" aria-live="polite"></div>';
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{detailsRequest++;dialog.querySelector('.sri-treatment-details-content').replaceChildren();});
  document.body.append(dialog);
 }
 dialog.dataset.protocol=String(protocol);
 dialog.querySelector('h2').textContent='Tratativa · '+protocol;
 const content=dialog.querySelector('.sri-treatment-details-content');if(!background)content.textContent='Consultando a última tratativa...';
 if(!dialog.open)dialog.showModal();
 const current=()=>version===detailsRequest&&token===epoch&&scope===snapshot&&dialog.isConnected&&dialog.open;
 try{
  const session=await auth();if(!current())return;
  if(!session||session.id!==actor)throw Error('Sessão indisponível.');
  const {data,error}=await session.client.rpc('sri_protocol_treatment_details',{p_task:task.id});
  if(!current())return;
  if(error||!data)throw Error('Tratativa indisponível.');
  content.replaceChildren();
  function line(text,className){const el=document.createElement('p');el.textContent=text;if(className)el.className=className;content.append(el);}
  line(data.is_special?'Protocolo especial · caso sensível':'Sinalização especial desmarcada',data.is_special?'sri-special-badge':'v20-muted');
  if(data.recorded_at){
   line('Última tratativa por '+(data.actor_name||'autor não registrado'));
   line(new Date(data.recorded_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),'v20-muted');
  }
  const heading=document.createElement('h3');heading.textContent='Observação';content.append(heading);
  line(data.notes||'Nenhuma observação registrada.','sri-treatment-note');
 }catch(error){if(current())content.textContent='Não foi possível consultar a tratativa. Atualize e tente novamente.';}
}
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-sri-treatment-details]');
 if(button)void showDetails(button.dataset.sriTreatmentDetails);
});
async function refresh(){
 if(document.hidden||!actor||!client)return;
 if(busy||editBusy){refreshQueued=true;return;}
 const snapshot=window.sriGetSavedDistributionContext?.()?.snapshotId;if(!snapshot)return;
 const token=epoch,version=mutationVersion,queryClient=client;busy=true;
 const button=$('sri-cloud-treatment-refresh');if(button){button.disabled=true;button.textContent='Atualizando...';}
 const current=()=>token===epoch&&version===mutationVersion&&snapshot===window.sriGetSavedDistributionContext?.()?.snapshotId;
 try{
  const rows=[];
  for(let from=0;;from+=500){
   const q=await queryClient.from('daily_operator_tasks').select('id,protocol_number,treatment_status,updated_at,operator_user_id,source_status,is_special').eq('snapshot_id',snapshot).eq('active',true).order('id').range(from,from+499);
   if(!current()){refreshQueued=Boolean(actor);return;}
   if(q.error)throw Error(q.error.message);
   rows.push(...(q.data||[]));if((q.data||[]).length<500)break;
   if(from>=19500)throw Error('Volume acima do limite de sincronização');
  }
  if(editBusy){refreshQueued=true;return;}
  const next=new Map(rows.map(r=>[String(r.protocol_number),r]));
  const changed=scope!==snapshot||JSON.stringify([...map])!==JSON.stringify([...next]);
  const dialog=$('sri-treatment-details'),protocol=dialog?.open?dialog.dataset.protocol:null;
  const detailsChanged=protocol&&JSON.stringify(map.get(protocol))!==JSON.stringify(next.get(protocol));
  map=next;scope=snapshot;
  if(changed)window.sriRefreshStatusViews?.();
  if(detailsChanged){if(next.has(protocol))void showDetails(protocol,true);else dialog.close();}
  const info=$('sri-cloud-treatment-info');if(info)info.textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · atualização automática a cada 15 s';
 }catch(e){
  if(current()){const info=$('sri-cloud-treatment-info');if(info)info.textContent='Não foi possível atualizar. Os dados podem estar desatualizados. Tente novamente.';}
 }finally{
  busy=false;
  const activeButton=$('sri-cloud-treatment-refresh');if(activeButton){activeButton.disabled=false;activeButton.textContent='Atualizar protocolos';}
  if(refreshQueued&&!editBusy){refreshQueued=false;void refresh();}
 }
}
window.sriCloudTreatmentRefresh=refresh;
window.sriCloudTreatmentInit=async()=>{
 const token=epoch;const a=await auth();if(token!==epoch||!a)return;actor=a.id;actorRole=a.role;client=a.client;
 const root=$('dist-pane-protocols');
 if(root&&!$('sri-cloud-treatment-toolbar')){
  root.insertAdjacentHTML('afterbegin','<div id="sri-cloud-treatment-toolbar"><p id="sri-cloud-treatment-info" class="v20-muted" role="status">Aguardando a distribuição publicada.</p><button type="button" class="v20-button secondary" id="sri-cloud-treatment-refresh">Atualizar protocolos</button></div>');
  $('sri-cloud-treatment-refresh').onclick=()=>{void refresh();};
 }
 await refresh();void counts();if($('sri-reconcile-panel')){void loadReview();if(['admin','manager'].includes(actorRole))void matrix()}
};
window.sriCloudTreatmentSave=async(id,status,notes)=>{if(editBusy)throw Error('Aguarde o salvamento atual.');if(!client||!actor)throw Error('Entre novamente para registrar a tratativa.');const r=window.sriCloudTreatment(id);if(!r)throw Error('A carteira precisa estar publicada e disponível à sua equipe.');const key=JSON.stringify([r.id,status,notes,r.updated_at]);if(!request||request.key!==key)request={key,id:crypto.randomUUID()};editBusy=true;mutationVersion++;const token=epoch;
 try{const {data,error}=await client.rpc('sri_record_treatment_v2',{p_task:r.id,p_action:status,p_notes:notes,p_expected:r.updated_at,p_request:request.id});if(error){if(/atualizada em outra sessão|demanda indisponível/i.test(error.message||'')){request=null;throw Error('A tratativa mudou em outra sessão. Feche o modal e confira o status atualizado antes de confirmar novamente.')}throw Error(error.message)}if(token!==epoch)return;map.set(String(id),{...r,...data});mutationVersion++;request=null;window.sriRefreshStatusViews?.();return data;}finally{editBusy=false;void refresh()}
};
const decisionLabels={base:'Validar a origem',manual:'Manter tratativa',both:'Ambas válidas',return:'Solicitar revisão'};
function panel(){const root=$('v20-alerts');if(!root||$('sri-reconcile-panel'))return;root.insertAdjacentHTML('beforeend','<section class="v20-panel" id="sri-reconcile-panel"><h3>Central de Conciliação de Status</h3><p class="v20-muted">Mudanças na base com tratativa registrada são sinais para análise, não erros confirmados. O status do SIGO e o registro operacional permanecem separados.</p><div class="sri-pack-controls"><label class="v20-field">Data<input type="date" id="sri-reconcile-day"></label><label class="v20-field">Situação<select id="sri-reconcile-filter"><option value="pending">Pendentes</option><option value="done">Analisadas</option><option value="all">Todas</option></select></label><label class="v20-field">Buscar<input id="sri-reconcile-search" type="search" placeholder="Protocolo, operador, base ou área"></label><button class="v20-button secondary" id="sri-reconcile-refresh">Atualizar</button><button class="v20-button secondary" id="sri-reconcile-retry">Reprocessar presença da apuração</button></div><p role="status" id="sri-reconcile-msg"></p><div id="sri-reconcile-table" style="overflow:auto"></div><div id="sri-reconcile-review"></div><div id="sri-reconcile-matrix"></div></section>');$('sri-reconcile-day').value=window.sriOperationalContext?.().day||'';$('sri-reconcile-refresh').onclick=loadReview;$('sri-reconcile-retry').onclick=async()=>{const b=$('sri-reconcile-retry');b.disabled=true;try{await window.sriRetryPresence?.();await loadReview()}catch(e){window.sriToast?.(window.sriFriendly?.(e.message,'error')||e.message,'error')}finally{b.disabled=false}};if(['admin','manager'].includes(actorRole))void matrix();$('sri-reconcile-day').onchange=loadReview;$('sri-reconcile-filter').onchange=drawReview;$('sri-reconcile-search').oninput=drawReview;$('sri-reconcile-table').onclick=e=>{const b=e.target.closest('[data-review]');if(b)review(b.dataset.review)};}
function drawReview(){const box=$('sri-reconcile-table');if(!box)return;const filter=$('sri-reconcile-filter').value,q=$('sri-reconcile-search').value.toLowerCase();const done=r=>Boolean(r.decision&&r.decision!=='return');const rows=reviewRows.filter(r=>(filter==='all'||(filter==='done')===done(r))&&[r.protocol_number,r.operator_name,r.team_name,r.base_name,r.area_name].join(' ').toLowerCase().includes(q));$('sri-reconcile-msg').textContent=reviewRows.filter(r=>!done(r)).length+' pendente(s) · '+reviewRows.filter(done).length+' analisada(s)';box.innerHTML='<table class="v20-table"><thead><tr><th>Protocolo / Base / Área</th><th>Operador / equipe</th><th>Origem anterior</th><th>Nova origem</th><th>Tratativa</th><th>Decisão</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+h(r.protocol_number)+'</b><br><small>'+h(r.base_name||'—')+' · '+h(r.area_name||'—')+'</small></td><td>'+h(r.operator_name||'—')+'<br><small>'+h(r.team_name||'Sem equipe')+'</small></td><td>'+h(r.previous_source)+'</td><td>'+h(r.current_source)+'</td><td>'+h(r.manual_status)+'</td><td>'+(r.decision?h(decisionLabels[r.decision])+'<br><small>'+h(r.reviewer_name||'')+' · '+h(r.justification||'')+'</small>'+(r.return_requested_at?'<br><small>'+h(r.review_response?'Resposta: '+r.review_response:'Aguardando retorno do operador')+'</small>':'')+(r.decision==='return'&&r.review_responded_at?'<br><button type="button" class="v20-button secondary" data-review="'+h(r.id)+'">Concluir análise</button>':''):'<button type="button" class="v20-button secondary" data-review="'+h(r.id)+'">Analisar</button>')+'</td></tr>').join('')+'</tbody></table>'+(rows.length?'':'<p>Nenhum registro neste filtro.</p>')}
async function loadReview(){panel();if(reviewBusy||!client||!actor||!$('sri-reconcile-day'))return;const token=epoch,day=$('sri-reconcile-day').value;reviewBusy=true;$('sri-reconcile-msg').textContent='Consultando divergências...';try{const r=await client.rpc('sri_list_reconciliation',{p_day:day});if(r.error)throw Error(r.error.message);if(token!==epoch||day!==$('sri-reconcile-day')?.value)return;reviewRows=r.data||[];drawReview()}catch(e){if($('sri-reconcile-msg'))$('sri-reconcile-msg').textContent=window.sriFriendly?.(e.message,'error')||e.message}finally{reviewBusy=false}}
function review(id){const r=reviewRows.find(x=>String(x.id)===String(id));if(!r||(r.decision&&!(r.decision==='return'&&r.review_responded_at)))return;const root=$('sri-reconcile-review');root.innerHTML='<form class="v20-panel"><h4>Revisar '+h(r.protocol_number)+'</h4><p>Origem: '+h(r.previous_source)+' → '+h(r.current_source)+' · Tratativa: '+h(r.manual_status)+'</p>'+(r.review_response?'<p>Resposta do operador: '+h(r.review_response)+'</p>':'')+'<label class="v20-field">Decisão<select required id="sri-review-decision">'+Object.entries(decisionLabels).filter(([v])=>!r.review_responded_at||v!=='return').map(([v,l])=>'<option value="'+h(v)+'">'+h(l)+'</option>').join('')+'</select></label><label class="v20-field">Justificativa<textarea required maxlength="1500" id="sri-review-just"></textarea></label><button class="v20-button" type="submit">Confirmar análise</button><button class="v20-button secondary" type="button" id="sri-review-cancel">Cancelar</button></form>';$('sri-review-cancel').onclick=()=>root.textContent='';root.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]'),just=$('sri-review-just').value.trim();if(!just||b.disabled)return;b.disabled=true;try{const z=await client.rpc('sri_decide_reconciliation',{p_id:r.id,p_decision:$('sri-review-decision').value,p_justification:just});if(z.error)throw Error(z.error.message);root.textContent='';await loadReview();void counts()}catch(err){window.sriToast?.(window.sriFriendly?.(err.message,'error')||err.message,'error')}finally{b.disabled=false}}}
window.sriCloudReconciliationOpen=()=>{panel();void loadReview()};window.sriCloudReconciliationRefresh=()=>{if($('sri-reconcile-panel'))void loadReview();void counts()};

const treatments=['E-MAIL','LIGAÇÃO','ASCSAC','RECUSOU','ACEITOU','ASSOCIADO','OUTROS','FILIAL','DÚVIDA','OUVIDORIA','PENDENTE','MÍDIAS NE','CARTA AR'];
async function matrix(){const root=$('sri-reconcile-matrix');if(!root||!client||!['admin','manager'].includes(actorRole))return;const token=epoch;const r=await client.rpc('sri_list_status_compatibility');if(token!==epoch||!root.isConnected)return;if(r.error){root.textContent='Matriz indisponível até a atualização do banco.';return}
root.innerHTML='<details class="v20-panel"><summary>Matriz de compatibilidade (gestão)</summary><p class="v20-muted">Cadastre somente equivalências validadas pela operação. Ausência de regra gera revisão, não erro confirmado.</p><form id="sri-matrix-form" class="sri-pack-controls"><label class="v20-field">CD_STATUS de origem<input required maxlength="80" id="sri-matrix-code" placeholder="Código SIGO"></label><label class="v20-field">Tratativa<select id="sri-matrix-treatment">'+treatments.map(s=>'<option>'+h(s)+'</option>').join('')+'</select></label><label class="v20-field">Compatibilidade<select id="sri-matrix-compatible"><option value="true">Compatível</option><option value="false">Requer análise</option></select></label><label class="v20-field">Justificativa<input required maxlength="1500" id="sri-matrix-reason"></label><button class="v20-button" type="submit">Salvar regra</button></form><table class="v20-table"><thead><tr><th>Origem</th><th>Tratativa</th><th>Regra</th><th>Justificativa</th></tr></thead><tbody>'+(r.data||[]).map(x=>'<tr><td>'+h(x.source_status)+'</td><td>'+h(x.treatment_status)+'</td><td>'+h(x.compatible?'Compatível':'Requer análise')+'</td><td>'+h(x.reason)+'</td></tr>').join('')+'</tbody></table></details>';
$('sri-matrix-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');if(b.disabled)return;b.disabled=true;try{const z=await client.rpc('sri_set_status_compatibility',{p_source:$('sri-matrix-code').value,p_treatment:$('sri-matrix-treatment').value,p_compatible:$('sri-matrix-compatible').value==='true',p_reason:$('sri-matrix-reason').value});if(z.error)throw Error(z.error.message);await matrix();root.querySelector('details').open=true;}catch(e){window.sriToast?.(window.sriFriendly?.(e.message,'error')||e.message,'error')}finally{b.disabled=false}}}

let countBusy=false;
async function counts(){if(countBusy||!client||!actor||document.hidden)return;const root=$('overview');if(!root)return;let el=$('sri-reconcile-overview');if(!el){root.insertAdjacentHTML('afterbegin','<section id="sri-reconcile-overview" class="v20-panel" style="margin-bottom:12px"><h3>Conciliação de status</h3><p id="sri-reconcile-counts" role="status">Consultando pendências...</p><button type="button" class="v20-button secondary" data-v20-go="v20-alerts">Abrir Central de Conciliação</button></section>');el=$('sri-reconcile-overview')}const day=window.sriOperationalContext?.().day;if(!day)return;const token=epoch;countBusy=true;try{const r=await client.rpc('sri_reconciliation_counts',{p_day:day});if(token!==epoch)return;if(r.error)throw Error(r.error.message);const x=r.data||{};$('sri-reconcile-counts').textContent=(x.pending||0)+' pendente(s) · '+(x.waiting_operator||0)+' aguardando operador · '+(x.awaiting_supervisor||0)+' aguardando decisão final · '+(x.resolved||0)+' concluída(s)';}catch(e){if(token===epoch&&$('sri-reconcile-counts'))$('sri-reconcile-counts').textContent='Não foi possível consultar os indicadores agora.'}finally{countBusy=false}}

let opEpoch=0,opBusy=false,opClient=null,opId=null,opRows=[],opEditing=false;
window.sriOperatorReviewReset=()=>{opEpoch++;opClient=null;opId=null;opRows=[];opEditing=false;const box=$('sri-operator-reviews');if(box)box.hidden=true;const list=$('sri-operator-review-list');if(list)list.textContent='';};
window.sriOperatorReviewRefresh=async(c,id)=>{if(c&&id){opClient=c;opId=id}if(!opClient||!opId||opBusy||opEditing||document.hidden)return;const root=$('sri-operator-reviews'),list=$('sri-operator-review-list');if(!root||!list)return;opBusy=true;const token=opEpoch;try{const r=await opClient.rpc('sri_my_reviews');if(r.error)throw Error(r.error.message);if(token!==opEpoch)return;opRows=r.data||[];root.hidden=!opRows.length;list.innerHTML=opRows.map(x=>'<article style="border:1px solid #dce5f0;border-radius:10px;padding:12px;margin:8px 0"><b>'+h(x.protocol_number)+'</b> · '+h(x.base_name||'—')+' · '+h(x.area_name||'—')+'<p>Origem: '+h(x.previous_source)+' → '+h(x.current_source)+' · Tratativa: '+h(x.manual_status)+'</p><p>Solicitação: '+h(x.justification)+'</p><button class="v20-button secondary" data-review-response="'+h(x.id)+'">Responder revisão</button></article>').join('');list.onclick=e=>{const b=e.target.closest('[data-review-response]');if(!b||opEditing)return;const row=opRows.find(x=>String(x.id)===b.dataset.reviewResponse);if(!row)return;opEditing=true;const form=document.createElement('form');form.className='v20-panel';form.innerHTML='<label class="v20-field">Resposta à supervisão<textarea required maxlength="1500" placeholder="Informe o resultado da conferência"></textarea></label><button class="v20-button" type="submit">Enviar resposta</button> <button class="v20-button secondary" type="button">Cancelar</button>';b.after(form);form.querySelector('[type=button]').onclick=()=>{form.remove();opEditing=false};form.onsubmit=async e=>{e.preventDefault();const save=form.querySelector('[type=submit]'),response=form.querySelector('textarea').value.trim();if(!response||save.disabled)return;save.disabled=true;try{const z=await opClient.rpc('sri_answer_review',{p_id:row.id,p_response:response});if(z.error)throw Error(z.error.message);if(token!==opEpoch)return;opEditing=false;form.remove();window.sriToast?.('Resposta enviada à supervisão.','success');await window.sriOperatorReviewRefresh()}catch(err){window.sriToast?.(window.sriFriendly?.(err.message,'error')||err.message,'error')}finally{save.disabled=false}};form.querySelector('textarea').focus()};}catch(e){if(token===opEpoch&&opRows.length){root.hidden=false;window.sriToast?.('Não foi possível consultar novas revisões.','warning')}}finally{opBusy=false}};
setInterval(()=>{if(opId)void window.sriOperatorReviewRefresh()},30000);

setInterval(()=>{if(actor){void refresh();void counts();if($('v20-alerts')?.classList.contains('active')&&!$('sri-reconcile-review')?.querySelector('form'))void loadReview()}},15000);
window.addEventListener('focus',()=>{if(actor)void refresh()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actor)void refresh()});
window.addEventListener('sri-cloud-saved',()=>{if(actor)void refresh()});
})();
