# Pacote 03 — Correções críticas P0 (preparadas)

## Escopo implementado no código, ainda não implantado
- Corrige transporte indevido de status entre operadores em atualizações de snapshot.
- Mantém protocolos inconclusos quando um novo snapshot da **mesma data e turno** substitui a carteira anterior, sem criar duplicidade e preservando trilha.
- Padroniza correspondências dos 13 status, incluindo ACEITOU e OUTROS como conclusão na ferramenta; os códigos do SIGO são referência e não gravados automaticamente.
- Disponibiliza painel restrito de **pendências antigas em conciliação** ao operador, somente leitura, sem reativação automática.
- Uma única inicialização do módulo P03, apesar da referência duplicada existente no HTML.

## Portões de liberação (ainda pendentes)
1. Executar SQL `sql/2026-11-24_sri_criticos_persistencia_status.sql` após migrações Pacote 03, em homologação, e testar antes de produção.
2. Testar concorrência de publicação, status dos 13 tipos, histórico, RLS, encerramento, transferência e assinaturas RPC.
3. Conferir com a operação os 5 protocolos desativados do Vinícius; não recuperar automaticamente os 4 inconclusos sem verificar estado atual no SIGO.
4. Continuidade entre dias/turnos e histórico detalhado da Gestão Operacional ainda exigem conclusão de requisitos e testes.
5. Não fazer merge em main, migração em produção ou deploy antes dos gates.

## Regra de proteção adicional
Tratatativas com status oficial correspondente ao SIGO 3 (incluindo OUTROS e ACEITOU) não são transportadas automaticamente só porque o motor antigo gravou `work_status=in_progress`. Esses casos ficam sinalizados à conferência, com a referência do SIGO, sem retificação histórica em massa.
