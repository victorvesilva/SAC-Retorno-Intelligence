import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/sri-integrated-improvements.js',import.meta.url),'utf8');
const conn=readFileSync(new URL('../assets/sri-connection-status.js',import.meta.url),'utf8');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|type\s*=\s*["'](?:application\/json|module)/i.test(m[1]))continue;new vm.Script(m[2]);}
new vm.Script(js);new vm.Script(conn);
const src=html.match(/  const packLevel=r=>[\s\S]*?(?=  function renderPackTasks)/)[0];
const {packLevel,packRank,packDue}=new Function(src+'return {packLevel,packRank,packDue}')();
const rows=[{criticality:'Baixo',due_situation:'BACKLOG'},{criticality:'Crítico',due_situation:'NO PRAZO'},{criticality:'Alto',sla_band:'D6'},{criticality:'Crítico',due_situation:'VENCE HOJE'},{criticality:'Médio'},{criticality:''}];
const sorted=rows.slice().sort((a,b)=>packRank(a)-packRank(b)||packDue(a)-packDue(b));
assert.equal(sorted[0],rows[3]);assert.equal(sorted[1],rows[1]);assert.equal(sorted[2],rows[2]);assert.equal(sorted[5],rows[5]);assert.equal(packLevel({criticality:'CRITICO'}),'Crítico');
assert.match(html,/criticality:String\(distCriticity\(r\)\.name\)/);
assert.match(html,/sri-pack-status-filter/);assert.match(html,/sriPackResetOperator/);assert.match(js,/sri_manage_catalog/);assert.match(js,/sri_admin_history/);assert.match(conn,/Sistema conectado/);
console.log('PASS: compilação, integração estática e ranking de criticidade.');
