# Plano operacional de contingência — SAC Retorno Intelligence 2.0

**Implementação:** 23/11/2026 · recuperação Excel/JSON e modal de inicialização.

## Perfis e autorização
- O **supervisor** continua autorizado a importar SAC e ATIVO e processar as bases, sem aguardar atuação de um gestor.
- A área **Distribuição → Exportações e contingenciamento** permite ao supervisor consultar, exportar e conferir as carteiras no navegador autorizado.
- A publicação das carteiras no Supabase mantém as permissões e as regras atuais de gestão/supervisão. Restaurar localmente um backup **não publica automaticamente** tarefas.

## Camada 1 — Continuidade operacional em Excel (sem o sistema)
1. Após distribuir os protocolos, escolher **Exportar Distribuição (.xlsx)** e selecionar os operadores necessários.
2. Guardar o arquivo atualizado em um local seguro e autorizado pela operação; há dados de atendimento/operadores nesse material.
3. Se o site estiver indisponível, abrir a planilha local no Excel e continuar a gestão da carteira por esse documento conforme o plano de continuidade da operação.
4. Na volta do Intelligence, carregar a base SAC + ATIVO da mesma rodada e usar **Importar distribuições (.xlsx)** no painel de contingenciamento.
5. Conferir a prévia com contagem de protocolos, identificação de operadores repetidos entre arquivos e conflitos por protocolo; exportar inconsistências se necessário.
6. Confirmar apenas atualizações válidas. Alterações de operador já definido exigem aceite explícito; registros desconhecidos ou conflitantes ficam sem atualização. Em caso de alteração da carteira depois da prévia, reimportar para nova conferência.
7. Salvar/publicar no Supabase **somente após conferência do supervisor**, respeitando as regras existentes de versão, turno e equipe.

**Limite:** Excel é um meio de trabalho fora do sistema. O importador de planilhas não recria por si só a base apurada: requer uma carteira SAC + ATIVO previamente carregada ou recuperada.

## Camada 2 — Recuperação integral do estado local em JSON
1. Em **Distribuição → Exportações e contingenciamento**, escolher **Baixar backup completo (.json)**.
2. Esse arquivo pode incluir a última apuração local consolidada, histórico, operadores, atribuições, status e criticidade. Mantê-lo em armazenamento autorizado e protegido.
3. Para recuperação em uma instalação funcional do Intelligence, selecionar **Restaurar backup completo (.json)**.
4. O sistema mostra **data do backup**, total de protocolos atribuídos no arquivo versus navegador e **mudanças de operador**, alertando que a ação substitui o estado **local**.
5. Confirmar a restauração. A publicação na nuvem não é automática; verificar diferenças em relação ao resultado atual no Supabase antes de salvar ou republicar.
6. Se o JSON não contiver base consolidada atual, importar primeiro SAC + ATIVO.

**Limite:** JSON requer que o site esteja funcional para ser reimportado. Não substitui a planilha Excel independente para indisponibilidade total do Intelligence.

## Inicialização e navegação
- Quando existe uma cópia compacta do último processamento no navegador, o modal de preparação aparece **antes** do processo de recuperação local.
- A interface permanece indisponível durante a recuperação; a sincronização autenticada com o Supabase só começa depois dela e mantém o modal aberto até concluir.
- O sistema preserva a aba selecionada na restauração local e ao carregar resultado do Supabase, evitando voltar à Gestão Operacional contra a escolha do usuário.
- Em falha de recuperação local, exibe opções de **tentar novamente** e **continuar sem recuperação**, sem apagar dados. Carregamento sem cópia local não mostra spinner de recuperação local, mas mostra modal ao sincronizar a sessão autenticada.

## Verificações de aceite
- [ ] Acesso de supervisor permite importar/processar SAC+ATIVO sem autorização adicional de gestor.
- [ ] Excel de distribuição é exportável e utilizável fora do sistema.
- [ ] Importação XLSX permite seleção múltipla, conferência de conflitos e aplicação local apenas após confirmação.
- [ ] Reimportação XLSX bloqueia uso de uma prévia obsoleta.
- [ ] JSON completo é exportado e solicita confirmação detalhada antes de substituir dados locais.
- [ ] Nenhuma recuperação local publica tarefas diretamente na nuvem.
- [ ] Modal cobre tanto a restauração local quanto a sincronização da conta.
- [ ] Depois do carregamento, a aba selecionada não é substituída pela Gestão Operacional.
- [ ] Testes integrados (interfaces, permissões, PDF) e cenários sintéticos aprovados.
- [ ] Conferência com dados reais, em ambiente autenticado, feita por supervisor designado.

**Observação:** o código do importador XLSX existente foi reativado; as proteções de leitura/duplicidade, status, criticidade e confirmação foram preservadas.
