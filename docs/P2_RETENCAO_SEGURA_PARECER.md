# P2 — Segurança e retenção: parecer técnico (22/11/2026)

**Status:** proposta para revisão. Nenhuma política de exclusão aprovada ou implantada.

## 1. Evidências observadas no Supabase
- Projeto SAC Retorno Intelligence: 1 apuração consolidada; 0 apurações anteriores a 2 meses; 0 bloqueios formais `retention_holds`; 0 tarefas publicadas; 0 `import_rows`; 0 registros em `protocol_current`.
- `daily_result_snapshots.payload_gzip`: contém payload consolidado (628.004 bytes no inventário observado), **não presumir que esteja anonimizado**.
- `import_files`, `import_rows`, `protocol_current`, `operator_treatments`, `daily_operator_tasks`, `daily_operator_treatments` e `audit_events` também podem carregar dados vinculados a protocolos, operadores ou beneficiários em operações futuras.
- Sem buckets Supabase Storage; extensão `pg_cron` não instalada. Isso não prova ausência de automações externas.
- 25 tabelas públicas com RLS ativado e nenhum privilégio `DELETE` concedido ao papel autenticado. As **22 funções `SECURITY DEFINER`** continuam sujeitas a auditoria específica, fora deste PR.
- A view atual `sri_v_retention_review` é somente leitura e inclui a data `CURRENT_DATE - INTERVAL '2 months'`; seu acesso à tabela `retention_holds` sofre de ausência de `SELECT` no papel `authenticated`. A proposta concede SELECT, **preservando a RLS que restringe leitura a gestores**.

## 2. Regra de negócio, sem autorizar descarte
A janela de dois meses é apenas uma **triagem existente no código**, não constitui prazo de guarda aprovado por Jurídico, Segurança e TI. É imprescindível definir por classe de registro, base legal, necessidades de auditoria, tratamento de NIP e reclamações, e fluxo de solicitações de bloqueio.

A nova view gerencial `sri_v_retention_risk_review`:
- Mantém `security_invoker=true`; seu próprio filtro exige `private.is_manager()`.
- Classifica bloqueios por hold obrigatório, protocolos com lifecycle ativo **apenas entre protocolos com tarefas vinculadas**, tarefas pendentes, falta de publicação, falta de fechamento de turno ou fechamento de dia pendente.
- Exibe `confirmacao_integral_sigo_pendente=true` e `exclusao_automatica_autorizada=false` em todos os registros.
- **Não comprova** situação de todos os protocolos no SIGO. `completed_in_tool` e `protocol_current.lifecycle='finalized'` não bastam para confirmar encerramento regulatório ou exclusão permitida.

## 3. Dependências que impedem exclusão direta
- `daily_result_snapshots` é referência de `daily_operator_tasks` (FK `ON DELETE RESTRICT`), `daily_result_distributions` (`CASCADE`) e `sri_result_shift_closures` (`SET NULL`). Exclusões podem romper carteiras e histórico.
- `daily_operator_treatments` depende de `daily_operator_tasks` com `ON DELETE RESTRICT`.
- `daily_result_distribution_audit` aponta para snapshots e exige revisão de preservação de auditoria.
- A árvore `import_batches` → `import_files` → `import_rows`, conflitos e eventos possui cascatas e vínculos próprios.
- `protocol_current` tem exclusões em cascata para `protocol_assignments` e `operator_treatments`. Não excluir protocolos ativos ou históricos sem reconciliação.
- Não implementar exclusão SQL, Cron, Edge Function ou job de limpeza nesta etapa.

## 4. Validação realizada
- Diagnóstico de permissões: `authenticated` não conseguia consultar diretamente `retention_holds` antes do patch (erro 42501).
- Aplicação **temporária dentro de transação revertida** do SQL proposto, com duas apurações sintéticas antigas: uma sem tarefas publicadas, outra com hold obrigatório ativo.
- Classificações, leitura gerencial, isolamento de identidade sem perfil e view legada conferidos com sucesso; `ROLLBACK` reverteu todos os testes.
- Teste CI de regressão estática verifica ausência de operações destrutivas, RLS, exigência de gestor e flags que proíbem exclusão.
- Dados sintéticos somente; nenhum dado pessoal ou extração SAC/ATIVO foi enviado ao GitHub.

## 5. Critérios de aceite para eventual política definitiva
1. Acordo formal TI/Jurídico/Privacidade/Operação sobre duração e base legal por categoria; legislação e regras internas verificadas.
2. Critério confiável de encerramento no **SIGO**, com reconciliação de cada protocolo, não só por turno/operador.
3. Bloqueios legais e operacionais auditáveis, com impacto em NIP e solicitações em aberto.
4. Regras de integridade de FK, backup/restauração verificados, monitoração e revisão humana.
5. Simulação no ambiente de homologação com contagem de candidatos, relatório de exclusões propostas e dupla aprovação.
6. Somente depois, desenhar rotina técnica idempotente de descarte, com logs imutáveis e reversibilidade quando exigível.

**Decisão atual: NÃO excluir nenhum registro automaticamente. O PR não é um agendamento nem autorização de limpeza.**
