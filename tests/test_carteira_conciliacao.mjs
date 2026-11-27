import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),sql=read('sql/2026-11-24_sri_carteira_v2.sql'),cloud=read('assets/sri-cloud-treatments.js'),theme=read('assets/sri-integrated-improvements.js');

let passed=0;
function check(condition,name){if(!condition)throw Error(name);passed++;console.log('PASS '+name)}
function snippet(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);if(start<0||end<0)throw Error('Trecho não encontrado: '+a);return html.slice(start,end)}
let compiled=0;
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=|type=["'](?:module|application\/json)/i.test(m[1])&&m[2].trim()){new Function(m[2]);compiled++}}
new Function(cloud);new Function(theme);check(compiled===8,'8 scripts internos e 2 externos compilam');
const compare=new Function(snippet('function v113NewTotals(){','function v113Record(){')+'\nreturn v113Compare;')();
const mk=(s,p='SAC + ATIVO')=>({s,p,scope12:s==='12',w:'SAC RETORNO',a:'RETORNO'});
const from={day:'2026-11-24',time:'2026-11-24T10:00:00Z',rows:{a:mk('12'),b:mk('12'),c:mk('12'),d:mk('11')}};
const to={day:'2026-11-24',time:'2026-11-24T11:00:00Z',rows:{a:mk('11'),b:{...mk('','ATIVO'),scope12:true},e:mk('12')}};
const comp=compare(from,to);
check(comp.moves.find(m=>m.id==='a').type==='mudanca_status','12 → 11 não é ausência');
check(comp.moves.find(m=>m.id==='b').type==='somente_ativo','presença somente no ATIVO não é ausência');
check(comp.moves.find(m=>m.id==='c').sources==='AUSENTE','ausência detectada nas duas fontes');
check(comp.moves.find(m=>m.id==='d').type==='ausente_outro','ausência de outro CD separada');
const getStatus=new Function('window','distStatuses',snippet('function distStatus(id){','function distNormalizeStatus')+'\nreturn distStatus;');
const status=getStatus({sriGetSavedDistributionContext:()=>({snapshotId:'test'}),sriCloudTreatment:id=>id==='p'?{treatment_status:'LIGAÇÃO'}:undefined},{p:{status:'PENDENTE'},q:{status:'FILIAL'}});
check(status('p')==='LIGAÇÃO','fonte central vence cache legado');check(status('q')==='','status fora do escopo não usa cache legado');
const saveSource=snippet('async function saveTreatment(){','// Ao publicar uma nova distribuição');
const runner=new Function('check', 'return (async function(){\n'+
"let taskRows=[{id:'1',updated_at:'v1',treatment_status:null},{id:'2',updated_at:'v1',treatment_status:null}],currentTask=taskRows[0],operatorEpoch=0,operatorLoadSeq=0,savePending=null,operatorFingerprint='',TREATMENT_STATUSES=['LIGAÇÃO','PENDENTE','E-MAIL'];let choice='LIGAÇÃO',notes='observação',lastError=null,nextError=false,ids=[],number=0,historyCalls=0,opened=null,closed=0,rendered=0;const crypto={randomUUID:()=>String(++number)};const window={sriToast:()=>{},sriOperatorReviewRefresh:()=>{}};const $=id=>({value:id.includes('notes')?notes:choice});const client={rpc:async(name,p)=>{ids.push(p.p_request);if(nextError){nextError=false;return {error:{message:'Falha de rede'}}}return {data:{treatment_status:p.p_action,work_status:'in_progress',updated_at:'v'+(ids.length+1)}}}};const session=async()=>({client,profile:{role:'operator'},user:{id:'u'}});const packFilteredRows=()=>taskRows;const closeTreatment=()=>{currentTask=null;closed++};const renderPackTasks=()=>rendered++;const stateMsg=()=>{};const openTreatment=(r)=>{currentTask=r;opened=r.id};const loadHistory=()=>{historyCalls++;return new Promise(()=>{})};\n"+saveSource+
"await saveTreatment();check(taskRows[0].treatment_status==='LIGAÇÃO'&&closed===1&&rendered===1,'salva e libera sem aguardar histórico');currentTask=taskRows[0];choice='PENDENTE';await saveTreatment();check(taskRows[0].treatment_status==='PENDENTE'&&opened===null&&currentTask===null&&closed===2,'salva e retorna à carteira sem abrir outro protocolo');currentTask=taskRows[1];choice='E-MAIL';nextError=true;try{await saveTreatment()}catch(e){lastError=e}check(!!lastError&&currentTask.id==='2'&&notes==='observação','falha mantém formulário e demanda');const pending=ids.at(-1);await saveTreatment();check(ids.at(-1)===pending&&taskRows[1].treatment_status==='E-MAIL','repetição usa a mesma chave idempotente');check(historyCalls===3,'histórico solicitado sem bloquear');\n})()"
);
await runner(check);
check(sql.includes('NOT p_presence ? t.protocol_number')&&sql.includes('AUSENTE SAC + ATIVO'),'SQL compara presença nas duas bases');
check(sql.includes("r.decision='return' AND r.review_responded_at IS NOT NULL")&&sql.includes("'STATUS_REVIEW_ANSWERED'"),'revisão e conclusão auditadas');
check(sql.includes("pg_advisory_xact_lock(hashtextextended('sri-result-day:'")&&sql.includes('t.updated_at IS DISTINCT FROM p_expected'),'serialização de publicação e concorrência');
check(sql.includes('REVOKE ALL ON private.sri_status_reconciliation FROM PUBLIC,anon,authenticated'),'tabela privada não exposta');
check(sql.includes('sri_my_treatment_history')&&sql.includes('h.actor_id=auth.uid()'),'histórico limitado ao autor');
check(cloud.includes('version===mutationVersion')&&cloud.includes('sri_reconciliation_counts'),'proteção contra consulta antiga e indicadores');
check(html.includes('presença não foi confirmada')||html.includes('conciliação de presença não foi confirmada'),'falha de conciliação não é sucesso silencioso');
check(theme.includes("dataset.sriTheme='light'"),'modo escuro desabilitado');
console.log('TOTAL '+passed);
