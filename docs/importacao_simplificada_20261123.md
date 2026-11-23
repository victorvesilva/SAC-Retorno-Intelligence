# Importação SAC + ATIVO — interface operacional simplificada (23/11/2026)

## Decisão
O supervisor não deve administrar manualmente etapas que já são automáticas. O bloco grande **"Publicação automática SAC + ATIVO"** deixa de ocupar espaço na importação. Os controles técnicos são mantidos no DOM, sem mudar as rotinas de apuração, auditoria, distribuição, Supabase ou fechamento às 20h.

## Experiência do usuário
- A tela de importação exibe uma **faixa compacta de contexto** com o destino efetivo.
- **Equipe única vinculada ao usuário:** o Intelligence identifica a operação e a equipe automaticamente, com base em `team_memberships` e nas operações/equipes ativas visíveis por RLS.
- **Equipe única disponível:** o destino é assumido automaticamente, sem escolha.
- **Várias equipes sem preferência:** operação e equipe ficam visíveis somente para escolha inicial; não se inventa um destino.
- **Preferência válida previamente escolhida:** o sistema reaproveita a equipe por usuário (`sri_auto_publish_target_v1_<user-id>`). É possível usar "Alterar destino" quando necessário; a preferência não permite elevar privilégios, pois a autorização final continua no banco.
- **Sem equipe acessível:** mostrar orientação para configurar vínculo; não permitir publicação em equipe indefinida.
- **Data, turno e fechamento:** seguem automáticos (Brasil: 07–12h59 manhã, 13–17h59 tarde, 18–06h59 noite; novo ciclo às 20h).
- **Dados já salvos:** carregamento automático no login somente da equipe selecionada, preservando mudanças locais ainda não publicadas.
- **Sincronização periódica:** não carrega dados de outra equipe; a presença de alterações locais continua exigindo revisão antes de substituição.
- **Erros:** botões de recuperação/reenvio aparecem apenas se necessários. Divergências entre sessão local e nuvem mantêm uma advertência explícita.
- **Notificações:** toast breve de sucesso, falha ou sincronização; informação sem dados aparece discretamente no contexto.
- **CSV:** SAC e ATIVO continuam processados no navegador; só resultados consolidados são publicados.

## Segurança e validação
A interface reduz atrito, mas não ignora as políticas RLS do Supabase. Operação e equipe não podem ser inferidas por horário, nome dos arquivos ou por aproximação de nomes. Testes cobrem vínculo único, destino único, preferência válida, preferência inválida, múltiplos vínculos e falta de preferência.

## Critérios para homologação operacional
1. Administrador com duas equipes, sem preferência: escolher uma vez, navegar e recarregar.
2. Supervisor com equipe única vinculada: importar sem escolher destino.
3. Duas importações no mesmo ciclo: observar preservação de protocolos atribuídos.
4. Fechar/abrir navegador: recuperar apenas o último resultado da equipe selecionada.
5. Forçar falha de sincronização e verificar botão de recuperação discreto.
6. Confirmar que o indicador Online/Sincronizando/Pendente permanece independente da importação.
