# Sincronização compartilhada SAC + ATIVO — 23/11/2026

## Objetivo
Após processar e validar as duas bases, um supervisor/gestor deve compartilhar a apuração consolidada na nuvem para que outros usuários autorizados utilizem a mesma versão.

## Comportamento
1. A importação CSV ocorre no navegador, aplicando as regras atuais, sem enviar os CSVs originais.
2. Após uma apuração válida, o sistema solicita confirmação da equipe, data e turno antes de publicar o **resultado consolidado**, preservando a autorização de supervisão/gestão e as validações existentes.
3. O Supabase mantém novas versões de resultado em `daily_result_snapshots` por equipe/data/turno e assinatura dos dados; distribuição, revisão e publicação de tarefas usam as rotinas existentes.
4. Gestores e supervisores conectados verificam novos resultados de sua equipe a cada 25 segundos, além do retorno de foco. Carregam automaticamente quando a sessão está limpa.
5. Se há importação local ainda não compartilhada, edição ou distribuição alterada, o sistema **não sobrescreve**: mostra aviso e pede confirmação para aplicar a versão publicada.
6. Operadores têm atualização de carteiras publicadas a cada 40 segundos, sem acessar os CSVs ou o snapshot gerencial e sem interromper tratativas em edição.
7. O cache do navegador recuperado no login só é substituído automaticamente quando tem marca verificável da última versão já compartilhada; caso contrário, exige conferência para prevenir perda de dados.
8. Uma nova importação bloqueia salvamento automático de distribuição vinculada ao snapshot anterior.

## Limites e homologação
- A sincronização é por consulta periódica, não um canal realtime instantâneo; usuários em segundo plano atualizam ao retornar.
- Perfis recebem apenas dados permitidos pelas políticas RLS. Operadores veem tarefas publicadas, não a base gerencial inteira.
- Importação não validada, sessão offline, publicação cancelada, equipe/turno não selecionados ou falha de gravação permanecem locais, com aviso.
- Testes automatizados e visuais usam dados sintéticos. Testes de duas sessões autenticadas e de fluxo com CSV real continuam como aceite operacional obrigatório.
- Não há alteração de schema, exclusão ou migração destrutiva. O SIGO continua fonte oficial.

## Roteiro de aceite autenticado
- [ ] Supervisor A importa CSV SAC + ATIVO e confirma equipe/data/turno.
- [ ] Supervisor B, na mesma equipe e outra sessão, observa base atualizada sem nova importação.
- [ ] Gestor confere base e indicadores, respeitando as equipes autorizadas.
- [ ] Supervisor B com mudanças locais não salvas recebe aviso e não perde dados.
- [ ] Operador recebe apenas sua carteira após publicação da distribuição.
- [ ] Operador com tratativa aberta não perde as anotações.
- [ ] Tentativas de publicar sem permissão e bases duplicadas não modificam a nuvem.
