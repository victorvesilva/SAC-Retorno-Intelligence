/* Daily published portfolios. All reads use the signed-in account and existing RLS. */
(()=>{'use strict';
const completed=new Set(DIST_STATUS_DEFS.filter(([, ,code])=>code===3).map(([status])=>status)),zone='America/Sao_Paulo';
const stamp=r=>String(r.created_at||r.at||''),compare=(a,b)=>(Date.parse(stamp(a))-Date.parse(stamp(b)))||String(a.id).localeCompare(String(b.id),undefined,{numeric:true});
const unique=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
const endOfDay=day=>new Date(Date.parse(day+'T00:00:00-03:00')+86400000).toISOString();
function portfolio(tasks){const byProtocol=new Map();for(const t of unique(tasks).sort(compare)){if(t.protocol_number)byProtocol.set(String(t.protocol_number),t);}return [...byProtocol.values()];}
function build(tasks,ancestors,treatments,movements,day){
 const end=endOfDay(day),all=new Map([...ancestors,...tasks].map(t=>[t.id,t])),byTask=new Map();
 for(const h of unique(treatments).filter(h=>Date.parse(h.created_at)<Date.parse(end))){const list=byTask.get(h.task_id)||[];list.push(h);byTask.set(h.task_id,list);}
 return portfolio(tasks.filter(t=>Date.parse(t.created_at)<Date.parse(end))).map(t=>{
  const visited=new Set(),history=[];let cursor=t,gap=false;
  while(cursor&&!visited.has(cursor.id)){visited.add(cursor.id);history.push(...(byTask.get(cursor.id)||[]));if(!cursor.carried_from_task_id)break;const parent=all.get(cursor.carried_from_task_id);if(!parent||parent.protocol_number!==t.protocol_number){gap=true;break;}cursor=parent;}
  history.sort(compare);const last=history.at(-1),action=history.filter(h=>h.action!=='note').at(-1);
  const reopen=movements.filter(e=>e.action==='TASK_REOPENED'&&String(e.protocol)===String(t.protocol_number)&&String(e.team_id||'')===String(t.team_id||'')&&Date.parse(e.at)<Date.parse(end)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
  const legacy=Date.parse(t.updated_at)<Date.parse(end)&&!gap,known=Boolean(action)||legacy;
  let status=action?.action||(legacy?t.treatment_status:null),state='unknown';
  if(known){const worked=Boolean(status&&status!=='SEM STATUS')||(!action&&t.work_status==='completed_in_tool');state=worked?(completed.has(status)||(!action&&t.work_status==='completed_in_tool')?'completed':'progress'):'untreated';}
  if(reopen&&(!action||Date.parse(reopen.at)>=Date.parse(action.created_at))){state=history.length?'progress':'untreated';status='Reaberto';}
  return {...t,protocol:String(t.protocol_number),status:status||'Sem tratativa',state,is_special:last?.is_special??(legacy?t.is_special:null),notes:last?.notes||'',recorded_at:last?.created_at||null,actor_name:last?.event_context?.actor_name||'',gap};
 });
}
function totals(rows){const count=state=>rows.filter(r=>r.state===state).length;const assigned=rows.length,conclusions=count('completed'),progress=count('progress'),treated=conclusions+progress;
 return {assigned,treated,conclusions,progress,untreated:count('untreated'),unknown:count('unknown'),sensitive:rows.filter(r=>r.is_special===true).length,workedRate:assigned?100*treated/assigned:null,conclusionRate:count('unknown')?null:treated?100*conclusions/treated:null};}
function group(rows){const groups=new Map();for(const row of rows){const k=row.operator_user_id;const g=groups.get(k)||{id:k,name:row.operator_name||'Operador não identificado',rows:[]};g.rows.push(row);groups.set(k,g);}return [...groups.values()].map(g=>({...g,...totals(g.rows)})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));}
window.sriDailyPerformanceModel=Object.freeze({portfolio,build,totals,group,endOfDay});
const $=id=>document.getElementById(id),roles=['admin','manager','supervisor','assistant'];
let epoch=0,actor='',section=null,checking=false,subscribed=false,aborter;
function node(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;}
function button(root,label,fn){const b=node('button',label,root);b.type='button';b.className='v20-button secondary';b.onclick=fn;return b;}
function select(root,label,id){const l=node('label',label,root);l.className='v20-field';const s=node('select',undefined,l);s.id=id;return s;}
function options(select,list,all){const prior=select.value;select.replaceChildren();for(const [value,label] of [['',all],...list]){const o=node('option',label,select);o.value=value;}if([...select.options].some(o=>o.value===prior))select.value=prior;}
const number=n=>n.toLocaleString('pt-BR',{maximumFractionDigits:1}),percent=n=>n===null?'Sem base de cálculo':number(n)+'%';
async function identity(){const c=await window.sriGetSupabaseClient?.();if(!c)throw Error('Conexão indisponível.');const a=await c.auth.getUser();if(a.error||!a.data?.user)throw Error('Entre novamente.');const p=await c.from('profiles').select('id,role').eq('id',a.data.user.id).single();if(p.error||!roles.includes(p.data?.role))throw Error('Consulta restrita à gestão e supervisão.');return {c,id:a.data.user.id};}
window.sriDailyPerformanceReset=()=>{epoch++;aborter?.abort();actor='';window.sriDailyPerformanceOpen=null;section?.replaceChildren();section=null;};
async function pages(query,alive){const all=[];for(let offset=0;;offset+=500){const q=await query().range(offset,offset+499);if(!alive())return null;if(q.error)throw Error('Não foi possível consultar os dados da carteira.');all.push(...(q.data||[]));if((q.data||[]).length<500)return all;}}
async function read(c,day,alive,signal){
 const fields='id,protocol_number,snapshot_id,team_id,operator_user_id,operational_day,created_at,updated_at,carried_from_task_id,treatment_status,work_status,is_special,base_name,area_name,due_date,due_situation,criticality';
 const tasks=await pages(()=>c.from('daily_operator_tasks').select(fields).eq('operational_day',day).order('id').abortSignal(signal),alive);if(!tasks)return null;
 const known=new Map(tasks.map(t=>[t.id,t])),queried=new Set(known.keys()),ancestors=[];
 let pending=tasks.map(t=>t.carried_from_task_id).filter(Boolean);
 while(pending.length){const ids=[...new Set(pending)].filter(id=>!queried.has(id));if(!ids.length)break;pending=[];
  for(let n=0;n<ids.length;n+=100){const batch=ids.slice(n,n+100);batch.forEach(id=>queried.add(id));const q=await c.from('daily_operator_tasks').select(fields).in('id',batch).abortSignal(signal);if(!alive())return null;if(q.error)throw Error('Não foi possível conferir a continuidade das tratativas.');for(const t of q.data||[]){known.set(t.id,t);ancestors.push(t);if(t.carried_from_task_id)pending.push(t.carried_from_task_id);}}
 }
 const treatments=[],ids=[...known.keys()];for(let n=0;n<ids.length;n+=100){const part=await pages(()=>c.from('daily_operator_treatments').select('id,task_id,action,notes,is_special,created_at,event_context').in('task_id',ids.slice(n,n+100)).lt('created_at',endOfDay(day)).order('created_at').order('id').abortSignal(signal),alive);if(!part)return null;treatments.push(...part);}
 const events=[];let cursor=null;for(;;){const q=await c.rpc('sri_p03_reporting_page',{p_from:day,p_to:day,p_after:cursor}).abortSignal(signal);if(!alive())return null;if(q.error)throw Error('Não foi possível conferir reaberturas do dia.');const batch=q.data||[];events.push(...batch.filter(e=>e.kind==='movement'&&e.action==='TASK_REOPENED'));if(batch.length<400)break;const next=batch.at(-1).cursor;if(!next||next===cursor)throw Error('A consulta histórica não avançou.');cursor=next;}
 const rows=build(tasks,ancestors,treatments,events,day),names=new Map(),teams=new Map();
 for(const [table,field,target,label] of [['profiles','operator_user_id',names,'full_name'],['teams','team_id',teams,'name']]){const keys=[...new Set(rows.map(r=>r[field]).filter(Boolean))];for(let n=0;n<keys.length;n+=100){const q=await c.from(table).select('id,'+label).in('id',keys.slice(n,n+100)).abortSignal(signal);if(!alive())return null;if(q.error)throw Error('Não foi possível consultar operadores e equipes.');for(const r of q.data||[])target.set(r.id,r[label]);}}
 const goal=await c.rpc('sri_p03_goals').abortSignal(signal);if(!alive())return null;
 return {rows:rows.map(r=>({...r,operator_name:names.get(r.operator_user_id)||'Operador não identificado',team_name:teams.get(r.team_id)||'Equipe não registrada'})),goals:goal.error?null:goal.data||[]};
}
function mount(root){section=root;root.replaceChildren();const eyebrow=node('div','ACOMPANHAMENTO E RESULTADOS',root);eyebrow.className='eyebrow';node('h2','Desempenho diário',root).className='v20-hero-title';
 node('p','Posição dos protocolos únicos distribuídos na data, considerando a última atribuição registrada e as tratativas preservadas até o fim do dia. Conclusão na ferramenta não equivale à baixa no SIGO.',root).className='v20-muted';
 const panel=node('div',undefined,root);panel.className='v20-panel';const controls=node('div',undefined,panel);controls.className='sri-pack-controls';
 const dateLabel=node('label','Data',controls);dateLabel.className='v20-field';const day=node('input',undefined,dateLabel);day.id='sri-daily-day';day.type='date';day.value=new Date().toLocaleDateString('sv-SE',{timeZone:zone});day.max=day.value;
 const team=select(controls,'Equipe','sri-daily-team'),operator=select(controls,'Operador','sri-daily-operator');
 const consult=button(controls,'Atualizar resultados',()=>void load());const message=node('p','Selecione a data e consulte os resultados.',panel);message.id='sri-daily-message';message.setAttribute('role','status');
 const stats=node('div',undefined,root);stats.id='sri-daily-stats';stats.className='sri-daily-stats';
 const operators=node('div',undefined,root);operators.className='v20-panel';node('h3','Desempenho por operador',operators);const tableBox=node('div',undefined,operators);tableBox.className='v20-tablewrap';
 const analysis=node('div',undefined,root);analysis.className='sri-daily-analysis';
 const goalBox=node('div',undefined,root);goalBox.className='v20-panel';
 const detail=node('div',undefined,root);detail.className='v20-panel';detail.id='sri-daily-details';
 const searchLabel=node('label','Buscar protocolo',detail);searchLabel.className='v20-field';const search=node('input',undefined,searchLabel);search.type='search';search.id='sri-daily-search';const detailStatus=node('p','',detail);detailStatus.setAttribute('role','status');const detailBox=node('div',undefined,detail);detailBox.className='v20-tablewrap';const paging=node('div',undefined,detail);paging.className='v20-row';
 let data=[],goals=[],loaded=false,request=0,selected='',page=0;const sessionEpoch=epoch;
 function availableOperators(){options(operator,[...new Map(data.filter(r=>!team.value||String(r.team_id||'__missing')===team.value).map(r=>[r.operator_user_id,r.operator_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),'Todos os operadores');}
 function filtered(){return data.filter(r=>(!team.value||String(r.team_id||'__missing')===team.value)&&(!operator.value||r.operator_user_id===operator.value));}
 const selectRows=state=>{selected=state;page=0;draw();detail.scrollIntoView?.({behavior:'smooth',block:'start'});};
 function cell(tr,value){return node('td',value,tr);}
 function goalFor(g){const teamIds=[...new Set(g.rows.map(r=>r.team_id))];return window.sriP03ReportingModel?.selectGoal(goals||[],day.value,teamIds.length===1?teamIds[0]:null,g.id); }
 function draw(){
  const rows=filtered(),t=totals(rows);stats.replaceChildren();tableBox.replaceChildren();analysis.replaceChildren();goalBox.replaceChildren();detailBox.replaceChildren();
  for(const [label,key,filter] of [['Distribuídos','assigned',''],['Com tratativa','treated','treated'],['Concluídos na ferramenta','conclusions','completed'],['Em andamento','progress','progress'],['Sem tratativa','untreated','untreated'],...(t.unknown?[['Contexto insuficiente','unknown','unknown']]:[])]){
   const card=button(stats,label,()=>selectRows(filter));card.className='v20-stat sri-daily-stat';card.replaceChildren();node('span',label,card);node('b',loaded?number(t[key]):'—',card);node('small',loaded&&key!=='assigned'?percent(t.assigned?100*t[key]/t.assigned:null):'Protocolos únicos da data',card);
  }
  if(loaded){const table=node('table',undefined,tableBox);table.className='v20-table';const tr=table.createTHead().insertRow();for(const label of ['Operador','Distribuídos','Com tratativa','Concluídos','Em andamento','Sem tratativa','Meta / conclusão sobre tratados'])node('th',label,tr);
   const body=table.createTBody();for(const g of group(rows)){const tr=body.insertRow();button(cell(tr,''),g.name,()=>{operator.value=g.id;selected='';page=0;draw();detail.scrollIntoView?.({behavior:'smooth'});});cell(tr,number(g.assigned));cell(tr,number(g.treated)+' · '+percent(g.workedRate));cell(tr,number(g.conclusions));cell(tr,number(g.progress));cell(tr,number(g.untreated));const goal=goalFor(g);cell(tr,goals===null?'Metas indisponíveis':g.unknown?'Contexto insuficiente para comparar':!goal?'Meta não definida':'Meta '+percent(Number(goal.percentage))+' · Realizado '+percent(g.conclusionRate)+(g.conclusionRate===null?'':(Number(goal.percentage)>0?' · Atingimento '+percent(100*g.conclusionRate/Number(goal.percentage)):'')+(g.conclusionRate>=Number(goal.percentage)?' · Atingida':' · Abaixo da meta · Faltam '+number(Number(goal.percentage)-g.conclusionRate)+' p.p.')));}
   const total=body.insertRow();for(const value of ['Total',number(t.assigned),number(t.treated)+' · '+percent(t.workedRate),number(t.conclusions),number(t.progress),number(t.untreated),''])cell(total,value);
  }else node('p','Consulte uma data para visualizar os resultados.',tableBox);
  const types=node('div',undefined,analysis);types.className='v20-panel';node('h3','Tipos de tratativa',types);const composition=new Map();for(const r of rows.filter(r=>['completed','progress'].includes(r.state)))composition.set(r.status,(composition.get(r.status)||0)+1);
  for(const [status,count] of composition)button(types,status+' · '+count+' · '+percent(t.treated?100*count/t.treated:null),()=>selectRows('status:'+status));if(!composition.size)node('p','Nenhuma tratativa disponível no recorte.',types);
  const attention=node('div',undefined,analysis);attention.className='v20-panel';node('h3','Situações que exigem atenção',attention);
  for(const [label,filter,predicate] of [['Casos sensíveis','special',r=>r.is_special===true],['Vencidos','overdue',r=>r.due_date&&r.due_date<day.value&&r.state!=='completed'],['Vencem na data','today',r=>r.due_date===day.value&&r.state!=='completed']])button(attention,label+' · '+rows.filter(predicate).length,()=>selectRows(filter));
  node('p','Os vencimentos consideram os prazos registrados. Casos sensíveis podem se sobrepor às demais situações. Os indicadores descrevem a carteira e os registros disponíveis. Avaliação de qualidade depende de critérios de revisão ou auditoria.',attention).className='v20-muted';
  node('h3','Metas',goalBox);node('p',!loaded?'Consulte os resultados para conferir as metas vigentes.':goals===null?'Não foi possível consultar as metas. Atualize os resultados para tentar novamente.':group(rows).some(g=>goalFor(g))?'Comparação individual com a meta vigente. Realizado = concluídos na ferramenta ÷ protocolos com tratativa × 100. A meta mais específica por operador, equipe ou operação tem prioridade.':'Meta não definida. Os resultados estão disponíveis; o atingimento será exibido após o cadastro de uma meta aplicável.',goalBox);
  const chosen=rows.filter(r=>(!search.value.trim()||r.protocol.includes(search.value.trim()))&&(!selected||selected==='treated'&&['completed','progress'].includes(r.state)||selected==='special'&&r.is_special===true||selected==='overdue'&&r.due_date&&r.due_date<day.value&&r.state!=='completed'||selected==='today'&&r.due_date===day.value&&r.state!=='completed'||selected.startsWith('status:')&&r.status===selected.slice(7)||r.state===selected));
  detailStatus.textContent=loaded?chosen.length+' protocolos no detalhamento'+(selected?' · filtro aplicado':''):'Nenhum resultado consultado.';
  const dt=node('table',undefined,detailBox);dt.className='v20-table';const h=dt.createTHead().insertRow();for(const title of ['Protocolo','Operador / equipe','Base / área','Situação','Sinalização / observação'])node('th',title,h);
  const db=dt.createTBody();for(const r of chosen.slice(page*50,page*50+50)){const tr=db.insertRow();cell(tr,r.protocol);cell(tr,r.operator_name+' · '+r.team_name);cell(tr,(r.base_name||'Não registrada')+' · '+(r.area_name||'Não registrada'));cell(tr,r.state==='unknown'?'Contexto histórico insuficiente':r.status);const td=cell(tr,r.is_special===true?'Caso sensível':r.is_special===null?'Sinalização não registrada':'Sem sinalização especial');if(r.notes||r.recorded_at){const exp=node('details',undefined,td);node('summary','Ver observação',exp);node('p',r.notes||'Nenhuma observação registrada.',exp).className='sri-treatment-note';node('p',(r.actor_name||'Autor não registrado')+(r.recorded_at?' · '+new Date(r.recorded_at).toLocaleString('pt-BR',{timeZone:zone}):''),exp);}}
  previous.disabled=page===0;next.disabled=(page+1)*50>=chosen.length;
 }
 const previous=button(paging,'Anterior',()=>{page--;draw();}),next=button(paging,'Próxima',()=>{page++;draw();});button(paging,'Limpar detalhamento',()=>{selected='';search.value='';page=0;draw();});
 async function load(){const priorTeam=team.value,priorOperator=operator.value;aborter?.abort();aborter=new AbortController();const seq=++request,signal=aborter.signal;data=[];goals=[];loaded=false;selected='';page=0;options(team,[],'Todas as equipes');availableOperators();draw();consult.disabled=true;message.textContent='Consultando carteira, tratativas e metas…';
  const alive=()=>seq===request&&sessionEpoch===epoch&&root.isConnected;
  try{if(!/^\d{4}-\d{2}-\d{2}$/.test(day.value)||day.value>day.max)throw Error('Selecione uma data válida até hoje.');const auth=await identity();if(!alive()||auth.id!==actor)return;const result=await read(auth.c,day.value,alive,signal);if(!result||!alive())return;data=result.rows;goals=result.goals;loaded=true;options(team,[...new Map(data.map(r=>[r.team_id||'__missing',r.team_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),'Todas as equipes');if([...team.options].some(o=>o.value===priorTeam))team.value=priorTeam;availableOperators();if([...operator.options].some(o=>o.value===priorOperator))operator.value=priorOperator;draw();message.textContent=data.length?number(data.length)+' protocolos únicos consultados · atualizado às '+new Date().toLocaleTimeString('pt-BR',{timeZone:zone})+(data.some(r=>r.state==='unknown')?' · Há registros sem contexto histórico suficiente.':''):'Nenhuma atribuição disponível para sua conta nesta data.';}catch(error){if(alive()){loaded=false;data=[];draw();message.textContent=error.message;}}finally{if(alive())consult.disabled=false;}}
 day.onchange=()=>{request++;aborter?.abort();data=[];loaded=false;selected='';page=0;consult.disabled=false;options(team,[],'Todas as equipes');availableOperators();draw();message.textContent='Data alterada. Atualize os resultados.';};team.onchange=()=>{availableOperators();selected='';page=0;draw();};operator.onchange=()=>{selected='';page=0;draw();};search.oninput=()=>{page=0;draw();};
 options(team,[],'Todas as equipes');availableOperators();draw();root.dataset.dailyMounted='true';
 window.sriDailyPerformanceOpen=()=>{if(!loaded&&!consult.disabled)void load();};
}
async function refresh(){if(checking)return;checking=true;const e=epoch;try{const a=await identity();if(e!==epoch)return;if(actor!==a.id){window.sriDailyPerformanceReset();actor=a.id;}const root=$('v20-daily-performance');if(root&&section!==root)mount(root);if(root?.classList.contains('active'))window.sriDailyPerformanceOpen?.();if(!subscribed){a.c.auth.onAuthStateChange(event=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)){window.sriDailyPerformanceReset();setTimeout(refresh,0);}});subscribed=true;}}catch(_){if(actor)window.sriDailyPerformanceReset();}finally{checking=false;}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void refresh());else void refresh();setInterval(refresh,15000);
})();
