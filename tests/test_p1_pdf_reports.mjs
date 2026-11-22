import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const js=fs.readFileSync(new URL('../sri-prd-painel.js',import.meta.url),'utf8');
new vm.Script(js,{filename:'sri-prd-painel.js'});
assert.match(js,/@page\{size:A4 portrait;margin:13mm/);
assert.match(js,/thead\{display:table-header-group\}/);
assert.match(js,/tr\{break-inside:avoid\}/);
assert.doesNotMatch(js,/\.insert\(|\.update\(|\.delete\(/);

const start=js.indexOf('function reportRows(){');
const end=js.indexOf("if(document.readyState==='loading')");
assert.ok(start>0&&end>start,'Não foi possível isolar a implementação real dos relatórios');
const methods=js.slice(start,end);
class Node {
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=String(text);this.className='';this.selectedOptions=[];}
  append(...kids){this.children.push(...kids);}
  replaceChildren(...kids){this.children=[...kids];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(v){this._text=String(v);this.children=[];}
}
const elements={
 'sri-prd-from':{value:'2026-11-18'},'sri-prd-to':{value:'2026-11-22'},
 'sri-prd-team':{value:'',selectedOptions:[{textContent:'Todas as equipes'}]},
 'sri-prd-shift':{value:'',selectedOptions:[{textContent:'Todos os turnos'}]},
 'sri-prd-report-type':{value:'executivo'},
 'sri-prd-preview':new Node('div'),
 'sri-prd-print':new Node('article')
};
const rows=[
 {operational_day:'2026-11-22',team_name:'Equipe Leste',shift_label:'Manhã',protocolos_consolidados:100,protocolos_monitorados:30,tarefas_publicadas:20,tratativas_concluidas:10,divergencias_informativas:2,protocolos_sinalizados:5,backlog:7,revisao_distribuicao:3,status_turno:'closed',status_dia:'closed'},
 {operational_day:'2026-11-22',team_name:'Equipe Norte',shift_label:'Tarde',protocolos_consolidados:50,protocolos_monitorados:10,tarefas_publicadas:8,tratativas_concluidas:4,divergencias_informativas:1,protocolos_sinalizados:2,backlog:3,revisao_distribuicao:2,status_turno:'reopened',status_dia:'closed_with_pending'},
 {operational_day:'2026-11-21',team_name:'Equipe Leste',shift_label:'Noite',protocolos_consolidados:25,protocolos_monitorados:5,tarefas_publicadas:3,tratativas_concluidas:1,divergencias_informativas:0,protocolos_sinalizados:1,backlog:2,revisao_distribuicao:4,status_turno:'open',status_dia:'open'}
];
const state={loaded:true,authorized:true,fetching:false,limitReached:false,loadedFrom:'2026-11-18',loadedTo:'2026-11-22',all:rows,visible:rows};
const messages=[],window={print:()=>{window.printCalls++;},printCalls:0};
const ctx={
 state,window,Set,Date,Intl,Number,String,Array,
 byId:id=>elements[id],
 el:(tag,cls,text)=>{let node=new Node(tag,text);node.className=cls||'';return node;},
 fmt:v=>new Intl.NumberFormat('pt-BR').format(Number(v)||0),
 total:(list,key)=>list.reduce((n,r)=>n+(Number(r[key])||0),0),
 status:(message,error)=>messages.push({message,error}),
 document:{body:{classList:{add(){}}}}
};
const api=vm.runInNewContext(methods+';({reportRows,reportConfig,reportSummary,readable,buildTable,preview,printReport})',ctx);
const numericTypes=['executivo','equipe','divergencias'];
for(const type of ['executivo','equipe','divergencias','fechamento']){
 elements['sri-prd-report-type'].value=type;
 api.preview();api.printReport();
 const report=elements['sri-prd-print'];
 assert.equal(window.printCalls,['executivo','equipe','divergencias','fechamento'].indexOf(type)+1);
 assert.match(report.textContent,/SAC Retorno Intelligence 2.0/);
 assert.match(report.textContent,/2026-11-18 a 2026-11-22/);
 assert.match(report.textContent,/não representam protocolos únicos do dia/);
 assert.equal(report.children.find(x=>x.tag==='table').children[1].children.length,rows.length+(numericTypes.includes(type)?1:0));
 if(numericTypes.includes(type))assert.match(report.textContent,/TOTAL/);
 if(type==='executivo'){assert.match(report.textContent,/Consolidados: 175/);assert.match(report.textContent,/Monitorados: 45/);assert.match(report.textContent,/Backlog: 12/);}
 if(type==='equipe'){assert.match(report.textContent,/Tarefas: 31/);assert.match(report.textContent,/Tratativas: 15/);}
 if(type==='divergencias'){assert.match(report.textContent,/Alertas: 3/);assert.match(report.textContent,/Sinalizados: 8/);}
 if(type==='fechamento'){assert.match(report.textContent,/Turnos fechados: 1 de 3/);assert.match(report.textContent,/Dias com fechamento: 1/);assert.match(report.textContent,/Fechado com pendências/);assert.doesNotMatch(report.textContent,/TOTAL/);}
}
const before=window.printCalls;
elements['sri-prd-from'].value='2026-11-01';
api.preview();api.printReport();
assert.equal(window.printCalls,before,'Mudança de data sem atualização NÃO pode imprimir');
assert.match(messages.at(-1).message,/clique em Atualizar/);
assert.match(elements['sri-prd-preview'].textContent,/período foi alterado/);
elements['sri-prd-from'].value='2026-11-18';
state.limitReached=true;
api.printReport();assert.equal(window.printCalls,before,'Atingir limite NÃO pode imprimir PDF parcial');
assert.match(messages.at(-1).message,/limite de 1.500/);
state.limitReached=false;state.fetching=true;
api.printReport();assert.equal(window.printCalls,before,'Impressão durante consulta NÃO é permitida');
state.fetching=false;
const lots=Array.from({length:225},(_,i)=>({...rows[0],shift_label:'Turno '+String(i).padStart(3,'0')}));
state.all=lots;state.visible=lots;
elements['sri-prd-report-type'].value='executivo';
api.preview();assert.equal(elements['sri-prd-preview'].children[1].children[1].children.length,200,'prévia mostra apenas 200');
api.printReport();assert.equal(elements['sri-prd-print'].children.find(x=>x.tag==='table').children[1].children.length,226,'PDF contém todos os 225 registros + 1 linha de total');
console.log('PASS: 4 modelos, filtros, somas, status, limite de consulta e não emissão de PDF desatualizado (dados sintéticos).');


if(process.env.SRI_RENDER_PDF_FIXTURES==='1'){
 const {execFileSync}=await import('node:child_process');
 const path=await import('node:path');
 const outDir=new URL('../.tmp/p1-pdf/',import.meta.url);
 fs.mkdirSync(outDir,{recursive:true});
 const c=/\'(@media print\{@page\{size:A4 portrait;margin:13mm\}[^']*)\'/.exec(js);
 assert.ok(c,'CSS de impressão original não encontrado');
 const css=c[1];
 const escaped=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 function htmlNode(node){
  const cl=node.className?' class="'+escaped(node.className)+'"':'';
  const id=node.tag==='article'?' id="sri-prd-print"':'';
  return '<'+node.tag+id+cl+'>'+escaped(node._text)+node.children.map(htmlNode).join('')+'</'+node.tag+'>';
 }
 const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(x=>fs.existsSync(x));
 assert.ok(chrome,'Chrome/Chromium ausente do runner');
 state.visible=lots;state.all=lots;state.limitReached=false;state.fetching=false;
 for(const type of ['executivo','equipe','divergencias','fechamento']){
  elements['sri-prd-report-type'].value=type;
  api.printReport();
  const article=elements['sri-prd-print'];
  const fixtureHtml='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Teste A4 '+type+'</title><style>#sri-prd-print{display:none}'+css+'</style></head><body class="sri-prd-print-mode">'+htmlNode(article)+'</body></html>';
  const htmlPath=path.resolve(new URL(type+'.html',outDir).pathname);
  const pdfPath=path.resolve(new URL(type+'.pdf',outDir).pathname);
  fs.writeFileSync(htmlPath,fixtureHtml,'utf8');
  execFileSync(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--no-pdf-header-footer','--disable-background-networking','--user-data-dir=/tmp/sri-pdf-'+type,'--print-to-pdf='+pdfPath,'file://'+htmlPath],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
  assert.ok(fs.statSync(pdfPath).size>3000,type+' PDF está vazio');
  const info=execFileSync('pdfinfo',[pdfPath],{encoding:'utf8',timeout:20000});
  assert.match(info,/\(A4\)/,type+' não tem tamanho A4');
  const pageMatch=info.match(/^Pages:\s+(\d+)/m);assert.ok(pageMatch&&Number(pageMatch[1])>1,'Deve paginar 225 registros');
  const extracted=execFileSync('pdftotext',[pdfPath,'-'],{encoding:'utf8',timeout:20000});
  assert.match(extracted,/SAC Retorno Intelligence 2\.0/);
  assert.match(extracted,/Equipe Leste/);
  if(type!=='fechamento')assert.match(extracted,/TOTAL/);
  console.log('PASS PDF A4 '+type+': '+pageMatch[1]+' páginas, '+fs.statSync(pdfPath).size+' bytes.');
 }
}
