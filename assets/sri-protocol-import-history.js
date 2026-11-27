/* Read-only protocol history from authorized, immutable consolidated imports. */
(()=>{'use strict';
const $=id=>document.getElementById(id),zone='America/Sao_Paulo';
let generation=0,dialog,controller,reload;const cache=new Map();
function remember(key,value){cache.set(key,{at:Date.now(),value});if(cache.size>32)cache.delete(cache.keys().next().value);}
function cached(key){const hit=cache.get(key);return hit&&Date.now()-hit.at<60000?hit.value:null;}
function closeView(){generation++;controller?.abort();dialog?.remove();dialog=null;reload=null;}
function node(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;}
function dayOf(date){return new Date(date).toLocaleDateString('sv-SE',{timeZone:zone});}
function monthShift(month,delta){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
function differences(previous,current){
 if(!previous)return 'Primeiro registro disponível neste dia.';
 if(JSON.stringify(previous)===JSON.stringify(current))return 'Sem alteração nos campos exibidos em relação à importação anterior deste dia.';
 const labels={status:'status de origem',statusDesc:'descrição do status',bko:'base',area:'área',agente:'agente',limite:'prazo',envio:'data de envio',filial:'filial'};
 return 'Alteração em '+Object.entries(labels).filter(([key])=>JSON.stringify(previous.map(r=>r[key]))!==JSON.stringify(current.map(r=>r[key]))).map(([,label])=>label).join(', ')+'.';
}
window.sriProtocolImportHistoryReset=()=>{cache.clear();closeView();};
async function open(protocol){
 closeView();const epoch=generation;
 const client=await window.sriGetSupabaseClient?.();if(!client||epoch!==generation)return;
 const auth=await client.auth.getUser();if(epoch!==generation)return;
 const user=auth.data?.user;if(auth.error||!user)throw Error('Entre novamente para consultar o histórico.');
 const profile=await client.from('profiles').select('role').eq('id',user.id).single();if(epoch!==generation)return;
 if(profile.error||!['admin','manager','supervisor','assistant'].includes(profile.data?.role))throw Error('Consulta histórica indisponível para esta conta.');
 if(!window.__sriProtocolHistoryAuthWatch&&client.auth.onAuthStateChange){client.auth.onAuthStateChange(event=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event))window.sriProtocolImportHistoryReset();});window.__sriProtocolHistoryAuthWatch=true;}
 const opener=document.activeElement;dialog=node('dialog');dialog.id='sri-protocol-import-history';dialog.className='sri-import-history';dialog.setAttribute('aria-labelledby','sri-import-history-title');
 const header=node('header',undefined,dialog);node('h2','Histórico de importações',header).id='sri-import-history-title';
 const close=node('button','Fechar',header);close.type='button';close.className='v20-button secondary';close.onclick=()=>dialog.close();
 node('p','Protocolo '+protocol,dialog);node('p','Consulta das importações salvas e autorizadas para sua conta. O calendário usa a data operacional; os horários são de Brasília.',dialog).className='v20-muted';
 const controls=node('nav',undefined,dialog);controls.setAttribute('aria-label','Escolher mês');
 const prev=node('button','‹',controls),title=node('strong','',controls),next=node('button','›',controls);prev.type=next.type='button';prev.setAttribute('aria-label','Mês anterior');next.setAttribute('aria-label','Próximo mês');
 const calendar=node('div',undefined,dialog);calendar.className='sri-import-calendar';
 node('p','● Dia com presença confirmada do protocolo · ? consulta incompleta',dialog).className='v20-muted';
 const status=node('p','',dialog);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const retry=node('button','Tentar novamente',dialog);retry.type='button';retry.className='v20-button secondary';retry.hidden=true;
 const update=node('button','Atualizar histórico',dialog);update.type='button';update.className='v20-button secondary';
 const list=node('section',undefined,dialog);list.setAttribute('aria-label','Importações do dia');
 let month=dayOf(new Date()).slice(0,7),selected=dayOf(new Date()),request=0,records=[],days=[],revision='',unknown=new Set(),loading=false;
 const ownDialog=dialog;document.body.append(dialog);dialog.showModal();
 dialog.addEventListener('close',()=>{if(dialog!==ownDialog)return;closeView();if(opener?.isConnected)opener.focus();});
 const alive=seq=>epoch===generation&&seq===request&&dialog?.open;
 function draw(){
  title.textContent=new Date(month+'-01T12:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
  calendar.replaceChildren();for(const label of ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])node('span',label,calendar);
  const first=new Date(month+'-01T12:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  for(let n=0;n<first.getUTCDay();n++)node('span','',calendar);
  for(let n=1;n<=count;n++){
   const day=month+'-'+String(n).padStart(2,'0'),found=days.some(r=>r.day===day),b=node('button',String(n)+(found?' ●':unknown.has(day)?' ?':''),calendar);b.type='button';b.dataset.day=day;b.setAttribute('aria-label',day+(found?', protocolo presente':unknown.has(day)?', consulta incompleta':', sem registro confirmado'));b.setAttribute('aria-pressed',String(selected===day));if(found)b.classList.add('has-imports');b.onclick=()=>{selected=day;void loadDay();};
  }
  list.replaceChildren();node('h3',selected.split('-').reverse().join('/'),list);
  const dayRows=records.filter(r=>r.day===selected).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  if(!dayRows.length)node('p',loading?'Consultando as importações deste dia…':unknown.has(selected)?'Não foi possível conferir todas as importações deste dia. Tente novamente.':'Nenhuma presença do protocolo encontrada nas importações disponíveis deste dia.',list);
  dayRows.map((r,i)=>({...r,change:unknown.has(selected)?'Comparação indisponível: consulta incompleta neste dia.':differences(dayRows[i-1]?.rows,r.rows)})).reverse().forEach(r=>{
   const details=node('details',undefined,list);details.className='sri-import-event';const summary=node('summary',undefined,details);
   node('strong',new Date(r.at).toLocaleTimeString('pt-BR',{timeZone:zone})+' · '+(r.shift||'Sem turno'),summary);node('span',r.change,summary);
   node('p','SAC + ATIVO · registrada em '+new Date(r.created).toLocaleString('pt-BR',{timeZone:zone}),details);
   for(const row of r.rows){const dl=node('dl',undefined,details);for(const [label,value] of [['Status de origem',[row.status,row.statusDesc].filter(Boolean).join(' · ')],['Base',row.bko],['Área',row.area],['Agente',row.agente],['Prazo da origem',Number.isFinite(row.limite)?new Date(row.limite*86400000).toLocaleDateString('pt-BR',{timeZone:'UTC'}):null],['Filial',row.filial]]){node('dt',label,dl);node('dd',value==null||value===''?'Não registrado':String(value),dl);}}
  });
 }
 async function rpc(name,args,seq,signal){
  const q=await client.rpc(name,args).abortSignal(signal);if(!alive(seq))return null;
  if(q.error)throw Error('Não foi possível consultar o histórico. Tente novamente.');return q.data;
 }
 async function loadDay(force=false){
  controller?.abort();controller=new AbortController();const signal=controller.signal,seq=++request;
  records=[];loading=true;retry.hidden=true;draw();
  status.textContent='Consultando importações de '+selected.split('-').reverse().join('/')+'…';
  try{
   const key=[user.id,protocol,selected,revision].join('|');let result=force?null:cached(key);
   if(!result){result=[];if(days.some(d=>d.day===selected)){
    let cursor=null;for(;;){const batch=await rpc('sri_protocol_import_day',{p_protocol:protocol,p_day:selected,p_after:cursor},seq,signal);if(!alive(seq))return;if(!Array.isArray(batch))throw Error('Histórico indisponível.');result.push(...batch);if(batch.length<200)break;const next=batch.at(-1).id;if(!next||next===cursor)throw Error('A consulta não avançou.');cursor=next;}
   }if(!alive(seq))return;remember(key,result);}
   records=result;loading=false;status.textContent=unknown.has(selected)?'Algumas importações deste dia ainda estão sendo preparadas. Atualize o histórico em instantes.':records.length+' importação(ões) com este protocolo no dia selecionado.';draw();
  }catch(e){if(alive(seq)){loading=false;records=[];retry.hidden=false;status.textContent=e.message;list.replaceChildren();node('p','Histórico indisponível. Tente novamente.',list);}}
 }
 async function load(force=false){
  controller?.abort();controller=new AbortController();const signal=controller.signal,seq=++request;
  records=[];days=[];unknown=new Set();loading=true;retry.hidden=true;status.textContent='Consultando calendário…';draw();
  try{
   const key=[user.id,protocol,month,'calendar'].join('|');let result=force?null:cached(key);
   if(!result){result=await rpc('sri_protocol_import_calendar',{p_protocol:protocol,p_month:month+'-01'},seq,signal);if(!alive(seq))return;if(!result||!Array.isArray(result.days)||!Array.isArray(result.pending_days))throw Error('Calendário indisponível.');remember(key,result);}
   if(!alive(seq))return;days=result.days;revision=result.revision||JSON.stringify(result.days);unknown=new Set(result.pending_days);
   if(!days.some(d=>d.day===selected)&&days.length)selected=days.map(d=>d.day).sort().at(-1);
   draw();await loadDay(force);
  }catch(e){if(alive(seq)){loading=false;retry.hidden=false;status.textContent=e.message;list.replaceChildren();node('p','Calendário indisponível. Tente novamente.',list);}}
 }

 prev.onclick=()=>{month=monthShift(month,-1);selected=month+'-01';void load();};next.onclick=()=>{month=monthShift(month,1);selected=month+'-01';void load();};retry.onclick=()=>void load(true);update.onclick=()=>{cache.clear();void load(true);};reload=()=>{cache.clear();void load(true);};
 void load();
}
window.addEventListener('sri-import-index-ready',()=>{cache.clear();reload?.();});
window.addEventListener('sri-cloud-saved',()=>cache.clear());
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-sri-import-history]');if(button)void open(button.dataset.sriImportHistory).catch(()=>window.sriToast?.('Não foi possível abrir o histórico. Confira sua conexão e tente novamente.','error'));});
})();
