/* Pacote 03: reports use server-authorized events and the same model for screen/export. */
(()=>{
'use strict';
const completed=new Set(DIST_STATUS_DEFS.filter(([, ,code])=>code===3).map(([name])=>name));
const unique=rows=>[...new Map(rows.map(row=>[row.kind+':'+row.id,row])).values()];
const key=row=>String(row.protocol||'');
const order=(a,b)=>String(a.at||'').localeCompare(String(b.at||''))||(Number(a.action==='TASK_REOPENED')-Number(b.action==='TASK_REOPENED'))||String(a.cursor||a.id).localeCompare(String(b.cursor||b.id),undefined,{numeric:true});
function work(rows){
 const events=unique(rows).filter(row=>row.kind==='treatment'||(row.kind==='movement'&&row.action==='TASK_REOPENED')).sort(order);
 const treated=new Set(),last=new Map();
 for(const row of events){if(!row.protocol)continue;if(row.kind==='treatment')treated.add(key(row));if(row.status!=='note'||row.kind!=='treatment')last.set(key(row),row);}
 let conclusions=0;
 for(const protocol of treated){const row=last.get(protocol);if(row?.kind==='treatment'&&(completed.has(row.status)||row.status==='completed_in_tool'))conclusions++;}
 return {treated:treated.size,conclusions,percentage:treated.size?100*conclusions/treated.size:null};
}
function summary(raw){const rows=unique(raw),result=work(rows);return {...result,
 assigned:new Set(rows.filter(r=>r.kind==='assignment').map(key)).size,
 events:rows.filter(r=>r.kind==='treatment').length,
 reconciliations:rows.filter(r=>r.kind==='reconciliation').length,
 reopens:rows.filter(r=>r.kind==='movement'&&r.action==='TASK_REOPENED').length,
 imports:rows.filter(r=>r.kind==='import').length};}
function daily(raw){const groups=new Map();for(const row of unique(raw)){const group=groups.get(row.day)||[];group.push(row);groups.set(row.day,group);}
 return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([day,rows])=>({day,...summary(rows)}));}
function group(raw,field){const groups=new Map();for(const row of raw){if(!['assignment','treatment'].includes(row.kind)&&row.action!=='TASK_REOPENED')continue;
 const isReopen=field==='operator'&&row.action==='TASK_REOPENED';const id=(isReopen?row.assigned_operator_id:row[field+'_id'])||row[field]||'',name=(isReopen?row.assigned_operator:row[field])||'Não registrado';const bucket=groups.get(id)||{id,name,rows:[]};bucket.rows.push(row);groups.set(id,bucket);}
 return [...groups.values()].map(bucket=>({id:bucket.id,name:bucket.name,...summary(bucket.rows)})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));}
function selectGoal(goals,day,teamId,operatorId){
 return goals.filter(g=>g.effective<=day&&(g.scope==='general'||g.scope==='team'&&g.target===teamId||g.scope==='operator'&&g.target===operatorId))
 .sort((a,b)=>({operator:3,team:2,general:1}[b.scope]-{operator:3,team:2,general:1}[a.scope])||b.effective.localeCompare(a.effective)||Number(b.id)-Number(a.id))[0]||null;
}
function goalResults(rows,goals,byOperator){
 const groups=new Map();for(const row of rows){if(row.kind!=='treatment'&&row.action!=='TASK_REOPENED')continue;
 const operatorId=row.action==='TASK_REOPENED'?row.assigned_operator_id:row.operator_id;
 const id=[row.day,row.team_id||'',byOperator?operatorId||'':''].join('|');
 const value=groups.get(id)||{day:row.day,team_id:row.team_id,operator_id:byOperator?operatorId:null,team:row.team||'Não registrada',operator:byOperator?(row.action==='TASK_REOPENED'?'Operador da atribuição':row.operator)||'Não registrado':'Equipe',rows:[]};
 if(row.kind==='treatment'&&byOperator)value.operator=row.operator||'Não registrado';value.rows.push(row);groups.set(id,value);}
 return [...groups.values()].filter(g=>g.rows.some(r=>r.kind==='treatment')).map(g=>{const actual=work(g.rows),goal=selectGoal(goals,g.day,g.team_id,g.operator_id);
 return {day:g.day,team:g.team,operator:g.operator,treated:actual.treated,conclusions:actual.conclusions,percentage:actual.percentage,
 goal:goal?.percentage??null,goal_version:goal?.id??null,attainment:actual.percentage===null||!goal?null:actual.percentage>=Number(goal.percentage)?'Atingida':'Abaixo da meta'};
 }).sort((a,b)=>b.day.localeCompare(a.day)||a.team.localeCompare(b.team)||a.operator.localeCompare(b.operator));
}
function filter(rows,criteria){return rows.filter(row=>Object.entries(criteria).every(([field,value])=>!value||String(field==='operator'&&row.action==='TASK_REOPENED'?row.assigned_operator||'':row[field]||'').toLocaleLowerCase('pt-BR').includes(String(value).toLocaleLowerCase('pt-BR'))));}
window.sriP03ReportingModel=Object.freeze({unique,work,summary,daily,group,selectGoal,goalResults,filter});
const $=id=>document.getElementById(id),roles=new Set(['admin','manager','supervisor','assistant']);
let epoch=0,actor='',profileRole='',section=null,goalsSection=null;
async function auth(){const c=await window.sriGetSupabaseClient?.();if(!c)throw Error('Conexão indisponível.');const {data,error}=await c.auth.getUser();if(error||!data?.user)throw Error('Entre no sistema.');
 const result=await c.from('profiles').select('id,role').eq('id',data.user.id).single();if(result.error||!roles.has(result.data?.role))throw Error('Relatórios restritos à gestão.');return {c,p:result.data};}
function node(tag,text,parent){const el=document.createElement(tag);if(text!==null)el.textContent=text;if(parent)parent.append(el);return el;}
function button(parent,text,click){const el=node('button',text,parent);el.type='button';el.className='v20-button secondary';el.onclick=click;return el;}
function field(parent,label,type='text'){const wrap=node('label',label,parent);wrap.className='v20-field';const input=node('input',null,wrap);input.type=type;return input;}
function choose(parent,label,options){const wrap=node('label',label,parent);wrap.className='v20-field';const select=node('select',null,wrap);for(const [value,name] of options){const opt=node('option',name,select);opt.value=value;}return select;}
function table(parent,columns,rows){const result=node('table',null,parent);result.className='v20-table';const head=result.createTHead().insertRow();for(const [,label] of columns)node('th',label,head);
 const body=result.createTBody();for(const row of rows){const tr=body.insertRow();for(const [field] of columns)node('td',row[field]===null||row[field]===undefined?'Não registrado':String(row[field]),tr);}return result;}
const number=value=>value===null?'Sem base de cálculo':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:2});
const labels={executive:'Resumo Executivo',team:'Desempenho por Equipe',operator:'Produtividade por Operador',goals:'Metas e Resultados',evolution:'Evolução Operacional',closure:'Fechamento Diário',sla:'SLA e Criticidade',reconciliation:'Conciliação e Revisões',journey:'Jornada do Protocolo',imports:'Histórico de Importações',audit:'Auditoria Operacional'};
function makeReports(root){
 if(!root||$('sri-p03-integrated-reports'))return;
 const panel=node('section',null,root);panel.id='sri-p03-integrated-reports';panel.className='v20-panel sri-p03-integrated-report';section=panel;
 node('h3','Relatórios gerenciais por período',panel);
 node('p','Dados autorizados pelo sistema. Cada protocolo é contado uma vez no recorte indicado. A conclusão representa o registro na ferramenta. O SIGO mantém seu estado próprio.',panel);
 const controls=node('div',null,panel);controls.className='sri-pack-controls';
 const kind=choose(controls,'Relatório',Object.entries(labels)),from=field(controls,'De','date'),to=field(controls,'Até','date');
 kind.id='sri-p03-report-kind';
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});from.value=to.value=today;
 const filters=node('div',null,panel);filters.className='sri-pack-controls';
 const team=field(filters,'Equipe'),operator=field(filters,'Operador'),base=field(filters,'Base'),area=field(filters,'Área'),protocol=field(filters,'Protocolo');
 const compare=node('details',null,panel);node('summary','Comparar com outro período',compare);const compareControls=node('div',null,compare);compareControls.className='sri-pack-controls';
 const compareFrom=field(compareControls,'Comparativo de','date'),compareTo=field(compareControls,'Comparativo até','date');
 for(const [name,input] of Object.entries({from,to,team,operator,base,area,protocol,compareFrom,compareTo}))input.id='sri-p03-report-'+name;
 const status=node('p','Selecione o período e clique em Consultar.',panel);status.setAttribute('role','status');
 const stats=node('div',null,panel);stats.className='v20-grid';const comparison=node('div',null,panel);
 const explanation=node('details',null,panel);node('summary','Como os indicadores são calculados',explanation);
 node('p','Protocolos trabalhados: protocolos distintos com tratativa registrada no período. Concluídos: última tratativa concluída na ferramenta, descontando reabertura posterior no recorte. Meta diária: concluídos ÷ protocolos distintos trabalhados no mesmo dia × 100. Eventos contam cada atuação. Atribuídos contam protocolos distintos das carteiras publicadas. Importações, revisões e reaberturas contam seus próprios registros. Números por equipe/operador podem se sobrepor e não devem ser somados como protocolos globais. Dados sem contexto histórico aparecem como não registrados.',explanation);
 const graph=node('div',null,panel);graph.className='sri-p03-report-chart';graph.setAttribute('aria-label','Evolução e composição do recorte');
 const output=node('div',null,panel);output.className='sri-p03-report-table';const paging=node('div',null,panel);paging.className='sri-pack-controls';
 let rows=[],other=[],goals=[],request=0,page=0,exportRows=[],columns=[],loaded=false,selectedDay='',selectedStatus='',favoriteScope='',linkedAudit=null;
 const criteria=()=>({team:team.value.trim(),operator:operator.value.trim(),base:base.value.trim(),area:area.value.trim(),protocol:protocol.value.trim()});
 const scoped=raw=>filter(raw,criteria()).filter(r=>(!selectedDay||r.day===selectedDay)&&(!selectedStatus||r.status===selectedStatus)&&(!linkedAudit||r.kind==='movement'&&String(r.id)===String(linkedAudit)));
 function card(label,value){const el=node('div',null,stats);el.className='v20-stat';node('span',label,el);node('b',String(value),el);}
 function render(){
  goalScope.closest('label').hidden=kind.value!=='goals';
  const list=scoped(rows),totals=summary(list);stats.replaceChildren();comparison.replaceChildren();graph.replaceChildren();output.replaceChildren();
  card('Protocolos atribuídos',totals.assigned);card('Protocolos trabalhados',totals.treated);card('Concluídos na ferramenta',totals.conclusions);card('Eventos de tratativa',totals.events);card('Conciliações',totals.reconciliations);card('Reaberturas',totals.reopens);
  if(other.length&&!selectedDay&&!selectedStatus){const prior=summary(filter(other,criteria()));table(comparison,[['label','Indicador'],['a','Período principal'],['b','Comparativo'],['delta','Variação absoluta']],
   [['Atribuídos','assigned'],['Trabalhados','treated'],['Concluídos','conclusions'],['Reaberturas','reopens']].map(([label,key])=>({label,a:totals[key],b:prior[key],delta:totals[key]-prior[key]})));node('p','Comparação usa os mesmos critérios. Períodos podem ter durações diferentes, informadas nas datas; valores são absolutos.',comparison);}
  let detail=list;
  if(kind.value==='executive'){exportRows=Object.entries({Atribuídos:totals.assigned,Trabalhados:totals.treated,Concluídos:totals.conclusions,'Eventos de tratativa':totals.events,Conciliações:totals.reconciliations,Reaberturas:totals.reopens,Importações:totals.imports}).map(([indicator,value])=>({indicator,value}));columns=[['indicator','Indicador'],['value','Quantidade']];}
  else if(['team','operator'].includes(kind.value)){exportRows=group(list,kind.value);columns=[['name',kind.value==='team'?'Equipe':'Operador'],['assigned','Atribuídos'],['treated','Trabalhados'],['conclusions','Concluídos'],['events','Eventos']];}
  else if(kind.value==='goals'){exportRows=goalResults(list,goals,goalScope.value==='operator').map(r=>({...r,percentage:r.percentage===null?null:number(r.percentage)+'%',goal:r.goal===null?'Não definida':number(r.goal)+'%'}));columns=[['day','Dia'],['team','Equipe'],['operator','Referência'],['treated','Trabalhados'],['conclusions','Concluídos'],['percentage','Conclusão'],['goal','Meta'],['goal_version','Versão'],['attainment','Resultado']];}
  else if(kind.value==='evolution'){exportRows=daily(list);columns=[['day','Dia'],['assigned','Atribuídos'],['treated','Trabalhados'],['conclusions','Concluídos'],['reconciliations','Conciliações'],['reopens','Reaberturas']];}
  else if(kind.value==='sla'){
   const uniqueTasks=[...new Map(list.filter(r=>r.kind==='assignment').sort(order).map(r=>[r.protocol,r])).values()],buckets=new Map();
   for(const row of uniqueTasks){const id=[row.area||'Não registrada',row.sla||'Não registrado',row.criticality||'Não registrada'].join(' | ');buckets.set(id,(buckets.get(id)||0)+1);}
   exportRows=[...buckets].map(([bucket,total])=>({bucket,total}));columns=[['bucket','Área | SLA | Criticidade'],['total','Protocolos distintos na última atribuição do período']];
  }else{
   const types={closure:'closure',reconciliation:'reconciliation',journey:null,imports:'import',audit:'movement'};detail=list.filter(r=>types[kind.value]?r.kind===types[kind.value]:['treatment','movement','reconciliation','assignment'].includes(r.kind)).sort(order);
   exportRows=detail.map(r=>({...r,at:r.at?new Date(r.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):null,indicators:r.indicators?JSON.stringify(r.indicators):null}));
   columns=kind.value==='imports'?[['at','Data/hora'],['day','Dia operacional'],['shift','Turno'],['operator','Importador'],['protocol_count','Protocolos na origem'],['indicators','Indicadores registrados']]:kind.value==='closure'?[['day','Dia operacional'],['team','Equipe'],['shift','Turno'],['at','Fechado em'],['status','Situação'],['protocol_count','Protocolos'],['reopened_at','Reaberto em'],['justification','Justificativa']]:
    [['at','Data/hora'],['protocol','Protocolo'],['kind','Tipo de registro'],['team','Equipe'],['operator','Responsável'],['base','Base'],['area','Área'],['action','Ação'],['previous','Anterior'],['status','Status/novo valor'],['source_status','Status SIGO observado'],['decision','Decisão'],['justification','Justificativa']];
  }
  const pages=Math.max(1,Math.ceil(exportRows.length/100));page=Math.min(page,pages-1);prev.disabled=page===0;next.disabled=page>=pages-1;
  table(output,columns,exportRows.slice(page*100,page*100+100));status.textContent=loaded?(exportRows.length?exportRows.length+' linhas · página '+(page+1)+'/'+pages:'Não há registros armazenados para este recorte.'):'Selecione o período e clique em Consultar.';
  node('h4','Trabalho e conclusões por dia',graph);const series=daily(list);const max=Math.max(1,...series.map(r=>r.treated));
  for(const row of series){const line=button(graph,row.day+' · '+row.treated+' trabalhados / '+row.conclusions+' concluídos',()=>{selectedDay=row.day;page=0;render();});line.className='sri-p03-series-row';line.setAttribute('aria-label','Detalhar '+row.day);
   for(const [value,type] of [[row.treated,'worked'],[row.conclusions,'completed']]){const bar=node('span',null,line);bar.className='sri-p03-series-bar '+type;bar.style.width=(100*value/max)+'%';}}
  node('h4','Composição das tratativas (eventos)',graph);const composition=new Map();for(const row of list.filter(r=>r.kind==='treatment'))composition.set(row.status,(composition.get(row.status)||0)+1);
  for(const [name,total] of composition)button(graph,name+': '+total,()=>{selectedStatus=name;page=0;render();});
  const imports=list.filter(r=>r.kind==='import').sort(order);if(imports.length){node('h4','Evolução da carteira nas extrações',graph);for(const row of imports){const b=button(graph,new Date(row.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · '+row.protocol_count+' protocolos na origem',()=>{kind.value='imports';page=0;render();});b.title='Detalhar a importação registrada';}}
  if(selectedDay||selectedStatus||linkedAudit)button(graph,'Limpar detalhamento',()=>{selectedDay=selectedStatus='';linkedAudit=null;page=0;render();});
 }
 async function fetchPeriod(c,a,b,seq,session){if(!a||!b||a>b||(Date.parse(b)-Date.parse(a))/86400000>92)throw Error('Selecione um período de até 93 dias.');
  let cursor=null,all=[];for(;;){const {data,error}=await c.rpc('sri_p03_reporting_page',{p_from:a,p_to:b,p_after:cursor});
   if(seq!==request||session!==epoch||!panel.isConnected)return null;if(error)throw Error('Não foi possível consultar os relatórios.');
   const batch=data||[];all.push(...batch);if(batch.length<400)return unique(all);const next=batch.at(-1).cursor;if(!next||next===cursor)throw Error('A consulta não avançou. Tente novamente.');cursor=next;
  }}
 async function load(){const seq=++request,session=epoch;rows=[];other=[];loaded=false;render();status.textContent='Consultando eventos e metas…';
  try{const a=await auth();if(seq!==request||session!==epoch)return;const current=await fetchPeriod(a.c,from.value,to.value,seq,session);if(current===null)return;
   const previous=compareFrom.value||compareTo.value?await fetchPeriod(a.c,compareFrom.value,compareTo.value,seq,session):[];if(previous===null)return;
   const result=await a.c.rpc('sri_p03_goals');if(seq!==request||session!==epoch||!panel.isConnected)return;if(result.error)throw Error('Não foi possível carregar as metas.');
   goals=result.data||[];rows=current;other=previous;page=0;loaded=true;render();
  }catch(error){if(seq===request&&session===epoch){rows=[];other=[];render();status.textContent=error.message;}}}
 button(controls,'Consultar',load);const prev=button(paging,'Anterior',()=>{page--;render();}),next=button(paging,'Próxima',()=>{page++;render();});prev.disabled=next.disabled=true;
 const goalScope=choose(controls,'Metas por',[['team','Equipe'],['operator','Operador']]);goalScope.onchange=()=>{page=0;render();};
 window.sriP03OpenAudit=async item=>{if(!item?.audit_id||!item.audit_at)return;from.value=to.value=new Date(item.audit_at).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});kind.value='audit';team.value=operator.value=base.value=area.value=protocol.value='';compareFrom.value=compareTo.value='';selectedDay=selectedStatus='';linkedAudit=item.audit_id;window.switchTab?.('reports');await load();panel.scrollIntoView({behavior:'smooth'});};
 const invalidate=()=>{linkedAudit=null;++request;rows=[];other=[];loaded=false;selectedDay=selectedStatus='';page=0;render();};
 for(const input of [from,to,compareFrom,compareTo])input.onchange=invalidate;
 for(const input of [team,operator,base,area,protocol])input.oninput=()=>{linkedAudit=null;selectedDay=selectedStatus='';page=0;render();};kind.onchange=()=>{linkedAudit=null;selectedDay=selectedStatus='';page=0;render();readFavorite();};
 for(const format of ['csv','xlsx','pdf'])button(paging,'Exportar '+(format==='xlsx'?'Excel':format.toUpperCase()),async()=>{
  const session=epoch;try{const a=await auth();if(session!==epoch||a.p.id!==actor||!panel.isConnected)return;if(!loaded||!exportRows.length)throw Error('Consulte um recorte com registros antes de exportar.');
   const context=from.value+' a '+to.value+' · filtros '+JSON.stringify(criteria())+(selectedDay?' · dia '+selectedDay:'')+(selectedStatus?' · status '+selectedStatus:'')+(linkedAudit?' · auditoria '+linkedAudit:'');
   if(format==='csv'){const esc=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,x=>"'"+x).replace(/"/g,'""')+'"';
    const csv=[columns.map(([,label])=>esc(label)).join(';'),...exportRows.map(row=>columns.map(([field])=>esc(row[field])).join(';'))].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='SAC_'+kind.value+'_'+from.value+'_'+to.value+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }else window.sriP03ExportReport(labels[kind.value],columns,exportRows,context,format);
  }catch(error){status.textContent=error.message;}
 });
 const exitPresentation=button(panel,'Sair da apresentação',()=>{panel.classList.remove('sri-p03-presenting');exitPresentation.hidden=true;});exitPresentation.hidden=true;exitPresentation.classList.add('sri-p03-presentation-exit');
 button(paging,'Modo apresentação',()=>{panel.classList.toggle('sri-p03-presenting');exitPresentation.hidden=!panel.classList.contains('sri-p03-presenting');});
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){panel.classList.remove('sri-p03-presenting');exitPresentation.hidden=true;}});
 const favorite=button(controls,'Marcar favorito',()=>{try{const values=JSON.parse(localStorage.getItem(favoriteScope)||'[]');const next=values.includes(kind.value)?values.filter(v=>v!==kind.value):[...values,kind.value];localStorage.setItem(favoriteScope,JSON.stringify(next));readFavorite();}catch(_){status.textContent='Não foi possível salvar a preferência.';}});
 function readFavorite(){favoriteScope='sri.p03.managementReports:'+actor;let list=[];try{list=JSON.parse(localStorage.getItem(favoriteScope)||'[]');}catch(_){}
 favorite.textContent=list.includes(kind.value)?'Remover favorito':'Marcar favorito';for(const option of kind.options)option.textContent=(list.includes(option.value)?'★ ':'')+labels[option.value];}
 readFavorite();render();
}
function makeGoals(root){
 if(!root||root.querySelector('.sri-p03-goals-shared'))return;
 const panel=node('section',null,root);panel.className='v20-panel sri-p03-goals-shared';goalsSection=panel;
 node('h3','Meta diária de conclusão',panel);
 node('p','Meta = protocolos concluídos na ferramenta ÷ protocolos distintos trabalhados no dia × 100. A última tratativa de cada protocolo determina sua conclusão; uma reabertura posterior no mesmo dia a retira do numerador. Dias sem trabalho ficam sem base de cálculo. Movimentação e retrabalho aguardam futura definição com a gestão.',panel);
 node('p','Os rascunhos locais anteriores continuam preservados. As metas publicadas abaixo são compartilhadas, versionadas e aplicadas pela vigência, com prioridade de operador, equipe e meta geral.',panel);
 const form=node('form',null,panel);form.dataset.sriP03Form='';form.className='sri-pack-controls';
 const isGlobal=['admin','manager'].includes(profileRole),scope=choose(form,'Aplicação',isGlobal?[['general','Toda a operação'],['team','Equipe'],['operator','Operador']]:[['team','Equipe'],['operator','Operador']]);
 const target=choose(form,'Referência',[]),effective=field(form,'Vigência a partir de','date'),percentage=field(form,'Meta de conclusão (%)','number');
 effective.value=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});effective.required=percentage.required=true;percentage.min='0';percentage.max='100';percentage.step='0.01';
 const save=node('button','Publicar meta',form);save.type='submit';save.className='v20-button';
 const status=node('p','Carregando metas…',panel);status.setAttribute('role','status');const history=node('div',null,panel);history.className='sri-p03-report-table';
 let teams=[],operators=[],versions=[],seq=0;
 function targets(){target.replaceChildren();const values=scope.value==='team'?teams:scope.value==='operator'?operators:[];
  for(const item of values){const option=node('option',item.name||item.full_name,target);option.value=item.id;}target.disabled=scope.value==='general';target.required=!target.disabled;}
 scope.onchange=targets;
 async function load(){const request=++seq,session=epoch;try{const a=await auth();const results=await Promise.all([
  a.c.rpc('sri_p03_goals'),a.c.from('teams').select('id,name').eq('active',true),a.c.from('profiles').select('id,full_name,role,operational_status').eq('role','operator')]);
  if(session!==epoch||request!==seq||!panel.isConnected)return;for(const result of results)if(result.error)throw Error('Não foi possível consultar metas e referências.');
  versions=results[0].data||[];teams=results[1].data||[];operators=(results[2].data||[]).filter(p=>['Ativo','Promovido'].includes(p.operational_status));targets();
  history.replaceChildren();table(history,[['effective','Vigência'],['scope','Aplicação'],['target_name','Referência'],['percentage','Meta (%)'],['id','Versão'],['created_at','Registrada em']],versions);
  status.textContent=versions.length?versions.length+' versões preservadas.':'Nenhuma meta publicada. O resultado diário pode ser consultado sem uma meta definida.';
 }catch(error){if(request===seq&&session===epoch)status.textContent=error.message;}}
 form.onsubmit=async event=>{event.preventDefault();const session=epoch,values={scope:scope.value,target:scope.value==='general'?null:target.value,effective:effective.value,percentage:Number(percentage.value)};
  if(!percentage.value||!Number.isFinite(values.percentage)||values.percentage<0||values.percentage>100)return;
  const prior=versions.find(g=>g.scope===values.scope&&(g.target||null)===values.target&&g.effective===values.effective);
  for(const input of form.elements)input.disabled=true;
  try{const a=await auth();if(session!==epoch||!panel.isConnected)return;
   const result=await a.c.rpc('sri_p03_goal_save',{p_scope:values.scope,p_target:values.target,p_effective:values.effective,p_percentage:values.percentage,p_expected:prior?.id??null});
   if(session!==epoch||!panel.isConnected)return;if(result.error)throw Error('Não foi possível publicar a meta. Consulte novamente e verifique as permissões.');
   form.dataset.sriP03Dirty='false';await load();status.textContent='Meta publicada. A versão anterior foi preservada.';window.sriPackNotify?.('Meta diária publicada.','success');
  }catch(error){if(session===epoch)status.textContent=error.message;}finally{if(session===epoch)for(const input of form.elements)input.disabled=false;targets();}
 };
 form.addEventListener('input',()=>{form.dataset.sriP03Dirty='true';});
 button(panel,'Consultar Metas e Resultados',()=>{window.switchTab?.('reports');const select=$('sri-p03-report-kind');if(select){select.value='goals';select.dispatchEvent(new Event('change'));}$('sri-p03-integrated-reports')?.scrollIntoView({behavior:'smooth'});});
 void load();
}
window.sriP03GoalSettings=root=>makeGoals(root);
window.sriP03GoalPerformance=root=>{if(!root)return;root.replaceChildren();node('h3','Metas e Resultados',root);node('p','Consulte os protocolos trabalhados, concluídos e o percentual de conclusão por dia, equipe ou operador na Central de Relatórios.',root);
 button(root,'Consultar resultado diário',()=>{window.switchTab?.('reports');const select=$('sri-p03-report-kind');if(select){select.value='goals';select.dispatchEvent(new Event('change'));}$('sri-p03-integrated-reports')?.scrollIntoView({behavior:'smooth'});});};
function clear(){epoch++;window.sriP03OpenAudit=null;actor='';profileRole='';section?.remove();section=null;document.querySelectorAll('.sri-p03-goals-shared').forEach(el=>el.remove());goalsSection=null;}
let refreshing=false;
async function refresh(){if(refreshing)return;refreshing=true;const request=epoch;
 try{const a=await auth();if(request!==epoch)return;if(actor!==a.p.id||profileRole!==a.p.role){clear();actor=a.p.id;profileRole=a.p.role;}makeReports($('reports'));if(document.body.dataset.sriSettingsPage==='goals'&&document.querySelector('.tab-content.active')?.id==='v20-settings')makeGoals($('v20-settings-body'));}
 catch(_){if(actor)clear();}finally{refreshing=false;}}
function init(){void refresh();window.sriGetSupabaseClient?.().then(c=>c.auth.onAuthStateChange(event=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)){clear();setTimeout(refresh,0);}})).catch(()=>{});
 setInterval(refresh,15000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
