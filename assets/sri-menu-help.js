/* Operational guidance. No data reads or changes to access rules. */
(()=>{'use strict';
const guidance={
 overview:['Gestão Operacional','Operação diária',
  'Apresenta a situação da carteira apurada, os prazos e as áreas que exigem atenção.',
  'Confira os dados de referência e aplique os filtros disponíveis antes de interpretar os cartões e gráficos. Use os detalhes para localizar os registros que compõem um indicador.',
  'Observe a unidade informada em cada indicador: linhas de registros e protocolos únicos podem ter totais diferentes. Volume e risco ajudam a organizar a atuação; não medem, sozinhos, a qualidade do atendimento.'],
 distribution:['Distribuição','Operação diária',
  'Organiza os protocolos da carteira entre os operadores elegíveis e permite acompanhar as tratativas registradas.',
  'Filtre a carteira, selecione os protocolos e revise os responsáveis antes de confirmar uma atribuição ou redistribuição. Use Atualizar protocolos para consultar as movimentações mais recentes.',
  'O histórico de importações mostra os registros preservados de cada protocolo. A sinalização de caso sensível é independente da criticidade calculada.'],
 agents:['Carteira por Operador','Operação diária',
  'Mostra a concentração da carteira por responsável ou fila de encaminhamento, conforme o agrupamento selecionado.',
  'Use a busca e os filtros para localizar os responsáveis e conferir o volume, os vencimentos, o backlog e o tempo no agente.',
  'Uma carteira maior representa volume sob acompanhamento. Para avaliar os resultados das carteiras publicadas por operador e equipe, consulte Desempenho diário.'],
 'v20-daily-performance':['Desempenho diário','Acompanhamento e resultados',
  'Apresenta a posição dos protocolos únicos distribuídos na data escolhida, por equipe e operador.',
  'Escolha a data e atualize os resultados. Filtre equipe ou operador e clique em um indicador ou nome para detalhar os protocolos e suas observações.',
  'Com tratativa reúne os concluídos e os que estão em andamento. Os cartões percentuais usam os distribuídos como base. As metas vigentes usam concluídos na ferramenta ÷ protocolos com tratativa × 100. Sem meta aplicável, aparece Meta não definida; contexto insuficiente impede uma comparação conclusiva.'],
 'v20-closure':['Fechamento Operacional','Acompanhamento e resultados',
  'Reúne as consultas e os controles de fechamento por data, equipe e turno.',
  'Atualize o quadro da data, selecione a equipe e o turno e confira a prévia antes de confirmar um fechamento. As ações disponíveis dependem do perfil e da situação do período.',
  'Fechamento registra e protege uma posição operacional. Reabertura exige permissão e justificativa. Uma conclusão na ferramenta não confirma, por si só, a baixa do protocolo no SIGO.'],
 intelligence:['Inteligência e Tendências','Acompanhamento e resultados',
  'Ajuda a comparar operadoras e áreas e a acompanhar a evolução dos indicadores nas extrações disponíveis.',
  'Selecione a aba, os filtros e as referências de comparação. Confira quais extrações e períodos estão sendo exibidos.',
  'Cada extração representa uma fotografia dos dados. Queda de volume, isoladamente, não comprova resolução de protocolos; confira as mudanças registradas e o contexto da comparação.'],
 reports:['Central de Relatórios','Acompanhamento e resultados',
  'Centraliza as consultas gerenciais e a geração dos relatórios em PDF.',
  'Escolha o tipo de consulta ou relatório, a referência e os filtros. Confira a prévia e o recorte antes de exportar.',
  'Observe a fórmula e a unidade de cada relatório. Totais por operador ou equipe podem se sobrepor entre períodos e movimentações; não os some automaticamente como protocolos globais.'],
 import:['Importar Bases','Dados e qualidade',
  'Recebe as extrações SAC e ATIVO e gera a apuração consolidada utilizada pelos módulos operacionais.',
  'Selecione os arquivos corretos da rodada, processe a importação e acompanhe as mensagens de leitura e publicação. Confira as referências e os alertas apresentados.',
  'Uma nova importação atualiza a fotografia da carteira. O histórico por protocolo utiliza as importações salvas e preparadas para consulta. Erros ou pendências de publicação exigem conferência antes de usar os resultados como referência.'],
 details:['Base e Qualidade','Dados e qualidade',
  'Permite consultar os registros apurados, verificar a qualidade das bases e comparar os dados com as referências disponíveis.',
  'Use as abas e a busca para localizar protocolos, conferir campos de origem e investigar os avisos de qualidade ou conciliação.',
  'Um aviso sinaliza necessidade de análise e pode depender de diferenças entre as fontes. Confira a origem e o critério antes de concluir que existe um erro.'],
 'v20-settings':['Configurações','Administração',
  'Reúne os cadastros e parâmetros disponíveis para o seu perfil, como usuários, equipes e metas.',
  'Selecione a área desejada, confira o cadastro ou parâmetro e revise os dados antes de salvar. O perfil e os vínculos operacionais determinam as ações permitidas.',
  'Cadastros e vínculos influenciam o acesso e a elegibilidade na distribuição. As metas possuem aplicação e vigência; uma referência sem meta não deve receber um atingimento presumido.'],
 'v20-mine':['Minha Carteira','Área do operador',
  'Reúne os protocolos atribuídos à sua conta e disponíveis na carteira do dia.',
  'Use a busca e os filtros para localizar o protocolo. Em Tratar, informe o status, registre a observação quando necessário e selecione Protocolo especial ao identificar um caso sensível. Salvar tratativa registra os dados e retorna à carteira.',
  'A marcação especial pode ser usada em qualquer criticidade e não altera o cálculo da criticidade. Um registro de tratativa não equivale automaticamente à conclusão no SIGO.'],
 'v20-mine-history':['Meu Histórico','Área do operador',
  'Permite consultar as suas tratativas autorizadas, organizadas por protocolo ou como lista de movimentações.',
  'Busque o protocolo, ajuste o período e use Carregar movimentações anteriores quando houver mais registros.',
  'Várias atuações no mesmo protocolo aparecem como movimentações distintas. A quantidade de registros de tratativa pode ser maior que a quantidade de protocolos únicos.'],
 'v20-operator-pending':['Pendências anteriores','Área do operador',
  'Ajuda a conferir protocolos atribuídos à sua conta que permanecem sem conclusão na ferramenta e estão fora da carteira ativa do dia ou vieram de dias anteriores.',
  'Consulte o motivo da conferência e a última tratativa. Se houver solicitação de revisão da supervisão, registre a resposta no local indicado.',
  'A consulta não reativa protocolos nem confirma divergência ou conclusão no SIGO. A possibilidade de tratar depende de o protocolo estar disponível na carteira autorizada.'],
 'v20-pending':['Pendências e Ações','Operação diária',
  'Organiza os pedidos de apoio e as pendências disponíveis para acompanhamento da gestão e supervisão.',
  'Confira o protocolo, o solicitante, o motivo e a situação do pedido. Registre a orientação ou o encaminhamento quando a ação estiver disponível.',
  'Uma resposta de apoio orienta o tratamento. O resultado do protocolo deve ser acompanhado pelos registros operacionais correspondentes.'],
 'v20-alerts':['Conciliação e Alertas','Dados e qualidade',
  'Reúne sinais que precisam de conferência, incluindo mudanças da base relacionadas a tratativas já registradas.',
  'Filtre os registros disponíveis, abra a análise e confira a origem e a tratativa. Registre a decisão e a justificativa ou solicite revisão ao operador quando necessário.',
  'Mudança na base com tratativa registrada é um sinal para análise. Não representa, por si só, um erro confirmado. O status da origem e a tratativa operacional permanecem separados.'],
 'v20-catalog':['Consultas e Exportações','Acompanhamento e resultados',
  'Oferece consultas complementares e exportações dos registros autorizados.',
  'Escolha o tipo de relatório, a data e a equipe, consulte a prévia e confira o conteúdo antes de exportar.',
  'A consulta Distribuição e responsáveis representa a carteira atual. Para movimentos de um período, utilize Movimentações de distribuição (histórico). Confira a referência indicada na tela.'],
 'v20-account':['Minha Conta','Conta',
  'Apresenta os dados e as preferências disponíveis para sua conta autenticada.',
  'Confira sua identificação e utilize os controles de conta ou aparência oferecidos na tela.',
  'O perfil e os vínculos operacionais controlam o que sua conta pode consultar ou alterar. Procure a gestão caso identifique uma informação cadastral incorreta.']
};
const contextual={
 'distribution:protocols':['Distribuir protocolos','Filtre, selecione e revise os responsáveis. As tratativas são sincronizadas automaticamente e também pelo botão Atualizar protocolos.'],
 'distribution:manager':['Visão gerencial','Use os indicadores para conferir cobertura, responsáveis e composição da distribuição no recorte selecionado. Observe os totais e as unidades informadas.'],
 'distribution:followup':['Acompanhamento','Confira a situação das carteiras publicadas e as tratativas disponíveis. Utilize a referência de data e equipe para interpretar os resultados.'],
 'distribution:history':['Histórico de atribuições','Consulte a data, o período e a extração desejados. A eventual remoção de uma atribuição exige justificativa e respeita as proteções de tratativas, conclusões e períodos fechados.'],
 'distribution:exports':['Exportações e backup','Escolha a exportação ou o backup adequado ao seu objetivo e confira o recorte. Uma cópia de segurança preserva os dados disponíveis no formato indicado.'],
 'reports:period':['Resultados por período','Consulte o período e os filtros desejados. Tela e exportação usam o mesmo recorte da consulta. Confira a base de cálculo apresentada para cada indicador.'],
 'reports:pdf':['Relatórios em PDF','Escolha o relatório, a extração de referência e o formato. Confira a prévia antes de gerar o documento.'],
 'reports:productivity':['Carga e produtividade','Cada linha resume protocolos distintos por operador, equipe e dia. Ocorrências entre operadores ou dias podem se sobrepor; evite somá-las como protocolos globais.'],
 'reports:movements':['Movimentações','Consulte os registros de atuação e o contexto disponível de cada evento. A quantidade de movimentações não equivale à de protocolos únicos.'],
 'details:records':['Base apurada','Consulte os registros e seus campos de origem. A busca e os filtros ajudam a localizar protocolos e a conferir os valores que compõem os indicadores.'],
 'details:quality':['Qualidade dos dados','Revise os avisos de leitura, campos ausentes, duplicidades e critérios aplicados antes de usar o resultado como referência operacional.'],
 'details:reconcile':['Conciliação de dados','Compare as fontes e os arquivos de conferência apresentados. Investigue a diferença por protocolo e pelo critério informado.'],
 'intelligence:bko':['Visão por BKO','Compare a carteira e os sinais de prazo por operadora, respeitando os filtros e a unidade dos indicadores apresentados.'],
 'intelligence:evolucao':['Evolução das extrações','Confira as fotografias salvas e as mudanças efetivamente registradas entre importações. Essa visão não representa uma série contínua de eventos.'],
 'intelligence:comparativo':['Comparativo histórico','Escolha as duas extrações que deseja comparar e confira as referências de data e horário antes de interpretar as variações.'],
 'intelligence:metas':['Metas e desempenho','Consulte a referência diária e as metas vigentes. Na ausência de meta ou base de cálculo, o resultado deve permanecer indicado como não definido ou sem base.'],
 'settings:users':['Usuários','Confira nome, e-mail, perfil, situação e vínculos operacionais. Esses dados alimentam a identificação e a elegibilidade dos operadores.'],
 'settings:teams':['Equipes','Organize os vínculos e a supervisão das equipes conforme as permissões da sua conta. Confira a equipe de destino antes de salvar.'],
 'settings:goals':['Metas','Confira a aplicação, a vigência e o percentual da meta. A regra mais específica por operador, equipe ou operação tem prioridade. A meta de conclusão usa concluídos na ferramenta ÷ protocolos com tratativa no dia × 100.'],
 'settings:monitor':['Monitor operacional','Consulte os registros técnicos pelos filtros disponíveis e confira o contexto da ocorrência. Esses registros apoiam a investigação de falhas do sistema.'],
 'settings:bulk':['Cadastros em lote','Confira o modelo e os dados de entrada, revise a prévia e verifique os resultados apresentados antes de concluir a operação.'],
 'settings:legacy':['Vínculos legados','Utilize a conciliação de nomes antigos somente quando houver carteira legada a vincular à conta correta. Os cadastros atuais utilizam a identificação da conta.'],
 'settings:access':['Acessos','Revise os perfis e vínculos apresentados antes de alterar permissões. Cada perfil possui um escopo operacional próprio.'],
 'settings:import':['Permissões de importação','Confira os responsáveis e as regras disponíveis para importação e reimportação antes de salvar alterações.']
};
const mounted=new Map();
function node(tag,text,parent){const el=document.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;}
function contextFor(id,root){if(id==='distribution')return 'distribution:'+(root.querySelector('.dist-pane.active')?.id.replace('dist-pane-','')||'protocols');if(id==='details')return 'details:'+(root.querySelector('.v46-pane.active')?.id.replace('v46-pane-','')||'records');if(id==='intelligence')return 'intelligence:'+(root.querySelector('.v49-pane.active')?.id.replace('v49-pane-','')||'bko');if(id==='reports')return 'reports:'+(root.dataset.layoutView||'pdf');if(id==='v20-settings')return 'settings:'+(root.dataset.layoutSettings==='monitor'?'monitor':document.body.dataset.sriSettingsPage||'users');return '';}
window.sriInstallMenuHelp=()=>{
 if(!window.sriBindInfoPopover)return;
 for(const [id,base] of Object.entries(guidance)){
  if(id==='v20-mine-history'||id==='v20-operator-pending')continue;
  const root=document.getElementById(id);if(!root){const old=mounted.get(id);if(old){old.api.destroy();old.box.remove();mounted.delete(id);}continue;}
  const heading=id==='v20-mine'?(document.querySelector('#sri-wallet-header h3')||root.querySelector('h2')):root.querySelector(':scope > .sri-module-header h2,:scope > .sri-module-header h3,:scope > .section-heading h2,:scope > .go-head h2,:scope > h2');
  let state=mounted.get(id);
  if(!heading){if(state){state.api.destroy();state.box.remove();state.button.remove();mounted.delete(id);}continue;}
  if(state&&(!state.button.isConnected||state.heading!==heading)){state.api.destroy();state.box.remove();state.button.remove();mounted.delete(id);state=null;}
  if(!state){
   const wrapper=node('div');wrapper.className='sri-menu-help-heading';heading.before(wrapper);wrapper.append(heading);
   const button=node('button');button.type='button';button.className='chart-help sri-menu-help-button';button.dataset.sriMenuHelp=id;node('span','?',button).setAttribute('aria-hidden','true');wrapper.append(button);
   const box=node('aside');box.id='sri-menu-help-'+id;box.className='sri-score-info';box.setAttribute('popover','auto');box.setAttribute('role','note');box.tabIndex=-1;document.body.append(box);
   button.setAttribute('aria-controls',box.id);button.setAttribute('aria-expanded','false');box.setAttribute('aria-labelledby',box.id+'-title');
   state={heading,button,box,api:window.sriBindInfoPopover(button,box),key:''};mounted.set(id,state);
  }
  const mode=document.body.dataset.sriOperatorView||'active',definition=id==='v20-mine'&&mode!=='active'?guidance[mode==='history'?'v20-mine-history':'v20-operator-pending']:base;
  const context=contextFor(id,root),key=definition[0]+'|'+context;
  if(state.key!==key){
   state.api.hide();state.box.replaceChildren();node('p',definition[1],state.box).className='sri-menu-help-category';node('h3','Sobre '+definition[0],state.box).id=state.box.id+'-title';
   for(const [i,title] of ['Para que serve','Como usar na operação','Como interpretar'].entries()){node('h4',title,state.box);node('p',definition[i+2],state.box);}
   if(contextual[context]){node('h4','Nesta aba · '+contextual[context][0],state.box);node('p',contextual[context][1],state.box);}
   state.button.setAttribute('aria-label','Ajuda sobre '+definition[0]);state.key=key;
  }
  if(!root.classList.contains('active'))state.api.hide();
 }
 if(!document.getElementById('priorities')?.classList.contains('active'))window.sriPriorityScoreHelp?.hide();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.sriInstallMenuHelp());else window.sriInstallMenuHelp();
})();
