# Revisão visual integrada — SAC Retorno Intelligence

**Data:** 23/11/2026  
**Tipo:** revisão de interface e regressão visual transversal  
**Referência:** identidade Híbrido Moderno (barra azul, menu branco expansível, conteúdo claro)

## Escopo e diagnóstico

A revisão foi feita sobre a estrutura HTML/CSS vigente dos módulos do Intelligence e a imagem de referência enviada para o login. As quatro etapas visuais anteriores são preservadas. O trabalho desta etapa é deliberadamente incremental: **não modifica scripts de negócio, autenticação, critérios de prioridade, distribuição, importação, tratamento, persistência ou modelos de PDF**.

| Tela/módulo | Ponto observado na revisão de código/estrutura | Tratativa |
| --- | --- | --- |
| Login / Home | Selo exibia `INTELLIGENCE 2.0`, não o nome completo do produto. Texto mais longo exige adaptação responsiva. | Substituir por **SAC Retorno Intelligence**, com largura e quebra responsivas. |
| Gestão Operacional | Os cards e indicadores já haviam sido refinados, mas precisam acomodar valores volumosos e descrições longas. | Reforçar largura mínima zero, medidas numéricas tabulares e quebra de textos de apoio. |
| Distribuição | Tabelas amplas, nomes de operadores/filas e mensagens de filtro podem crescer significativamente. | Manter rolagem horizontal interna e acomodação de nomes longos sem cortar informações. |
| Central de Prioridades | Informações de nível, motivo e responsável podem ser extensas. | Proteger células e títulos contra estouro; padronizar foco e rolagem interna. |
| Carteira por Operador | Identificações e nomes podem exceder a largura prevista na tabela. | Proteger coluna de nomes, contêiner e leitura de valores tabulares. |
| Inteligência e Tendências | Gráficos, filtros e tabelas são apresentados em diferentes componentes. | Alinhar leitura transversal e prevenir overflow nas comparações. |
| Central de Relatórios | Seleção de opções e metadados de extração possuem textos de comprimentos variáveis. | Proteger etiquetas/metadados e manter responsividade do painel. |
| Importar Bases | Nomes de arquivos, estados da extração e avisos podem ser longos. | Permitir quebra segura, manter ação de processamento em evidência e preservação de estados. |
| Base e Qualidade | Filtros e tabelas extensas podem gerar rolagem fora do contêiner. | Reforçar a rolagem na própria tabela, a leitura de dados e a acessibilidade. |
| Minha Carteira / Minha Conta | Blocos voltados ao operador usam componentes próprios. | Uniformizar títulos, resumos, cartões e tratamento de conteúdo extenso. |
| Fechamento Operacional / Configurações | Filtros de data/equipe e ações administrativas apresentam tamanhos variados. | Organizar alinhamento, larguras mínimas e comportamento móvel. |

## Padronização aplicada

1. **Identidade:** selo do login identifica o produto pelo nome, sem número da versão; meta tags e versionamento interno foram preservados.
2. **Hierarquia:** títulos de módulos de operador, fechamento e configuração usam o mesmo padrão editorial da área gerencial.
3. **Legibilidade:** quebra de palavras muito longas em textos de apoio, status, etiquetas e mensagens.
4. **Tabelas:** rolagem horizontal interna para evitar que uma coluna longa alargue toda a página.
5. **Navegação e campos:** foco visível em teclado, espaçamento e contenção de filtros gerais.
6. **Responsividade:** regras específicas para notebooks, tablets e celulares sem remodelar a navegação aprovada.
7. **Isolamento:** a revisão CSS atua apenas em `@media screen`, sem mudar layout dos documentos impressos.

## Homologação automatizada

Além dos testes integrados existentes de login, funções operacionais e PDF, foi adicionada uma revisão com **dados fictícios**, contemplando identificadores longos, operadores/filas extensos, números elevados e tabelas com múltiplas linhas.

- **Desktop:** 1440 × 900 — 11 módulos.
- **Notebook/tablet:** 1024 × 768 — 7 módulos.
- **Celular:** 390 × 844 — 11 módulos.
- **Capturas de referência:** Gestão Operacional, Distribuição, Relatórios, Base e Qualidade e Importar Bases em resoluções representativas.
- **Verificações:** visibilidade do módulo, largura do contêiner principal, overflow da página e preservação dos elementos de interface.

### Limites da evidência

A homologação sintética avalia **apresentação e estrutura**. Ela não confirma, isoladamente, a aparência de todas as combinações com dados reais e permissões de usuários autenticados, nem substitui o teste operacional com os CSVs da equipe. Nenhuma informação sensível de beneficiário foi usada nos cenários de teste.

**Validação operacional recomendada:** conferir com dados reais (na sessão autorizada) nomes/filas extensos, carteira numerosa, status e alertas, casos de erro de importação, histórico de extrações, comparativo de datas, visualização de operador, filtros gerenciais e relatório PDF.

## Critérios de aceite

- [ ] O selo do login apresenta apenas **SAC Retorno Intelligence** em desktop e celular.
- [ ] Nenhuma das telas revisadas apresenta rolagem horizontal da página nos três tamanhos simulados.
- [ ] A rolagem necessária fica dentro das tabelas, sem cortar o conteúdo principal.
- [ ] Os testes integrados de negócio, autenticação e PDF permanecem aprovados.
- [ ] O deploy de produção corresponde ao commit homologado.
- [ ] Um operador/supervisor confirma visualmente os cenários com dados reais no ambiente autorizado.
