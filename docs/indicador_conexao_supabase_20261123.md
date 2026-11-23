# Indicador de conexão — SAC Retorno Intelligence 2.0 (23/11/2026)

**Problema:** o chip da barra superior exibia “Local” quando não havia dados e “Importado” após carregar SAC+ATIVO. Isso indicava apenas o estado de CSV, sem verificar a conectividade real.

**Mudança aprovada:** manter a posição do chip e mostrar o estado remoto Supabase, independentemente da importação.

- **Online**: uma consulta autenticada de leitura do próprio perfil respondeu no Supabase; importar CSVs não altera o indicador.
- **Sincronizando**: consulta remota validada, com publicação, carregamento ou processamento em andamento.
- **Pendente**: consulta remota validada, porém alterações locais ainda não compartilhadas, inclusive distribuição.
- **Sem conexão**: navegador desconectado ou falha/timeout na consulta autenticada ao Supabase.
- **Sessão necessária**: sessão ausente ou acesso ao próprio perfil não autorizado.
- **Verificando...**: aguardando a primeira consulta remota.

A cada 45 segundos (com tela visível), ao voltar à aba, ao receber foco, e ao voltar a conexão do navegador, o indicador verifica o acesso remoto. Uma verificação iniciada sem autenticação não sinaliza falso sucesso. A atualização de estado local acontece sem interromper o operador.

**Informações:** o tooltip indica a hora da última verificação bem-sucedida e, quando disponível, a última gravação de distribuição confirmada nesta sessão. O horário da importação SAC+ATIVO permanece no chip independente.

**Segurança:** somente consulta ao próprio perfil via sessão autenticada e RLS existente. Não cria RPC, não altera o banco e não envia CSVs originais nem informações do beneficiário.
