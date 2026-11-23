import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
// Operadores criados no Supabase passam pelo vínculo técnico automático em sri_set_user_team.
// O frontend identifica-os pelo UUID, sem aproximar nomes ou exigir vínculo manual.
assert.match(html,/rpc\('sri_set_user_team'/,'Vínculo técnico por equipe deve continuar usando RPC autorizada');
assert.match(html,/const id='acct:'\+profile\.id/,'Roster precisa manter identificador UUID da conta');
assert.match(html,/window\.sriSyncCloudRoster\s*=\s*function/,'Roster deve ser sincronizado pelo diretório unificado');
assert.match(html,/rpc\('publish_general_operator_tasks'/,'Distribuição geral deve permanecer disponível');
assert.match(html,/id="sri-unified-publish"/,'Botão principal de publicação deve permanecer disponível');
assert.match(html,/Conciliação de operadores antigos/,'Painel excepcional deve ser identificado como legado');
assert.match(html,/Conciliação de operadores legados \(uso excepcional\)/,'Conciliação antiga deve ser recolhível');
assert.match(html,/Novas contas e distribuições não precisam desta vinculação|Operadores cadastrados no Supabase recebem distribuição diretamente/,'Novo fluxo deve ser descrito como automático');
assert.match(html,/!String\(x\.id\)\.startsWith\('acct:'\)/,'Contas novas não devem aparecer no seletor manual de vínculos');
assert.match(html,/rpc\('admin_link_operator'/,'Conciliação de históricos deve continuar disponível de forma excepcional');
assert.match(html,/Nenhuma tarefa publicada nesta equipe\. Confirme a equipe e publique a distribuição/,'Mensagem principal não deve exigir vinculação manual');
assert.doesNotMatch(html,/<h3>Vincular contas aos operadores da distribuição<\/h3>/,'Cabeçalho antigo não deve ser mostrado');
console.log('PASS: conta nova é atribuída à equipe e publicada por UUID; legado preservado somente para conciliação.');
