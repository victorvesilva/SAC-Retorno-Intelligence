# Publicação automática SAC + ATIVO — 23/11/2026

## Regra
- Importador autenticado como **administrador, gestor ou supervisor** seleciona uma vez a operação/equipe de destino. A escolha é memorizada por usuário. Se somente uma operação/equipe estiver disponível, o sistema a preenche sem qualquer clique adicional.
- R1 determina **Manhã**; R2 determina **Tarde** automaticamente. A data operacional preenche o dia corrente de Brasília e continua editável para importações retroativas.
- Sem equipe/turno inequívocos, o processamento **não é iniciado**, evitando salvar resultados na equipe errada. O sistema informa qual contexto deve ser escolhido, sem pedir confirmação para salvar.
- Após validar e processar os dois CSVs, o sistema grava **somente** o resultado consolidado (`daily_result_snapshots`: payload de apuração, métricas, avisos e hash) e o estado da distribuição (`daily_result_distributions`). Arquivos CSV originais continuam **somente no navegador**, não são enviados ao Supabase.
- O salvamento não apresenta nenhum `confirm()` e mostra estado de publicando/sucesso/falha.
- Se a publicação do resultado ocorrer, mas a distribuição falhar, o sistema mantém a base local e permite **Reenviar apuração pendente** sem inserir de novo o snapshot.
- Para apurações idênticas já publicadas no mesmo dia, turno e equipe, recupera o snapshot existente em vez de duplicar ou sobrescrever distribuições remotas.
- Publicação da carteira de operador segue a rotina de distribuição existente. Erros não são disfarçados como sucesso.
- O papel **operador** mantém as restrições de visualização previamente definidas; quem importa SAC + ATIVO precisa do papel administrativo, gerencial ou de supervisão.

## Aceite
- Fluxo sem `confirm()` na publicação e sem envio de CSVs originais.
- Teste de escolha segura de operação/equipe e inferência R1/R2.
- Teste de persistência de snapshot e reenvio idempotente em falha de distribuição.
- Testes de regressão e integração no CI.
- Teste operacional autenticado com CSV real recomendado antes de escalar a importação.
