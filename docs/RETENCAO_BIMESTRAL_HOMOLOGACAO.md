# SAC Retorno Intelligence 2.0 — Política operacional de exclusão bimestral
**Decisão registrada em 22/11/2026:** o processo de exclusão será executado **a cada dois meses**, conforme definição do responsável pelo projeto.

## Não confundir periodicidade com elegibilidade
- **Periodicidade:** uma execução a cada **dois meses calendários** após a data de início oficial. A data da primeira execução, responsável, horário e ambiente precisam ser definidos antes da ativação.
- **Janela de triagem atualmente implementada:** apurações com data operacional anterior a `CURRENT_DATE - INTERVAL '2 months'`. Essa janela também é de **dois meses**, mas não é autorização automática de descarte, nem substitui o prazo legal validado para cada categoria.
- **Data de referência:** data da execução oficial. Não usar 60 dias fixos no lugar de dois meses de calendário sem decisão expressa.

## Regras obrigatórias de bloqueio
1. Identificar protocolos abertos ou pendentes **diretamente no SIGO** e em fontes operacionais válidas. `completed_in_tool` e `lifecycle='finalized'` não comprovam conclusão no SIGO.
2. Bloquear períodos com `retention_holds` ativos, demandas regulatórias, NIP, solicitações de preservação e casos com investigação/auditoria.
3. Bloquear tarefas operacionais pendentes, inconsistências de distribuição, turnos/dias não fechados e apurações sem carteira publicada.
4. Preservar histórico de tratativas, trilhas de auditoria e evidências exigidas pelo prazo de guarda aplicável. Considerar dependências de chaves estrangeiras e efeitos de `CASCADE`.
5. Gerar prévia com contagem por equipe, turno, data, categoria e justificativa do bloqueio. **Não incluir dados pessoais desnecessários na prévia**.
6. Exigir aprovação formal de TI, Segurança/Privacidade, Jurídico e Operação, testes com contas sintéticas e plano de backup/restauração antes de habilitar qualquer escrita destrutiva.

## Situação técnica nesta versão
- O inventário `sri_v_retention_risk_review` é **somente leitura** e retorna `exclusao_automatica_autorizada=false` e `confirmacao_integral_sigo_pendente=true`.
- **Nenhum agendador, cron, função de exclusão, DELETE ou job automático está habilitado** neste PR.
- O documento especifica a periodicidade e os critérios de homologação, não executa limpeza.
- A definição de periodicidade bimestral **não aprova** unilateralmente a eliminação de registros protegidos por obrigações legais ou operacionais.

## Critérios de aceite para ativação futura
Aprovar a primeira data, congelar a política validada, testar com dados fictícios e reconciliar o SIGO; emitir relatório de candidatos e bloqueios; habilitar apenas após aceite e possibilidade comprovada de restauração. O teste de retenção deve sempre comprovar que protocolos abertos são preservados.
