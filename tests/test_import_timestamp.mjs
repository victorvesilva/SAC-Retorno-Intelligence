import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const requirements=[
 "ÚLTIMA IMPORTAÇÃO SAC + ATIVO <strong id=\"update-clock\"",
 "ui.live?sriFormatImportMoment(ui.quality?.importedAt):'—'",
 "ui.quality.importedAt=new Date().toISOString();setProgress('Dashboard atualizado com sucesso.'",
 "time:sriFormatImportMoment(ui.quality.importedAt)",
 "importedAt:ui.quality?.importedAt||null,reference:ui.reference,quality:ui.quality,source:ui.source",
 "ui.quality.importedAt=payload.importedAt||payload.quality?.importedAt||null",
 "activeExtractionInfo.time=sriFormatImportMoment(ui.quality.importedAt)",
 "SAC + ATIVO atualizados em: ",
];
for(const text of requirements)assert.ok(html.includes(text),'Importação: campo esperado ausente: '+text);
assert.ok(!html.includes("activeExtractionInfo.time=new Date(payload.savedAt)"),'Salvamento não pode ser exibido como importação');
const start=html.indexOf('function sriImportMomentParts(value){');
const end=html.indexOf('function renderExtractionManager(){',start);
assert.ok(start>0&&end>start,'Formatadores da importação não encontrados');
const context={};
vm.runInNewContext(html.slice(start,end)+"\n;globalThis.sriTest={sriImportMomentParts,sriFormatImportMoment};",context);
const f=context.sriTest.sriFormatImportMoment;
assert.equal(f('2026-11-23T16:30:45.000Z'),'23/11/2026 às 13:30:45 (Brasília)');
assert.equal(f('2026-11-24T01:05:07.000Z'),'23/11/2026 às 22:05:07 (Brasília)');
assert.equal(f(null),'Horário da importação não registrado');
assert.equal(f('invalid'),'Horário da importação não registrado');
const idxProcess=html.indexOf('async function process(){'),idxPost=html.indexOf('postLoad();setTimeout(()=>window.sriShareProcessedResult',idxProcess);
const idxCapture=html.indexOf('ui.quality.importedAt=new Date().toISOString()',idxProcess);
assert.ok(idxCapture>idxProcess&&idxCapture<idxPost,'Hora deve ser gerada ao concluir apuração, antes de compartilhar');
console.log('PASS: data e hora de importação corretas, separadas da referência, do salvamento e do horário de publicação na nuvem.');
