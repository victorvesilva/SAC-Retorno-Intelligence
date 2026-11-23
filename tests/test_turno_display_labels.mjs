import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const begin=html.indexOf('  function sriOperationLabel(name){');
const end=html.indexOf('  async function loadMetadata()',begin);
assert.ok(begin>0&&end>begin,'Função de rotulagem das operações não encontrada');

const sandbox={window:{}};
vm.runInNewContext(html.slice(begin,end),sandbox,{timeout:1000});
const name=sandbox.window.sriDisplayTurnoLabel;
assert.equal(typeof name,'function','Função pública de rótulos indisponível');

for(const [input,expected] of [
 ['R1','Manhã'],['R2','Tarde'],['r1','Manhã'],['r2','Tarde'],
 ['R1 - Manhã','Manhã'],['R2 - Tarde','Tarde'],
 [' R1  -  MANHA ','Manhã'],[' R2—TARDE ','Tarde'],
 ['Manhã','Manhã'],['Tarde','Tarde'],
 ['Equipe R1','Equipe R1'],['R10','R10'],['R20','R20'],
 ['Noite','Noite'],['Personalizado','Personalizado']
])assert.equal(name(input),expected,'Rotulagem incorreta de '+input);

// A alteração não pode trocar os valores internos usados nas relações e registros.
assert.match(html,/const team=null,\{day,shift\}=syncShift\(\)/,'Operação e turno não são definidos por equipe na importação');
assert.match(html,/state\.operations\.filter\(x=>x\.active\)\.map\(o=>`<option value="\$\{esc\(o\.id\)\}">\$\{esc\(window\.sriDisplayTurnoLabel\(o\.name\)\)\}<\/option>`\)/);
assert.match(html,/shift_label:shift,/,'Gravação de turno no banco deve preservar seu código original');
assert.match(html,/shift:r\.shift_label,/,'Conferência de fechamento deve manter valor bruto para lógica interna');
assert.match(html,/p_shift:shift/,'Planejamento deve manter o valor original informado');
assert.match(html,/window\.sriDisplayTurnoLabel\(r\.shift_label\)/,'Fechamento deve exibir rótulo amigável');
assert.match(html,/\$\('sri-daily-shift'\)\.value=data\.shift_label/,'Resultado preserva a etiqueta de turno');
assert.doesNotMatch(html,/R1:'R1 - Manhã'|R2:'R2 - Tarde'/,'Rótulos mistos antigos ainda presentes');

console.log('PASS: labels legados preservados em consultas e operação separada do turno automático.');
