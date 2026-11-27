/* Read-only protocol history from authorized, immutable consolidated imports. */
(()=>{'use strict';
const $=id=>document.getElementById(id),zone='America/Sao_Paulo';
let generation=0,dialog,controller;
function node(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;}
function dayOf(date){return new Date(date).toLocaleDateString('sv-SE',{timeZone:zone});}
function monthShift(month,delta){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
function summarize(payload,protocol){
 if(!Array.isArray(payload?.source))throw Error('Importação sem dados consolidados disponíveis.');
 const fields=['status','statusDesc','bko','area','agente','limite','envio','filial'];
 const rows=payload.source.filter(r=>String(r.id)===protocol).map(r=>Object.fromEntries(fields.map(k=>[k,r[k]??null])));
 return rows.length?[...new Map(rows.map(r=>[JSON.stringify(r),r])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):null;
}
function differences(previous,current){
 if(!previous)return 'Primeiro registro disponível neste dia.';
 if(JSON.stringify(previous)===JSON.stringify(current))return 'Sem alteração nos campos exibidos em relação à importação anterior deste dia.';
 const labels={status:'status de origem',statusDesc:'descrição do status',bko:'base',area:'área',agente:'agente',limite:'prazo',envio:'data de envio',filial:'filial'};
 return 'Alteração em '+Object.entries(labels).filter(([key])=>JSON.stringify(previous.map(r=>r[key]))!==JSON.stringify(current.map(r=>r[key]))).map(([,label])=>label).join(', ')+'.';
}
window.sriProtocolImportHistoryReset=()=>{generation++;controller?.abort();dialog?.remove();dialog=null;};
async function open(protocol){
 window.sriProtocolImportHistoryReset();const epoch=generation;
 const client=await window.sriGetSupabaseClient?.();if(!client||epoch!==generation)return;
 const auth=await client.auth.getUser();if(epoch!==generation)return;
 const user=auth.data?.user;if(auth.error||!user)return;
 const profile=await client.from('profiles').select('role').eq('id',user.id).single();if(epoch!==generation)return;
 if(profile.error||!['admin','manager','supervisor','assistant'].includes(profile.data?.role))return;
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
 const more=node('button','Continuar consulta do mês',dialog);more.type='button';more.className='v20-button secondary';more.hidden=true;
 const list=node('section',undefined,dialog);list.setAttribute('aria-label','Importações do dia');
 let month=dayOf(new Date()).slice(0,7),selected=dayOf(new Date()),request=0,records=[],unknown=new Set(),loading=false;
 document.body.append(dialog);dialog.showModal();
 dialog.addEventListener('close',()=>{window.sriProtocolImportHistoryReset();if(opener?.isConnected)opener.focus();});
 const alive=seq=>epoch===generation&&seq===request&&dialog?.open;
 function draw(){
  title.textContent=new Date(month+'-01T12:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
  calendar.replaceChildren();for(const label of ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])node('span',label,calendar);
  const first=new Date(month+'-01T12:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  for(let n=0;n<first.getUTCDay();n++)node('span','',calendar);
  for(let n=1;n<=count;n++){
   const day=month+'-'+String(n).padStart(2,'0'),found=records.some(r=>r.day===day),b=node('button',String(n)+(found?' ●':unknown.has(day)?' ?':''),calendar);b.type='button';b.dataset.day=day;b.setAttribute('aria-label',day+(found?', protocolo presente':unknown.has(day)?', consulta incompleta':', sem registro confirmado'));b.setAttribute('aria-pressed',String(selected===day));if(found)b.classList.add('has-imports');b.onclick=()=>{selected=day;draw();};
  }
  list.replaceChildren();node('h3',selected.split('-').reverse().join('/'),list);
  const dayRows=records.filter(r=>r.day===selected).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  if(!dayRows.length)node('p',loading?'Consultando os registros deste mês…':unknown.has(selected)?'Não foi possível conferir todas as importações deste dia. Tente novamente.':'Nenhuma presença do protocolo encontrada nas importações disponíveis deste dia.',list);
  dayRows.map((r,i)=>({...r,change:unknown.has(selected)?'Comparação indisponível: consulta incompleta neste dia.':differences(dayRows[i-1]?.rows,r.rows)})).reverse().forEach(r=>{
   const details=node('details',undefined,list);details.className='sri-import-event';const summary=node('summary',undefined,details);
   node('strong',new Date(r.at).toLocaleTimeString('pt-BR',{timeZone:zone})+' · '+(r.shift||'Sem turno'),summary);node('span',r.change,summary);
   node('p','SAC + ATIVO · registrada em '+new Date(r.created).toLocaleString('pt-BR',{timeZone:zone}),details);
   for(const row of r.rows){const dl=node('dl',undefined,details);for(const [label,value] of [['Status de origem',[row.status,row.statusDesc].filter(Boolean).join(' · ')],['Base',row.bko],['Área',row.area],['Agente',row.agente],['Prazo da origem',Number.isFinite(row.limite)?new Date(row.limite*86400000).toLocaleDateString('pt-BR',{timeZone:'UTC'}):null],['Filial',row.filial]]){node('dt',label,dl);node('dd',value==null||value===''?'Não registrado':String(value),dl);}}
  });
 }
 async function load(){
  controller?.abort();controller=new AbortController();const signal=controller.signal,seq=++request;records=[];unknown=new Set();loading=true;retry.hidden=true;more.hidden=true;status.textContent='Buscando importações do mês…';draw();
  try{
   const snapshots=[];
   for(let offset=0;;offset+=200){
    const q=await client.from('daily_result_snapshots').select('id,operational_day,shift_label,created_at').gte('operational_day',month+'-01').lt('operational_day',monthShift(month,1)+'-01').order('created_at').order('id').range(offset,offset+199).abortSignal(signal);
    if(!alive(seq))return;if(q.error)throw Error('Não foi possível consultar as importações.');snapshots.push(...(q.data||[]));if((q.data||[]).length<200)break;
   }
   let done=0;
   for(const snapshot of snapshots){
    if(!alive(seq))return;
    try{
     const q=await client.from('daily_result_snapshots').select('payload_gzip').eq('id',snapshot.id).abortSignal(signal).single();if(!alive(seq))return;if(q.error||!q.data?.payload_gzip)throw Error('Importação indisponível');
     const payload=await v42Uncompress(q.data.payload_gzip);if(!alive(seq))return;
     const rows=summarize(payload,protocol);if(rows)records.push({id:snapshot.id,day:snapshot.operational_day,shift:snapshot.shift_label,at:payload.importedAt||payload.savedAt||snapshot.created_at,created:snapshot.created_at,rows});
    }catch(e){if(!alive(seq))return;unknown.add(snapshot.operational_day);}
    done++;status.textContent='Consultando '+done+' de '+snapshots.length+' importações…';draw();
    if(done%20===0&&done<snapshots.length){
     status.textContent=done+' de '+snapshots.length+' importações consultadas. Continue para completar o calendário do mês.';more.hidden=false;
     await new Promise(resolve=>{const resume=()=>{signal.removeEventListener('abort',resume);resolve();};more.onclick=resume;signal.addEventListener('abort',resume,{once:true});});
     if(!alive(seq))return;more.hidden=true;
    }
   }
   if(!alive(seq))return;loading=false;
   if(!records.some(r=>r.day===selected)&&records.length)selected=records.map(r=>r.day).sort().at(-1);
   status.textContent=unknown.size?'Consulta incompleta em '+unknown.size+' dia(s). Tente novamente para completar o histórico.':records.length+' importação(ões) com este protocolo no mês consultado.';
   retry.hidden=!unknown.size;draw();
  }catch(e){if(alive(seq)){loading=false;status.textContent=e.message;retry.hidden=false;list.replaceChildren();node('p','Histórico indisponível. Tente novamente.',list);}}
 }
 prev.onclick=()=>{month=monthShift(month,-1);selected=month+'-01';void load();};next.onclick=()=>{month=monthShift(month,1);selected=month+'-01';void load();};retry.onclick=()=>void load();
 void load();
}
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-sri-import-history]');if(button)void open(button.dataset.sriImportHistory);});
})();
