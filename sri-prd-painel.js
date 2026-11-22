/* SAC Retorno Intelligence 2.0 - Painel central/relatorios A4.
 * Fonte exclusiva: sri_v_daily_operational_metrics (security_invoker + RLS).
 * Nao salva CSVs, nao altera distribuicoes, nao encerra turnos.
 */
(function () {
'use strict';
var state={all:[],visible:[],loaded:false,authorized:false,client:null,role:null,fetching:false,generation:0};
var lastIdentity=null;
function hideSensitive(){state.generation++;state.all=[];state.visible=[];state.loaded=false;state.authorized=false;state.role=null;['sri-prd-analytics','sri-prd-reports'].forEach(function(id){var p=document.getElementById(id);if(p)p.style.display='none'});['sri-prd-kpis','sri-prd-bars','sri-prd-preview','sri-prd-print'].forEach(function(id){var p=document.getElementById(id);if(p)p.replaceChildren()})}

function byId(x){return document.getElementById(x)}
function el(tag,cls,text){var x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x}
function fmt(v){return new Intl.NumberFormat('pt-BR').format(Number(v)||0)}
function today(offset){var d=new Date();d.setDate(d.getDate()+(offset||0));return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(d)}
function status(text,error){['sri-prd-message','sri-prd-report-message'].forEach(function(id){var p=byId(id);if(p){p.textContent=text;p.dataset.error=error?'true':'false'}})}
function selectNode(id,label,opts){var l=el('label','sri-prd-field');l.append(el('span','',label));var s=el('select');s.id=id;s.setAttribute('aria-label',label);(opts||[]).forEach(function(p){var o=el('option','',p[1]);o.value=p[0];s.append(o)});l.append(s);return l}
function fieldDate(id,label,value){var l=el('label','sri-prd-field');l.append(el('span','',label));var d=el('input');d.type='date';d.id=id;d.value=value;l.append(d);return l}
function button(text,act,secondary){var b=el('button','sri-prd-btn'+(secondary?' secondary':''),text);b.type='button';b.addEventListener('click',act);return b}
function panel(title,desc){var x=el('section','sri-prd-panel');x.append(el('h3','',title),el('p','sri-prd-sub',desc));return x}
function initialize(){
 if(byId('sri-prd-analytics')||!byId('intelligence')||!byId('reports'))return;
 var css=el('style');css.textContent=[
 '#sri-prd-analytics,#sri-prd-reports{margin:12px 0 22px}',
 '.sri-prd-panel{border:1px solid #c7d7ed;border-radius:14px;background:#fff;padding:18px;margin-bottom:14px;color:#17314e}',
 '.sri-prd-panel h3{margin:0 0 6px;color:#0b45b7;font-size:18px}',
 '.sri-prd-sub{font-size:13px;color:#60768e;margin:4px 0 13px}',
 '.sri-prd-filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap}',
 '.sri-prd-field{display:grid;gap:5px;font-weight:650;font-size:12px;color:#274b72;min-width:140px}',
 '.sri-prd-field input,.sri-prd-field select{background:white;border:1px solid #cad7e7;border-radius:8px;padding:9px;font-size:13px;color:#193b5f;max-width:220px}',
 '.sri-prd-btn{border:0;border-radius:8px;background:#0b45b7;color:white;font-weight:650;padding:10px 14px;cursor:pointer;min-height:38px}',
 '.sri-prd-btn.secondary{background:#eaf1fc;color:#0b45b7}',
 '.sri-prd-btn:focus-visible,.sri-prd-chart-row:focus-visible{outline:3px solid #ff8b00;outline-offset:2px}',
 '.sri-prd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:14px 0}',
 '.sri-prd-kpi{background:#f4f8ff;border:1px solid #e1eaf8;border-radius:10px;padding:12px}',
 '.sri-prd-kpi strong{font-size:24px;color:#0b45b7;display:block}',
 '.sri-prd-kpi small{color:#60768e;font-size:11px}',
 '.sri-prd-chart-row{margin:11px 0;display:grid;grid-template-columns:minmax(150px,1fr) minmax(120px,3fr) 75px;align-items:center;gap:8px;font-size:12px}',
 '.sri-prd-bar{height:14px;background:#eaf1fc;border-radius:6px;overflow:hidden}',
 '.sri-prd-fill{display:block;height:100%;background:#0b45b7}',
 '.sri-prd-chart-row strong{text-align:right}',
 '.sri-prd-summary{font-size:12px;color:#526c8b;margin-top:10px}',
 '.sri-prd-table-wrap{max-width:100%;overflow:auto}',
 '.sri-prd-table{border-collapse:collapse;width:100%;font-size:12px}',
 '.sri-prd-table th,.sri-prd-table td{border-bottom:1px solid #e3eaf3;padding:8px;text-align:left;white-space:normal}',
 '.sri-prd-table th{color:#0b45b7;background:#edf4ff}',
 '#sri-prd-message[data-error=true],#sri-prd-report-message[data-error=true]{color:#b42318}',
 '#sri-prd-print{display:none}',
 '@media print{@page{size:A4 portrait;margin:13mm}body.sri-prd-print-mode>*:not(#sri-prd-print){display:none!important}body.sri-prd-print-mode #sri-prd-print{display:block!important;position:static!important;width:100%;background:white;color:black;font:10pt Arial,sans-serif}body.sri-prd-print-mode #sri-prd-print h1{font-size:16pt;color:#0b45b7}body.sri-prd-print-mode #sri-prd-print table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed}body.sri-prd-print-mode #sri-prd-print th,body.sri-prd-print-mode #sri-prd-print td{border:1px solid #ccc;padding:5px;overflow-wrap:anywhere}body.sri-prd-print-mode #sri-prd-print tr{break-inside:avoid}body.sri-prd-print-mode #sri-prd-print thead{display:table-header-group}body.sri-prd-print-mode #sri-prd-print .sri-prd-print-meta{color:#555;margin-bottom:10px}}'
 ].join('');document.head.append(css);
 var a=panel('Indicadores centralizados · Supabase','Gráficos e totais calculados a partir da apuração mais recente por equipe/data/turno. Dados sujeitos às permissões de acesso.');
 a.id='sri-prd-analytics';a.style.display='none';
 var filters=el('div','sri-prd-filters');filters.append(fieldDate('sri-prd-from','De',today(-7)),fieldDate('sri-prd-to','Até',today()),selectNode('sri-prd-team','Equipe',[['','Todas as equipes']]),selectNode('sri-prd-shift','Turno',[['','Todos os turnos']]),button('Atualizar',load),button('Limpar filtros',reset,true));
 a.append(filters);
 var k=el('div','sri-prd-kpis');k.id='sri-prd-kpis';a.append(k);
 var bars=el('div');bars.id='sri-prd-bars';a.append(bars);
 var msg=el('p','sri-prd-summary','Faça login como Supervisor/Gestor e clique em Atualizar.');msg.id='sri-prd-message';msg.setAttribute('role','status');a.append(msg);
 byId('intelligence').insertBefore(a,byId('intelligence').firstChild);
 var r=panel('Relatórios operacionais A4 · Dados sincronizados','Selecione a finalidade, confira a prévia e imprima em A4 (Salvar como PDF no navegador). Não há formato 16:9.');
 r.id='sri-prd-reports';r.style.display='none';
 var controls=el('div','sri-prd-filters');
 controls.append(selectNode('sri-prd-report-type','Finalidade',[['executivo','Executivo'],['equipe','Operação por equipe'],['divergencias','Conferência e divergências'],['fechamento','Fechamento operacional']]),
 button('Gerar prévia',preview),button('Imprimir / PDF A4',printReport));
 r.append(controls);
 var hint=el('p','sri-prd-summary','Os filtros de data, equipe e turno são os mesmos do painel de indicadores.');hint.id='sri-prd-report-message';r.append(hint);
 var table=el('div','sri-prd-table-wrap');table.id='sri-prd-preview';r.append(table);
 byId('reports').insertBefore(r,byId('reports').firstChild);
 ['sri-prd-team','sri-prd-shift'].forEach(function(id){byId(id).addEventListener('change',render)});
 byId('sri-prd-report-type').addEventListener('change',preview);
 var print=el('article');print.id='sri-prd-print';document.body.append(print);
 window.addEventListener('afterprint',function(){document.body.classList.remove('sri-prd-print-mode')});
 document.addEventListener('click',function(e){if(e.target.closest('[data-tab="intelligence"],[data-tab="reports"]'))setTimeout(checkRole,30)});
 checkRole();
 if(window.sriGetSupabaseClient)window.sriGetSupabaseClient().then(function(c){c.auth.onAuthStateChange(function(ev,session){var next=session?.user?.id||null;if(next!==lastIdentity||ev==='SIGNED_OUT'){lastIdentity=next;hideSensitive()}if(next&&ev!=='SIGNED_OUT')setTimeout(checkRole,0)})}).catch(function(){hideSensitive()});
 window.addEventListener('focus',checkRole);
}
async function checkRole(){
 if(!window.sriGetSupabaseClient)return;
 try{
 var client=await window.sriGetSupabaseClient(),a=await client.auth.getUser();
 if(a.error||!a.data?.user){hideSensitive();return}
 var p=await client.from('profiles').select('role').eq('id',a.data.user.id).single();
 if(p.error||!p.data){hideSensitive();return}
 var allowed=['admin','manager','supervisor'].includes(p.data.role);
 if(!allowed){hideSensitive();return}
 state.client=client;state.role=p.data.role;state.authorized=allowed;
 [byId('sri-prd-analytics'),byId('sri-prd-reports')].forEach(function(node){if(node)node.style.display=allowed?'':'none'});
 if(allowed&&!state.loaded&&!state.fetching)await load();
 }catch(e){status('Não foi possível validar a sessão: '+(e.message||'erro de acesso'),true)}
}
function reset(){byId('sri-prd-from').value=today(-7);byId('sri-prd-to').value=today();byId('sri-prd-team').value='';byId('sri-prd-shift').value='';load()}
function uniqueItems(rows,key,label){var m=new Map();rows.forEach(function(r){if(r[key]!==null&&r[key]!==undefined&&String(r[key]))m.set(String(r[key]),String(r[label]||r[key]))});return [...m.entries()].sort(function(a,b){return a[1].localeCompare(b[1],'pt-BR')})}
function options(id,values,anyText){var s=byId(id),was=s.value;s.replaceChildren();var o=el('option','',anyText);o.value='';s.append(o);values.forEach(function(t){var option=el('option','',t[1]);option.value=t[0];s.append(option)});s.value=values.some(function(t){return t[0]===was})?was:''}
async function load(){
 if(state.fetching||!state.authorized||!state.client)return;
 var start=byId('sri-prd-from').value,end=byId('sri-prd-to').value;
 if(!start||!end||start>end){status('Informe um intervalo válido.',true);return}
 var generation=state.generation;state.fetching=true;status('Consultando apurações consolidadas...',false);
 try{
 var response=await state.client.from('sri_v_daily_operational_metrics').select('*').gte('operational_day',start).lte('operational_day',end).order('operational_day',{ascending:false}).limit(1500);
 if(generation!==state.generation||!state.authorized)return;
 if(response.error)throw response.error;
 state.all=response.data||[];state.loaded=true;
 options('sri-prd-team',uniqueItems(state.all,'team_id','team_name'),'Todas as equipes');
 options('sri-prd-shift',uniqueItems(state.all,'shift_label','shift_label'),'Todos os turnos');
 render();status(state.all.length===1500?'Limite de 1.500 apurações atingido; reduza o intervalo para um relatório completo.':'Consulta concluída. Nenhum arquivo SAC/ATIVO foi transferido.',false);
 }catch(e){status('Não foi possível consultar indicadores: '+(e.message||'falha de comunicação')+'. Verifique conexão e RLS.',true)}
 finally{state.fetching=false}
}
function chosen(){var team=byId('sri-prd-team').value,shift=byId('sri-prd-shift').value;return state.all.filter(function(x){return (!team||x.team_id===team)&&(!shift||x.shift_label===shift)})}
function total(rows,key){return rows.reduce(function(n,r){return n+(Number(r[key])||0)},0)}
function addKpi(parent,name,value){var div=el('div','sri-prd-kpi');div.append(el('strong','',fmt(value)),el('small','',name));parent.append(div)}
function render(){
 state.visible=chosen();
 var rows=state.visible;
 var kp=byId('sri-prd-kpis'),bars=byId('sri-prd-bars');if(!kp||!bars)return;kp.replaceChildren();bars.replaceChildren();
 addKpi(kp,'Apurações (equipe/turno)',rows.length);
 addKpi(kp,'Protocolos consolidados · soma por turno',total(rows,'protocolos_consolidados'));
 addKpi(kp,'Carteira monitorada · soma por turno',total(rows,'protocolos_monitorados'));
 addKpi(kp,'Tarefas publicadas',total(rows,'tarefas_publicadas'));
 addKpi(kp,'Alertas de divergência',total(rows,'divergencias_informativas'));
 var cats=[['Prazo hoje','vencem_hoje'],['Backlog','backlog'],['Faixa D6','sla_d6'],['Protocolos sinalizados','protocolos_sinalizados']];
 var max=Math.max(1,...cats.map(function(x){return total(rows,x[1])}));
 cats.forEach(function(x){
 var n=total(rows,x[1]),label=x[0]+': '+fmt(n)+' ocorrências nas '+fmt(rows.length)+' apurações';
 var bar=el('div','sri-prd-chart-row');bar.tabIndex=0;bar.title=label;bar.setAttribute('role','img');bar.setAttribute('aria-label',label);
 bar.append(el('span','',x[0]));
 var base=el('div','sri-prd-bar'),fill=el('span','sri-prd-fill');fill.style.width=(100*n/max).toFixed(2)+'%';base.append(fill);bar.append(base,el('strong','',fmt(n)));bars.append(bar);
 });
 var small=el('p','sri-prd-summary','Valores exibidos integralmente e acessíveis por mouse, teclado ou toque. Os totais somam apurações por turno e NÃO representam protocolos únicos do dia.');bars.append(small);
 preview();
}
function reportRows(){return state.visible.slice().sort(function(a,b){return a.operational_day===b.operational_day?a.team_name.localeCompare(b.team_name,'pt-BR'):b.operational_day.localeCompare(a.operational_day)})}
function reportConfig(type){
 if(type==='equipe')return {title:'Operação por equipe',columns:[['operational_day','Data'],['team_name','Equipe'],['shift_label','Turno'],['protocolos_monitorados','Monitorados'],['tarefas_publicadas','Tarefas'],['tratativas_concluidas','Tratativas']]};
 if(type==='divergencias')return {title:'Conferência e divergências',columns:[['operational_day','Data'],['team_name','Equipe'],['shift_label','Turno'],['protocolos_consolidados','Consolidados'],['divergencias_informativas','Alertas'],['protocolos_sinalizados','Sinalizados']]};
 if(type==='fechamento')return {title:'Fechamento operacional',columns:[['operational_day','Data'],['team_name','Equipe'],['shift_label','Turno'],['revisao_distribuicao','Revisão'],['status_turno','Turno'],['status_dia','Dia']]};
 return {title:'Resumo executivo',columns:[['operational_day','Data'],['team_name','Equipe'],['shift_label','Turno'],['protocolos_consolidados','Consolidados'],['protocolos_monitorados','Monitorados'],['backlog','Backlog']]};
}
function readable(key,value){if(key==='operational_day'){var v=String(value||'');return v.length===10?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):v}if(typeof value==='number')return fmt(value);if(value===null||value===undefined)return '—';return String(value)}
function buildTable(rows,conf,limit){var table=el('table','sri-prd-table');var head=el('thead'),hr=el('tr');conf.columns.forEach(function(c){hr.append(el('th','',c[1]))});head.append(hr);table.append(head);var body=el('tbody');rows.slice(0,limit).forEach(function(r){var tr=el('tr');conf.columns.forEach(function(c){tr.append(el('td','',readable(c[0],r[c[0]])))});body.append(tr)});table.append(body);return table}
function preview(){
 if(!state.loaded)return;
 var conf=reportConfig(byId('sri-prd-report-type').value),rows=reportRows(),area=byId('sri-prd-preview');area.replaceChildren();
 area.append(el('p','sri-prd-summary',conf.title+' · '+fmt(rows.length)+' apuração(ões) filtrada(s). Prévia das primeiras 200. PDF inclui todas as apurações carregadas.'));
 area.append(buildTable(rows,conf,200));
}
function printReport(){
 if(!state.authorized||!state.loaded){status('Consulte primeiro os dados do Supabase.',true);return}
 var rows=reportRows();if(!rows.length){status('Não há apurações nos filtros escolhidos.',true);return}
 if(state.all.length>=1500){status('Reduza o intervalo antes de gerar PDF completo: há mais de 1.500 apurações.',true);return}
 var type=byId('sri-prd-report-type').value,conf=reportConfig(type),article=byId('sri-prd-print');article.replaceChildren();
 article.append(el('h1','', 'SAC Retorno Intelligence 2.0 · '+conf.title));
 article.append(el('p','sri-prd-print-meta','Gerado em '+new Date().toLocaleString('pt-BR')+' · '+byId('sri-prd-from').value+' a '+byId('sri-prd-to').value+' · Equipe: '+(byId('sri-prd-team').selectedOptions[0]?.textContent||'Todas')+' · Turno: '+(byId('sri-prd-shift').selectedOptions[0]?.textContent||'Todos')));
 article.append(el('p','sri-prd-print-meta','Apurações: '+fmt(rows.length)+' · Monitorados (soma de turnos): '+fmt(total(rows,'protocolos_monitorados'))+' · Divergências: '+fmt(total(rows,'divergencias_informativas'))+'. Soma por turno, não protocolos únicos do dia.'));
 article.append(buildTable(rows,conf,rows.length));article.append(el('p','sri-prd-print-meta','Fonte: Supabase · visao de indicadores com RLS. Este relatório não substitui encerramento do protocolo no SIGO.'));
 document.body.classList.add('sri-prd-print-mode');window.print();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
