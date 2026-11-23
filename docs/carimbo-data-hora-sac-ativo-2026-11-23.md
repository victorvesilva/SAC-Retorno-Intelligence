# Carimbo de data e hora — importação SAC + ATIVO

- Depois da **apuração concluída**, o navegador registra `ui.quality.importedAt` em ISO 8601, no momento do processamento.
- O cabeçalho exibe **Última importação SAC + ATIVO** com data e hora no fuso de Brasília (UTC-3). A seção de importação exibe o mesmo instante.
- O horário é persistido no backup local e no payload consolidado compartilhado no Supabase. Não são enviados os arquivos CSV originais.
- Restaurar a base em outro navegador ou recarregar a página **não** altera o instante original da importação.
- A data de referência da apuração e o horário de gravação no Supabase são conceitos diferentes do instante de importação.
- Para importações antigas sem campo `importedAt`, exibir **Horário da importação não registrado**; não inferir o momento a partir de `savedAt` ou do acesso atual.
- Somente o carimbo de data e hora é modificado nesta entrega; sem alterações em permissões, distribuições ou tabelas SQL.
