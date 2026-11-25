(()=>{'use strict';
if(window.__sriP03ModuleStarted)return;window.__sriP03ModuleStarted=true;
const version='pacote03-20261124', $=id=>document.getElementById(id);
let client,profile,userId,epoch=0,seen=new Map(),timer;
async function identity(){const c=await window.sriGetSupabaseClient?.();if(!c)return null;const {data}=await c.auth.getUser();if(!data?.user)return null;const {data:p,error}=await c.from('profiles').select('id,role').eq('id',data.user.id).single();if(error||!p)return null;return {c,p};}
function log(severity,code,module){if(!client||!profile)return;const c=client,key=severity+code+module,now=Date.now();if(now-(seen.get(key)||0)<2000)return;seen.set(key,now);Promise.resolve(c.rpc('sri_monitor_write',{p_severity:severity,p_code:code,p_module:module,p_version:version})).catch(()=>{});}
window.addEventListener('error',()=>log('ERROR','JS_ERROR','Interface'));window.addEventListener('unhandledrejection',()=>log('ERROR','PROMISE_ERROR','Interface'));
window.sriMonitorEvent=log;
function cell(row,value){const td=document.createElement('td');td.textContent=value==null?'—':String(value);row.append(td);}
function field(parent,label,type='text'){const wrap=document.createElement('label');wrap.className='v20-field';wrap.textContent=label;const el=document.createElement('input');el.type=type;wrap.append(el);parent.append(wrap);return el;}
function button(parent,label,fn){const b=document.createElement('button');b.type='button';b.className='v20-button secondary';b.textContent=label;b.onclick=fn;parent.append(b);return b;}
function exportP03Report(title,cols,rows,period,format){
 const matrix=[cols.map(([,label])=>label),...rows.map(row=>cols.map(([key])=>row[key]??''))];
 if(format==='xlsx'){
  v195MakeXlsx([['RELATORIO',matrix],['CONTEXTO',[['Relatório',title],['Período',period],['Registros carregados',rows.length]]]],'SAC_'+title.replace(/[^a-z0-9]/gi,'_')+'.xlsx');
  return;
 }
 const preview=window.open('','_blank');
 if(!preview)throw Error('Permita abrir a impressão para gerar o PDF.');
 preview.opener=null;
 const doc=preview.document;
 doc.title=title;
 const style=doc.createElement('style');
 style.textContent='@page{size:A4 landscape;margin:12mm}body{font:11px sans-serif;color:#183858}table{width:100%;border-collapse:collapse}th,td{padding:6px;border:1px solid #ccd6e3;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}';
 doc.head.append(style);
 const heading=doc.createElement('h1');heading.textContent=title;doc.body.append(heading);
 const context=doc.createElement('p');context.textContent=period+' · '+rows.length+' registros do recorte carregado';doc.body.append(context);
 const table=doc.createElement('table'),head=table.createTHead().insertRow(),body=table.createTBody();
 for(const label of matrix[0]){const th=doc.createElement('th');th.textContent=label;head.append(th);}
 for(const values of matrix.slice(1)){const row=body.insertRow();for(const value of values){const td=doc.createElement('td');td.textContent=String(value);row.append(td);}}
 doc.body.append(table);preview.focus();preview.print();
}
window.sriP03ExportReport=exportP03Report;
function make(root,id,monitor){if(!root||$(id))return;const section=document.createElement('section');section.id=id;section.className='v20-panel';section.style.margin='16px 0';const h=document.createElement('h3');h.textContent=monitor?'Console de Monitoramento':'Histórico de Movimentações';section.append(h);const controls=document.createElement('div');controls.className='v20-row';controls.style.flexWrap='wrap';section.append(controls);const from=field(controls,'De','date'),to=field(controls,'Até','date');const today=new Date();const start=new Date(today);start.setDate(start.getDate()-6);const civil=d=>d.toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});from.value=civil(start);to.value=civil(today);const search=field(controls,monitor?'Buscar código, módulo ou responsável':'Protocolo ou responsável');let level;if(monitor){level=document.createElement('select');for(const v of ['Todos','INFO','SUCCESS','WARN','ERROR','FATAL']){const o=document.createElement('option');o.value=v;o.textContent=v;level.append(o)}controls.append(level)}
const actorFilter=field(controls,'Responsável'),moduleFilter=monitor?field(controls,'Módulo'):null;
function matches(row){
 const query=search.value.trim().toLowerCase();
 return (!query||cols.some(([key])=>String(row[key]??'').toLowerCase().includes(query)))
 && String(row.responsavel||'').toLowerCase().includes(actorFilter.value.trim().toLowerCase())
 && (!moduleFilter||String(row.module||'').toLowerCase().includes(moduleFilter.value.trim().toLowerCase()));
}
actorFilter.addEventListener('input',render);moduleFilter?.addEventListener('input',render);
const metrics=document.createElement('div');metrics.className='v20-grid';section.append(metrics);const latency=document.createElement('p');latency.setAttribute('role','status');if(monitor)section.append(latency);
const critical=document.createElement('p');critical.setAttribute('role','alert');critical.hidden=true;if(monitor)section.append(critical);
const alerted=new Set();
const status=document.createElement('p');status.setAttribute('role','status');section.append(status);const wrap=document.createElement('div');wrap.style.overflow='auto';wrap.style.maxHeight='500px';const table=document.createElement('table');table.className='v20-table';wrap.append(table);section.append(wrap);let rows=[],cursor=null,request=0,incidents=new Map();const cols=monitor?[['occurred_at','Data/hora'],['severity','Nível'],['module','Módulo'],['code','Código'],['technical_codes','Códigos técnicos'],['responsavel','Responsável'],['version','Versão'],['occurrences','Ocorrências'],['last_at','Última ocorrência']]:[['occurred_at','Data/hora'],['protocol','Protocolo'],['base','Base'],['area','Área'],['action','Movimentação'],['anterior','Anterior'],['novo','Novo'],['responsavel','Responsável'],['perfil','Perfil'],['origin','Origem da ação'],['justificativa','Justificativa']];
function render(){metrics.replaceChildren();table.replaceChildren();const hr=table.createTHead().insertRow();for(const [,label] of cols){const th=document.createElement('th');th.textContent=label;hr.append(th)}if(monitor){const th=document.createElement('th');th.textContent='Incidente';hr.append(th)}const body=table.createTBody(),q=search.value.toLowerCase().trim();const filtered=rows.filter(matches);const cards=monitor?['SUCCESS','INFO','WARN','ERROR','FATAL'].map(k=>[k,filtered.filter(r=>r.severity===k).reduce((n,r)=>n+Number(r.occurrences||1),0)]):[['Movimentações',filtered.length],['Protocolos distintos',new Set(filtered.map(r=>r.protocol).filter(Boolean)).size],['Tipos de ação',new Set(filtered.map(r=>r.action).filter(Boolean)).size]];for(const [label,value] of cards){const card=document.createElement('div');card.className='v20-stat';const l=document.createElement('span');l.textContent=label;const b=document.createElement('b');b.textContent=String(value);card.append(l,b);metrics.append(card);}for(const r of filtered){const tr=body.insertRow();for(const [k] of cols)cell(tr,k.endsWith('_at')&&r[k]?new Date(r[k]).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):r[k]);
 if(monitor){
  const td=document.createElement('td');tr.append(td);
  const details=document.createElement('details'),title=document.createElement('summary');
  title.textContent='Ocorrências';details.append(title);td.append(details);
  const times=document.createElement('div');details.append(times);
  let before=null,loading=false,loaded=false;
  const page=button(details,'Carregar ocorrências',async()=>{
   if(loading)return;loading=true;page.disabled=true;const sessionEpoch=epoch;
   try{
    const auth=await identity();if(auth?.p.role!=='admin')throw Error('Acesso não autorizado.');
    const result=await auth.c.rpc('sri_p03_monitor_occurrences',{p_event:r.id,p_before:before});
    if(result.error)throw Error('Ocorrências indisponíveis.');
    if(sessionEpoch!==epoch||!details.isConnected)return;
    const batch=result.data||[];
    for(const item of batch){const line=document.createElement('p');line.textContent=item.id+' · '+new Date(item.occurred_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});times.append(line);
     if(item.error_code||item.http_status)line.append(document.createTextNode(' · '+(item.error_code||'Sem código')+(item.http_status?' · HTTP '+item.http_status:'')));
     if(item.audit_id)button(line,'Ver movimentação vinculada',()=>{window.sriP03OpenAudit?.(item);});
    }
    if(!loaded&&!batch.length)times.textContent='Este grupo antecede o registro individual de ocorrências.';
    loaded=true;before=batch.at(-1)?.id??null;page.hidden=batch.length<200;page.textContent='Carregar mais ocorrências';
   }catch(error){if(details.isConnected)times.textContent=error.message;}
   finally{loading=false;page.disabled=false;}
  });
  details.addEventListener('toggle',()=>{if(details.open&&!loaded)page.click();});

  if(['ERROR','FATAL','WARN'].includes(r.severity)){
   const current=incidents.get(String(r.id))||'identified';
   const labels={identified:'Identificado',analysis:'Em análise',correction:'Em correção',validation:'Em validação',resolved:'Resolvido'};
   const allowed={identified:['analysis'],analysis:['correction'],correction:['validation'],validation:['resolved','correction'],resolved:['analysis']};
   const state=document.createElement('span');state.textContent=labels[current]+' ';td.append(state);
   const select=document.createElement('select');select.setAttribute('aria-label','Próxima etapa do incidente '+r.id);
   for(const stage of allowed[current]){const option=document.createElement('option');option.value=stage;option.textContent=labels[stage];select.append(option);}
   td.append(select);
   const save=button(td,'Atualizar incidente',async()=>{
    save.disabled=true;
    try{
     const auth=await identity();if(auth?.p.role!=='admin')throw Error('Acesso não autorizado.');
     const {error}=await auth.c.rpc('sri_p03_incident_set',{p_event:r.id,p_expected:current,p_stage:select.value});
     if(error)throw Error('Não foi possível atualizar o incidente. Atualize a consulta antes de tentar novamente.');
     if(!section.isConnected)return;incidents.set(String(r.id),select.value);render();
    }catch(error){if(section.isConnected)status.textContent=error.message;}
    finally{save.disabled=false;}
   });
  }
 }
}status.textContent=filtered.length+' registros exibidos de '+rows.length+' carregados'+(monitor?' · erros: '+filtered.filter(r=>['ERROR','FATAL'].includes(r.severity)).reduce((n,r)=>n+Number(r.occurrences||1),0):'');}
async function load(more=false){const seq=++request,sessionEpoch=epoch;try{if(!from.value||!to.value||from.value>to.value)throw Error('Informe um período válido.');const auth=await identity();if(!auth||!(monitor?auth.p.role==='admin':['admin','manager','supervisor','assistant'].includes(auth.p.role)))throw Error('Acesso não autorizado.');const end=new Date(to.value+'T00:00:00-03:00');end.setUTCDate(end.getUTCDate()+1);const args={p_from:new Date(from.value+'T00:00:00-03:00').toISOString(),p_to:end.toISOString(),p_before:more?cursor:null};if(monitor)args.p_level=level.value==='Todos'?null:level.value;else args.p_protocol=/^\d+$/.test(search.value.trim())?search.value.trim():null;const {data,error}=await auth.c.rpc(monitor?'sri_monitor_read':'sri_movement_read',args);if(error)throw Error('Consulta indisponível.');if(seq!==request||sessionEpoch!==epoch||!section.isConnected)return;
if(monitor){
 const result=await auth.c.rpc('sri_p03_incident_list');
 if(result.error)throw Error('Consulta de incidentes indisponível.');
 if(seq!==request||sessionEpoch!==epoch||!section.isConnected)return;
 incidents=new Map((result.data||[]).map(item=>[String(item.event_id),item.stage]));
 const measured=await auth.c.rpc('sri_p03_rpc_metrics',{p_from:args.p_from,p_to:args.p_to});
 if(measured.error)throw Error('Medições de desempenho indisponíveis.');
 if(seq!==request||sessionEpoch!==epoch||!section.isConnected)return;
 const metric=measured.data||{};
 latency.textContent=Number(metric.calls)>0?'Medições do navegador · '+metric.calls+' chamadas · '+metric.errors+' falhas · média '+metric.average_ms+' ms · P95 '+metric.p95_ms+' ms · máximo '+metric.maximum_ms+' ms':'Sem medições de desempenho registradas no período.';

}
const batch=(data||[]).map(row=>{
 if(monitor)return row;
 const actions={TASK_ASSIGNED:'Atribuição',TASK_CARRIED:'Continuidade da atribuição',TASK_REASSIGNED:'Redistribuição',TASK_ACTIVATED:'Ativação',TASK_ARCHIVED:'Arquivamento da atribuição',TASK_METADATA_CHANGED:'Atualização dos dados do protocolo',DAY_TASK_TREATMENT:'Registro de tratativa',STATUS_RECONCILIATION:'Decisão de conciliação',GENERAL_OPERATOR_TASKS_PUBLISHED:'Publicação de carteiras',P03_UNFINISHED_CARRIED:'Preservação de pendências',TASK_REOPENED:'Reabertura de protocolo'};
 const roles={admin:'Administrador',manager:'Gestor',supervisor:'Supervisor',assistant:'Assistente',operator:'Operador',viewer:'Consulta'};
 return {...row,action:actions[row.action]||row.action,perfil:roles[row.perfil]||row.perfil,origin:({user:'Usuário autenticado',database:'Banco de dados'})[row.origin]||row.origin};
});
rows=[...new Map((more?rows.concat(batch):batch).map(row=>[String(row.id),row])).values()];cursor=(data||[]).at(-1)?.id??null;next.disabled=(data||[]).length<200;render();
if(monitor){
 const fatal=rows.filter(row=>row.severity==='FATAL');
 critical.hidden=!fatal.length;
 critical.textContent=fatal.length+' falha(s) crítica(s) no recorte carregado. Consulte o código e atualize a etapa do incidente após a análise.';
 const fresh=fatal.filter(row=>!alerted.has(String(row.id)));
 if(fresh.length){fresh.forEach(row=>alerted.add(String(row.id)));window.sriPackNotify?.('Há falhas críticas no Console de Monitoramento.','error');}
}
}catch(e){if(seq===request)status.textContent=e.message;}}
button(controls,'Consultar',()=>load());const next=button(controls,'Carregar mais',()=>load(true));next.disabled=true;search.addEventListener('input',render);
for(const input of [from,to,...(monitor?[level]:[])]){
 input.addEventListener('change',()=>{
  ++request;rows=[];cursor=null;next.disabled=true;critical.hidden=true;latency.textContent='';render();
  status.textContent='Clique em Consultar para carregar o período selecionado.';
 });
}

button(controls,'Exportar CSV',()=>{const esc=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};const q=search.value.trim().toLowerCase(),filtered=rows.filter(matches);const csv=[cols.map(x=>esc(x[1])).join(';'),...filtered.map(r=>cols.map(([k])=>esc(r[k])).join(';'))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
button(controls,'Exportar JSON do recorte',()=>{const q=search.value.trim().toLowerCase(),data=rows.filter(matches).map(r=>Object.fromEntries(cols.map(([k])=>[k,r[k]??null])));const blob=new Blob([JSON.stringify({gerado_em:new Date().toISOString(),fonte:monitor?'monitoramento':'movimentacoes',registros:data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
const reportRows=()=>{const query=search.value.trim().toLowerCase();return rows.filter(matches);};
for(const format of monitor?['xlsx']:['xlsx','pdf']){
 button(controls,format==='xlsx'?'Exportar Excel':'Gerar PDF',()=>{
  try{exportP03Report(monitor?'Monitoramento':'Historico de movimentacoes',cols,reportRows(),from.value+' a '+to.value,format);}
  catch(error){status.textContent=error.message;}
 });
}
button(controls,'Copiar diagnóstico',()=>{const q=search.value.trim().toLowerCase();navigator.clipboard?.writeText(JSON.stringify(rows.filter(matches).map(r=>Object.fromEntries(cols.map(([k])=>[k,r[k]??null]))),null,2)).catch(()=>{})});root.append(section);}
function makeProductivity(root){if(!root||$('sri-p03-productivity'))return;const section=document.createElement('section');section.id='sri-p03-productivity';section.className='v20-panel';section.style.margin='16px 0';const h=document.createElement('h3');h.textContent='Produtividade por operador e equipe';section.append(h);const note=document.createElement('p');note.textContent='Fonte: carteiras publicadas e tratativas registradas. Finalizado na ferramenta não significa resolução confirmada no SIGO. Cada linha conta protocolos distintos por operador/equipe/dia; não some linhas como protocolos globais.';section.append(note);const controls=document.createElement('div');controls.className='v20-row';controls.style.flexWrap='wrap';section.append(controls);const civil=d=>d.toLocaleDateString('sv-SE',{timeZone:'America/Fortaleza'}),now=new Date(),start=new Date(now.getTime()-6*86400000);const from=field(controls,'De','date'),to=field(controls,'Até','date'),team=field(controls,'Equipe'),op=field(controls,'Operador');from.value=civil(start);to.value=civil(now);const status=document.createElement('p');status.setAttribute('role','status');section.append(status);const chart=document.createElement('div');section.append(chart);const wrap=document.createElement('div');wrap.style.overflow='auto';wrap.style.maxHeight='420px';const table=document.createElement('table');table.className='v20-table';wrap.append(table);section.append(wrap);let rows=[],seq=0,page=0;const cols=[['operational_day','Data'],['team_name','Equipe'],['operator_name','Operador'],['received','Recebidos'],['treated','Com tratativa'],['active_stock','Estoque ativo'],['finalized_in_tool','Finalizados na ferramenta'],['untreated_active','Ativos sem tratativa']];const filtered=()=>rows.filter(r=>String(r.team_name||'').toLowerCase().includes(team.value.trim().toLowerCase())&&String(r.operator_name||'').toLowerCase().includes(op.value.trim().toLowerCase()));function render(){const list=filtered(),pages=Math.max(1,Math.ceil(list.length/50));page=Math.min(page,pages-1);prev.disabled=page===0;next.disabled=page>=pages-1;table.replaceChildren();const head=table.createTHead().insertRow();for(const [,label] of cols){const th=document.createElement('th');th.textContent=label;head.append(th);}const body=table.createTBody();for(const r of list.slice(page*50,page*50+50)){const tr=body.insertRow();for(const [k] of cols)cell(tr,r[k]);}status.textContent=list.length+' linhas · página '+(page+1)+'/'+pages;chart.replaceChildren();const caption=document.createElement('p');caption.textContent='Evolução: ocorrências de protocolos por operador/equipe/dia (não deduplicadas entre operadores)';chart.append(caption);const days=new Map();for(const r of list){const key=r.operational_day;const v=days.get(key)||[0,0];v[0]+=Number(r.received||0);v[1]+=Number(r.treated||0);days.set(key,v);}const max=Math.max(1,...[...days.values()].map(v=>v[0]));for(const [day,[received,treated]] of [...days].sort((a,b)=>a[0].localeCompare(b[0]))){const row=document.createElement('div');row.style.margin='8px 0';const label=document.createElement('span');label.textContent=day+' · '+received+' recebidos / '+treated+' tratados';row.append(label);for(const [value,color] of [[received,'#16458d'],[treated,'#16a34a']]){const bar=document.createElement('div');bar.style.width=(100*value/max)+'%';bar.style.height='7px';bar.style.margin='3px 0';bar.style.background=color;row.append(bar);}chart.append(row);}}
const load=async()=>{const id=++seq,e=epoch;status.textContent='Consultando…';try{const a=await identity();if(!a||!['admin','manager','supervisor','assistant'].includes(a.p.role))throw Error('Acesso não autorizado.');if(!from.value||!to.value||from.value>to.value||(Date.parse(to.value)-Date.parse(from.value))/86400000>31)throw Error('Selecione um período de até 32 dias corridos.');let all=[];for(let offset=0;offset<10000;offset+=200){const {data,error}=await a.c.rpc('sri_p03_productivity',{p_from:from.value,p_to:to.value}).range(offset,offset+199);if(error)throw Error('Consulta de produtividade indisponível.');all.push(...(data||[]));if((data||[]).length<200)break;if(offset===9800)throw Error('Recorte muito grande; reduza o período.');}if(id!==seq||e!==epoch||!section.isConnected)return;rows=all;page=0;render();}catch(err){if(id===seq&&e===epoch){rows=[];render();status.textContent=err.message;}}};button(controls,'Consultar',load);const prev=button(controls,'Anterior',()=>{page--;render()});const next=button(controls,'Próxima',()=>{page++;render()});prev.disabled=next.disabled=true;for(const el of [team,op])el.oninput=()=>{page=0;render()};button(controls,'Exportar CSV',()=>{const q=filtered();if(!q.length)return;const esc=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,x=>"'"+x).replace(/"/g,'""')+'"';const csv=[cols.map(x=>esc(x[1])).join(';'),...q.map(r=>cols.map(([k])=>esc(r[k])).join(';'))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='produtividade_sac.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});for(const format of ['xlsx','pdf'])button(controls,format==='xlsx'?'Exportar Excel':'Gerar PDF',()=>{
 if(!filtered().length){status.textContent='Nenhum registro carregado para exportar.';return;}
 try{exportP03Report('Produtividade por operador e equipe',cols,filtered(),from.value+' a '+to.value,format);}
 catch(error){status.textContent=error.message;}
});
for(const input of [from,to])input.addEventListener('change',()=>{++seq;rows=[];page=0;render();status.textContent='Clique em Consultar para carregar o período selecionado.';});
root.append(section);}

function makePendingPanel(){
 if($('sri-p03-reconcile'))return;
 const root=$('sri-pack-carteira')||$('sri33-mine');
 if(!root)return;
 const section=document.createElement('section');section.id='sri-p03-reconcile';section.className='v20-panel';section.style.margin='18px 0';
 const heading=document.createElement('h3');heading.textContent='Pendências antigas para conferência';section.append(heading);
 const desc=document.createElement('p');desc.textContent='Protocolos fora da carteira que exigem conciliação, sem incluir conclusões internas reconhecidas pela matriz oficial. Divergências do SIGO permanecem na conciliação. Consulta somente leitura; não reativar nem presumir conclusão no SIGO.';section.append(desc);
 const btn=document.createElement('button');btn.className='v20-button secondary';btn.type='button';btn.textContent='Conferir pendências';section.append(btn);
 const status=document.createElement('p');status.setAttribute('role','status');section.append(status);
 const wrap=document.createElement('div');wrap.style.overflowX='auto';section.append(wrap);
 let request=0;async function load(){
  const seq=++request,e=epoch;btn.disabled=true;status.textContent='Consultando...';
  try{
   const auth=await identity();if(!auth||auth.p.role!=='operator')throw Error('Consulta restrita ao operador.');
   const {data,error}=await auth.c.rpc('sri_p03_my_unresolved');
   if(error)throw Error('Fila de conciliação ainda não disponibilizada no banco.');
   if(e!==epoch||seq!==request||!section.isConnected)return;
   wrap.replaceChildren();const rows=data||[];
   status.textContent=rows.length?rows.length+' protocolo(s) para conferência.':'Nenhuma pendência histórica.';
   if(rows.length){
    const table=document.createElement('table');table.className='v20-table';
    const operator=field(controls,'Operador'),teamFilter=field(controls,'Equipe'),treatment=field(controls,'Status da tratativa');
 const filtered=()=>rows.filter(row=>[[operator,'operator_name'],[teamFilter,'team_name'],[treatment,'treatment_status']].every(([input,key])=>String(row[key]||'').toLocaleLowerCase('pt-BR').includes(input.value.trim().toLocaleLowerCase('pt-BR'))));
 for(const input of [operator,teamFilter,treatment])input.addEventListener('input',render);
 const cols=[['team_name','Equipe'],['protocol_number','Protocolo'],['last_day','Último dia'],['work_status','Estado histórico'],['treatment_status','Última tratativa'],['sigo_reference','Referência SIGO'],['due_date','Prazo'],['base_name','Base']];
    const hr=table.createTHead().insertRow();for(const [,label]of cols){const th=document.createElement('th');th.textContent=label;hr.append(th);}
    const body=table.createTBody();for(const row of rows){const tr=body.insertRow();for(const [key]of cols)cell(tr,row[key]??'—');}
    wrap.append(table);
   }
  }catch(error){if(e===epoch&&seq===request){wrap.replaceChildren();status.textContent=error.message;}}
  finally{if(seq===request)btn.disabled=false;}
 }
 btn.addEventListener('click',load);root.append(section);void load();
}


/* BUG-GO-001: histórico verdadeiro por data/snapshot, apenas leitura.
 * NUNCA reutiliza a base ativa para responder data histórica. */
function makeManagementHistory(){
 const overview=$('overview');
 if(!overview||$('sri-p03-go-history'))return;
 const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 const root=document.createElement('section');root.id='sri-p03-go-history';root.className='v20-panel';
 root.style.cssText='margin:12px 0;padding:16px;border:1px solid #d7e4f2;border-radius:12px;background:#fff';
 const headline=document.createElement('h3');headline.textContent='Consulta da Gestão Operacional por data';root.append(headline);
 const note=document.createElement('p');note.textContent='Escolha a data operacional para consultar registros históricos. Dias anteriores não usam dados da carteira de hoje. O detalhamento utiliza os estados históricos capturados até o fim da data selecionada.';root.append(note);
 const controls=document.createElement('div');controls.className='v20-row';controls.style.flexWrap='wrap';root.append(controls);
 const day=field(controls,'Data operacional','date');day.value=today();day.max=today();
 const snapshotSelect=document.createElement('select');snapshotSelect.setAttribute('aria-label','Extração e turno');
 snapshotSelect.style.minWidth='220px';snapshotSelect.hidden=true;controls.append(snapshotSelect);
 button(controls,'Consultar data',queryDay);
 const back=button(controls,'Voltar para a carteira atual',()=>{day.value=today();reset()});back.disabled=true;
 const status=document.createElement('p');status.setAttribute('role','status');root.append(status);
 const summary=document.createElement('div');summary.className='v20-grid';root.append(summary);
 const tableWrap=document.createElement('div');tableWrap.style.overflowX='auto';root.append(tableWrap);
 const actions=document.createElement('div');actions.className='v20-row';root.append(actions);
 const more=button(actions,'Carregar mais protocolos',()=>loadTasks(true));more.hidden=true;
 const csv=button(actions,'Exportar CSV da consulta',exportCsv);csv.disabled=true;
 const selectedDay=()=>day.value;
 let snapshots=[],rows=[],cursor=null,snapshot=null,seq=0;
 const esc=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const operator=field(controls,'Operador'),teamFilter=field(controls,'Equipe'),treatment=field(controls,'Status da tratativa');
 const filtered=()=>rows.filter(row=>[[operator,'operator_name'],[teamFilter,'team_name'],[treatment,'treatment_status']].every(([input,key])=>String(row[key]||'').toLocaleLowerCase('pt-BR').includes(input.value.trim().toLocaleLowerCase('pt-BR'))));
 for(const input of [operator,teamFilter,treatment])input.addEventListener('input',render);
 const cols=[['team_name','Equipe'],['protocol_number','Protocolo'],['operator_name','Operador'],['criticality','Criticidade'],['treatment_status','Tratativa gravada'],['source_status','Status origem'],['due_date','Prazo']];
 function reset(){
   ++seq;overview.classList.remove('sri-p03-historical');status.textContent='Exibindo carteira atual; a consulta histórica é opcional.';
   snapshots=[];rows=[];cursor=null;snapshot=null;snapshotSelect.hidden=true;summary.replaceChildren();tableWrap.replaceChildren();
   more.hidden=true;csv.disabled=true;back.disabled=true;
 }
 function showSummary(info){
   summary.replaceChildren();
   const m=info?.indicators||{};
   const stats=[['Data operacional',info.operational_day||'—'],['Turno',info.shift_label||'—'],
     ['Protocolos na extração',info.protocol_count??'Restrito ao perfil'],
     ['Protocolos monitorados',m.protocolos_monitorados??'Não disponível'],
     ['Protocolos atribuídos exibidos',filtered().length]];
   for(const [label,value]of stats){const card=document.createElement('div');card.className='v20-stat';
     const l=document.createElement('span');l.textContent=label;
     const b=document.createElement('b');b.textContent=String(value);card.append(l,b);summary.append(card);}
 }
 function render(){
   tableWrap.replaceChildren();if(!snapshot)return;
   showSummary(snapshot);csv.disabled=!filtered().length;
   const table=document.createElement('table');table.className='v20-table';
   const head=table.createTHead().insertRow();
   for(const [,label]of cols){const th=document.createElement('th');th.textContent=label;head.append(th);}
   const body=table.createTBody();
   for(const r of filtered()){const tr=body.insertRow();for(const [key]of cols)cell(tr,r[key]);}
   tableWrap.append(table);
 }
 function exportCsv(){
   if(!rows.length||!snapshot)return;
   const csvText=[cols.map(([_,l])=>esc(l)).join(';'),
     ...filtered().map(r=>cols.map(([k])=>esc(r[k])).join(';'))].join('\r\n');
   const url=URL.createObjectURL(new Blob(['\ufeff',csvText],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='gestao_historico_'+snapshot.operational_day+'_'+(snapshot.shift_label||'sem_turno')+'.csv';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function queryDay(){
   if(!day.value){reset();return;}
   const requestedDay=day.value;
   const request=++seq;overview.classList.add('sri-p03-historical');back.disabled=false;
   rows=[];cursor=null;snapshot=null;summary.replaceChildren();tableWrap.replaceChildren();more.hidden=true;csv.disabled=true;
   snapshotSelect.hidden=true;status.textContent='Consultando apurações históricas...';
   try{
    const a=await identity();if(!a||!['admin','manager','supervisor','assistant'].includes(a.p.role))throw Error('Acesso à consulta não autorizado.');
    if(request!==seq||!root.isConnected)return;
    const {data,error}=await a.c.rpc('sri_p03_history_snapshots',{p_day:requestedDay});
    if(error)throw Error('Histórico por data indisponível: '+error.message);
    if(request!==seq||!root.isConnected)return;
    snapshots=(data||[]).filter(x=>x?.id&&x.operational_day===selectedDay());
    snapshotSelect.replaceChildren();
    if(!snapshots.length){status.textContent='Não há histórico armazenado para esta data.';return;}
    for(const s of snapshots){const o=document.createElement('option');o.value=s.id;
     o.textContent=(s.shift_label||'Sem turno')+' · '+new Date(s.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});snapshotSelect.append(o);}
    snapshotSelect.hidden=false;await loadTasks(false);
   }catch(err){if(request===seq){status.textContent=err.message;tableWrap.replaceChildren();summary.replaceChildren();}}
 }
 async function loadTasks(append=false){
  const request=++seq;const requestedSnapshot=snapshotSelect.value;
  const currentSnapshot=snapshots.find(s=>s.id===requestedSnapshot);
  if(!currentSnapshot)return;
  snapshot=currentSnapshot;
  more.disabled=true;
  if(!append){
   rows=[];cursor=null;more.hidden=true;csv.disabled=true;
   summary.replaceChildren();tableWrap.replaceChildren();
  }
  status.textContent='Consultando protocolos do snapshot '+currentSnapshot.shift_label+'...';
  try{
   const a=await identity();if(!a)throw Error('Sessão indisponível.');
   if(request!==seq||!root.isConnected)return;
   const {data,error}=await a.c.rpc('sri_p03_history_tasks',{p_snapshot:currentSnapshot.id,p_after:append?cursor:null,p_limit:200});
   if(error)throw Error('Consulta histórica indisponível: '+error.message);
   if(request!==seq||!root.isConnected||selectedDay()!==currentSnapshot.operational_day)return;
   const batch=data||[];
   rows=[...new Map((append?rows.concat(batch):batch).map(r=>[String(r.protocol_number),r])).values()];
   cursor=batch.at(-1)?.protocol_number??null;
   more.hidden=batch.length<200;
   status.textContent=rows.length?rows.length+' protocolos com estado capturado até o fim da data selecionada. Filtros e exportações utilizam os registros carregados.':'Não há histórico armazenado para esta data. A extração possui apenas indicadores consolidados ou antecede a captura de estados.';
   render();
  }catch(err){if(request===seq){status.textContent=err.message;}}
  finally{if(request===seq)more.disabled=false;}
 }
 snapshotSelect.addEventListener('change',()=>loadTasks(false));
 day.addEventListener('change',queryDay);
 const style=document.createElement('style');style.id='sri-p03-go-history-style';
 style.textContent='#overview.sri-p03-historical > :not(.go-head):not(#sri-p03-go-history){display:none!important}#sri-p03-go-history .v20-grid{margin:10px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}';
 if(!$('sri-p03-go-history-style'))document.head.append(style);
 const head=overview.querySelector('.go-head');if(head)head.after(root);else overview.prepend(root);
 reset();
}

function makeReopenPanel(){
 const root=$('v20-pending');if(!root||$('sri-p03-reopen'))return;
 const section=document.createElement('section');section.id='sri-p03-reopen';section.className='v20-panel';section.style.margin='16px 0';
 const heading=document.createElement('h3');heading.textContent='Reabrir protocolo concluído';section.append(heading);
 const note=document.createElement('p');note.textContent='Correção de encerramento indevido pelo operador. A reabertura exige justificativa e mantém o histórico e o status de origem SIGO.';section.append(note);
 const controls=document.createElement('div');controls.className='v20-row';section.append(controls);
 const protocol=field(controls,'Protocolo');protocol.maxLength=100;
 const state=document.createElement('p');state.setAttribute('role','status');section.append(state);
 const context=document.createElement('div');section.append(context);
 const form=document.createElement('form');section.append(form);
 const label=document.createElement('label');label.className='v20-field';label.textContent='Justificativa da reabertura *';
 const reason=document.createElement('textarea');reason.required=true;reason.maxLength=1500;reason.rows=3;reason.disabled=true;label.append(reason);form.append(label);
 let candidate=null,request=0,busy=false;
 const save=button(form,'Reabrir para tratativa',async()=>{
  if(busy||!candidate)return;
  if(!reason.checkValidity()||!reason.value.trim()){reason.reportValidity();state.textContent='Informe a justificativa da reabertura.';return;}
  const selected=candidate,explanation=reason.value.trim();busy=true;save.disabled=true;search.disabled=true;protocol.disabled=true;reason.disabled=true;const sessionEpoch=epoch;
  try{
   const auth=await identity();if(!auth||!['admin','manager'].includes(auth.p.role))throw Error('Reabertura exclusiva de Administrador ou Gestor.');
   const response=await auth.c.rpc('sri_p03_reopen_task',{p_task:selected.id,p_expected:selected.updated_at,p_reason:explanation});
   if(response.error)throw Error(response.error.message||'Não foi possível reabrir o protocolo.');
   if(sessionEpoch!==epoch||!section.isConnected)return;
   candidate=null;form.reset();reason.disabled=true;context.replaceChildren();
   state.textContent='Protocolo reaberto para nova tratativa. A justificativa foi registrada na auditoria.';
   window.sriPackNotify?.('Protocolo reaberto para tratativa.','success');
   void window.sriCloudTreatmentRefresh?.();
  }catch(error){if(sessionEpoch===epoch&&section.isConnected)state.textContent=window.sriFriendly?.(error.message,'error')||error.message;}
  finally{busy=false;search.disabled=false;protocol.disabled=false;reason.disabled=!candidate?.can_reopen;save.disabled=!candidate?.can_reopen;}
 });
 save.disabled=true;
 const search=button(controls,'Consultar protocolo',async()=>{
  if(busy)return;
  if(!protocol.value.trim()){state.textContent='Informe o protocolo.';return;}
  if(candidate&&protocol.value.trim()!==candidate.protocol_number&&reason.value.trim()&&!window.confirm('Descartar a justificativa não salva e consultar outro protocolo?')){protocol.value=candidate.protocol_number;return;}
  const sequence=++request,sessionEpoch=epoch;search.disabled=true;save.disabled=true;state.textContent='Consultando protocolo...';
  try{
   const auth=await identity();if(!auth||!['admin','manager'].includes(auth.p.role))throw Error('Reabertura exclusiva de Administrador ou Gestor.');
   const response=await auth.c.rpc('sri_p03_reopen_candidate',{p_protocol:protocol.value.trim()});
   if(response.error)throw Error(response.error.message||'Consulta indisponível.');
   if(sequence!==request||sessionEpoch!==epoch||!section.isConnected)return;
   if(candidate?.id!==response.data?.id)reason.value='';
   candidate=response.data;context.replaceChildren();reason.disabled=!candidate?.can_reopen;save.disabled=!candidate?.can_reopen;
   if(!candidate){state.textContent='Nenhum protocolo encontrado.';return;}
   const description=document.createElement('p');description.textContent='Protocolo '+candidate.protocol_number+' · '+candidate.operator_name+' · '+candidate.operational_day+' · '+(candidate.treatment_status||'Sem status');context.append(description);
   state.textContent=candidate.can_reopen?'Confirme a justificativa para reabrir.':'O protocolo não está concluído na ferramenta.';
  }catch(error){if(sequence===request&&sessionEpoch===epoch){candidate=null;context.replaceChildren();reason.disabled=true;state.textContent=window.sriFriendly?.(error.message,'error')||error.message;}}
  finally{if(sequence===request)search.disabled=false;}
 });
 protocol.addEventListener('input',()=>{++request;search.disabled=false;save.disabled=true;state.textContent='Consulte o protocolo antes de confirmar a reabertura.';});
 protocol.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search.click();}});
 form.addEventListener('submit',event=>{event.preventDefault();save.click();});
 root.append(section);
}

function makeDashboardNavigation(){
 const routes=[['overview','Visão Geral'],['agents','Desempenho'],['priorities','Riscos Operacionais'],['intelligence','Evolução Histórica']];
 for(const [sectionId]of routes){
  const section=$(sectionId);if(!section||section.querySelector('.sri-p03-chart-nav'))continue;
  const nav=document.createElement('nav');nav.className='sri-p03-chart-nav v20-row';nav.setAttribute('aria-label','Categorias dos gráficos');
  for(const [target,label]of routes){
   const link=button(nav,label,()=>{
    if(target==='intelligence'&&typeof v49SetPane==='function')v49SetPane('evolucao');
   });
   link.dataset.v20Go=target;
   if(target===sectionId)link.setAttribute('aria-current','page');
  }
  section.prepend(nav);
 }
}
const graphButtons=new WeakMap();
function makeGraphExports(){
 const ids=['chart-areas','chart-bko','chart-days','chart-eligibility','chart-filial','chart-priority','chart-sla','chart-timeline','bko-bars','dm-area-chart','dm-bko-chart','dm-channel-chart','dm-coverage-chart','dm-operators-chart','dm-sla-chart','dm-status-chart','historical-chart','sri-p03-heat','v3-agent-bars','v3-trend-chart','v47-chart','v49-bko-trend','v49-compare-chart','v52-day-chart'];
 for(const id of ids){
  const graph=$(id);if(!graph||graphButtons.get(graph)?.isConnected)continue;
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='v20-button secondary sri-p03-chart-export';
  const card=graph.closest('.card,.v3-card,.dm-card,.v49-card,.v20-panel,.v47-chartwrap');
  const title=card?.querySelector('h3,h4,.card-title')?.textContent?.trim()||graph.getAttribute('aria-label')||'Gráfico';
  exportButton.textContent='Exportar gráfico PDF';exportButton.setAttribute('aria-label','Exportar '+title+' em PDF');
  exportButton.onclick=async()=>{
   if(!graph.getClientRects().length)return;
   const output=window.open('','_blank');
   if(!output){window.sriPackNotify?.('Permita abrir a impressão para exportar o gráfico.','warning');return;}
   output.opener=null;const currentEpoch=epoch;
   try{
    const auth=await identity();
    if(currentEpoch!==epoch||!auth||!['admin','manager','supervisor','assistant'].includes(auth.p.role))throw Error('Acesso à exportação não autorizado.');
    const doc=output.document;doc.title=title;
    const style=doc.createElement('style');style.textContent='@page{size:A4 landscape;margin:14mm}body{font:13px sans-serif;color:#173858}svg{max-width:100%;height:auto}button{font:inherit}';
    doc.head.append(style);
    const heading=doc.createElement('h1');heading.textContent=title;doc.body.append(heading);
    const context=doc.createElement('p');
    const filters=[...document.querySelectorAll('#global-controls select,#global-controls input[type=date]')].map(input=>input.tagName==='SELECT'?[...input.selectedOptions].map(option=>option.textContent).join(', '):input.value).filter(Boolean);
    context.textContent='Gerado em '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+(filters.length?' · '+filters.join(' · '):'');doc.body.append(context);
    const clone=graph.cloneNode(true),originals=[graph,...graph.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
    const properties=['color','background-color','fill','stroke','stroke-width','font-family','font-size','font-weight','display','width','height','padding','margin','border','border-radius','grid-template-columns','gap','align-items','justify-content'];
    originals.forEach((node,index)=>{
     const computed=getComputedStyle(node),copy=copies[index];
     for(const property of properties)copy.style.setProperty(property,computed.getPropertyValue(property));
     for(const attribute of [...copy.attributes])if(attribute.name.startsWith('on'))copy.removeAttribute(attribute.name);
    });
    clone.style.maxWidth='100%';doc.body.append(clone);
    await doc.fonts.ready;if(output.closed||currentEpoch!==epoch)return;output.focus();output.print();
   }catch(error){output.close();window.sriPackNotify?.(error.message,'error');}
  };
  graph.before(exportButton);graphButtons.set(graph,exportButton);
 }
}

function clear(){$('sri-p03-reopen')?.remove();document.querySelectorAll('.sri-p03-chart-nav,.sri-p03-chart-export').forEach(node=>node.remove());document.getElementById('overview')?.classList.remove('sri-p03-historical');$('sri-p03-reconcile')?.remove();$('sri-p03-go-history')?.remove();epoch++;client=null;profile=null;userId=null;seen.clear();$('sri-monitor-panel')?.remove();$('sri-movement-panel')?.remove();$('sri-p03-productivity')?.remove();}
let checking=false;async function refresh(){if(checking)return;checking=true;const e=epoch;try{const a=await identity();if(e!==epoch)return;if(!a){if(profile)clear();return;}if(userId!==a.p.id||profile?.role!==a.p.role){clear();client=a.c;profile=a.p;userId=a.p.id;log('SUCCESS','AUTH_OK','Autenticação');}if(['admin','manager'].includes(profile.role))makeReopenPanel();else $('sri-p03-reopen')?.remove();if(profile.role==='operator')makePendingPanel();else $('sri-p03-reconcile')?.remove();if(profile.role==='admin')make($('v20-settings'),'sri-monitor-panel',true);else $('sri-monitor-panel')?.remove();if(['admin','manager','supervisor','assistant'].includes(profile.role)){makeManagementHistory();makeDashboardNavigation();makeGraphExports();make($('reports'),'sri-movement-panel',false);makeProductivity($('reports'));}else {$('sri-movement-panel')?.remove();$('sri-p03-productivity')?.remove();}}catch(_){}finally{checking=false;}}
async function checkCritical(){
 const currentEpoch=epoch;
 try{
  const auth=await identity();if(auth?.p.role!=='admin')return;
  const end=new Date(),start=new Date(end.getTime()-5*60000);
  const result=await auth.c.rpc('sri_monitor_read',{p_from:start.toISOString(),p_to:end.toISOString(),p_level:'FATAL',p_before:null});
  if(currentEpoch!==epoch||result.error)return;
  for(const event of result.data||[]){
   const key='critical:'+event.id;if(seen.has(key))continue;seen.set(key,Date.now());
   window.sriPackNotify?.('Falha crítica registrada. Consulte o Console de Monitoramento.','error');
  }
 }catch(_){}
}
async function init(){await refresh();try{const c=await window.sriGetSupabaseClient?.();c?.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){clear();setTimeout(refresh,0)}})}catch(_){}timer=setInterval(async()=>{await refresh();await checkCritical();},15000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();