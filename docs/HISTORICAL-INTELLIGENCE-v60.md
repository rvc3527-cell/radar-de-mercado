# Fase 6 — Histórico e Inteligência Estatística

## Auditoria e integração

Branch exclusiva: `feature/historical-intelligence-v60`.

Base backend: `fix/coinbase-rate-limit-v572` (`ad6d651`), incluindo lease persistente, rotação, pacing, cooldown, /probe armazenado e indicadores v5.7. Base frontend: `feature/petroleo-coral-redesign` (`3f75a80`). Integradas no commit `c8b412c`, preservando ambos os históricos. A integração foi automática; o helper de testes recebeu tanto a transação batch do coletor quanto o carregamento do dashboard.

O teste imutável do redesign ainda comparava coletor/esquema à v5.7.1. Atualizado para o esquema integrado v5.7.2. Um teste adicional compara o coletor inteiro à base v5.7.2, retirando apenas a importação e o encaminhamento às rotas novas. `indicators.js`, `statistics.js`, `engine.js` e o esquema integrado permanecem byte a byte. Não alteramos as regras do scanner, laboratório ou resultados recentes existentes.

Já existiam /health, /probe, /observations e estatísticas de um recorte recente/local. Faltavam paginação no D1, total do filtro, filtros completos, agregação histórica limitada e monitoramento por período. Foram implementadas somente essas extensões e sua apresentação na seção Observações do dashboard existente.

Infraestrutura confirmada pela API: binding DB do coletor aponta ao D1 experimental `a583aa28-6961-4f6c-a490-e8c4bf560816`; Cron `*/5 * * * *` criado em 31/10/2026. Nenhuma alteração de Cron, binding, fonte, moeda ou credenciais foi necessária.

## APIs somente leitura

Os três endpoints novos aceitam GET, reutilizam o CORS restrito ao site Preview e retornam `api_version: v6.0`. O motor de coleta continua `version: 5.7.2`, e a matemática continua `methodology_version: v5.7`.

| Rota | Parâmetros | Limites |
| --- | --- | --- |
| `/history` | `from`, `to`, `symbol`, `horizon`, `methodology`, `order`, `limit`, `cursor` | 366 dias; 1–100 observações/página, padrão 25 |
| `/statistics` | mesmos filtros, mais `cost` | 31 dias; até 5.000 observações; custo total 0–5%, padrão 0,2% |
| `/collector-history` | `from`, `to` | 7 dias; até 2.200 execuções |

Datas: milissegundos Unix ou data/ISO UTC. Sem datas futuras ou impossíveis. Intervalo fechado `[from,to]`, padrão sete dias para observações e um dia para monitoramento. `symbol`: BTCUSD, ETHUSD, SOLUSD. `horizon`: 1, 3 ou 5; ausente inclui os três. `methodology`: uma única versão; padrão v5.7. `legacy-unversioned` seleciona NULL/vazio sem atribuir uma nova metodologia. O cliente sempre envia datas explícitas; para continuar uma página, preserve os filtros devolvidos, inclusive from/to. Cursor não é uma assinatura de segurança: é uma posição validada, não dá acesso especial e continua submetido aos mesmos filtros e SQL parametrizado.

Exemplo:

```text
/history?from=2026-11-01&to=2026-11-02&methodology=v5.7&symbol=BTCUSD&horizon=5&limit=25&order=desc
```

Datas simples são meia-noite UTC. Para o dia inteiro, use o próximo dia ou o instante final desejado. A UI usa início/fim do dia UTC, truncando o fim ao horário atual.

Erros de entrada retornam 400; recortes acima dos limites de volume retornam 422; falhas D1 retornam 503 com mensagem compreensível, sem SQL/credenciais. O painel lida com falha parcial por módulo e não deixa resultados anteriores aparentarem pertencer a um novo filtro. Cache HTTP de 30s nas agregações; /history no-store. Não é um cache D1 compartilhado nem uma garantia de redução de leituras: o servidor continua protegido por limites de período e volume. Sem novas chamadas à Coinbase, retentativas, dependências pagas ou serviços adicionais.

### Estrutura das consultas

1. COUNT na tabela observations, sem JOIN, para o total real de observações do filtro.
2. CTE seleciona `limit+1` observações por `(time,symbol)`; somente depois faz LEFT JOIN por `(symbol,time)` a results. Isso evita dividir horizontes de uma observação entre páginas ou multiplicar a contagem por três.
3. Cursor keyset usa `time < cursor.time OR (time = cursor.time AND symbol > cursor.symbol)` para desc, invertendo apenas o comparador temporal para asc. Não há OFFSET. Ordem estável nos empates.
4. Agregação lê até 5.001 observações antes do JOIN, recusa excesso e processa até três resultados por observação dentro do Worker. O navegador recebe grupos e gráficos resumidos, nunca o banco inteiro. Contagem e seleção não formam um snapshot transacional: registros acrescentados durante a navegação podem mudar o total; não alteram páginas já recebidas. Os resultados de uma observação podem amadurecer entre consultas.
5. Monitoramento usa faixa da chave primária started_at, um MIN indexado para início conhecido da instrumentação e no máximo 2.201 relatórios.

Índices existentes: `obs_time(time)`, PK observations `(symbol,time)`, PK results `(symbol,time,horizon)` e PK collector_runs `(started_at)`. Teste EXPLAIN confirma uso de obs_time. Não foi necessário criar tabelas/índices. Com maior volume, revisar custo real das contagens e DISTINCT de metodologias antes de propor índices/materialização. Os limites são deliberados e mensagens pedem reduzir o período/ativo.

## Regras estatísticas

- Somente uma metodologia por resposta. Legados preservados e identificados, origem e moeda não comprovadas não são assumidas. O D1 v5.7 contém coleta prospectiva Coinbase USD; diário Binance USDT e testes retrospectivos permanecem separados.
- Chaves compostas impedem duplicações no D1. A agregação também valida números, timestamps alinhados, direção e preço; exclui duplicados e versões incompatíveis defensivamente, com contadores.
- Total de observações não é total de resultados. Avaliada exige todos os horizontes selecionados. Parcial integra pendentes. Pendente não é desfavorável; zero é neutro e conta como avaliado.
- Seleção por ativo/horizonte/metodologia em ordem cronológica: aceita a primeira janela e as seguintes a partir de seu término. Seleciona **antes** de olhar os resultados, incluindo pendentes para evitar seleção condicionada à disponibilidade. Sem sobreposição dentro do recorte filtrado; mudar o início pode mudar a seleção. Horizontes e ativos continuam podendo compartilhar contexto.
- Favorável: directional_pct > 0; desfavorável < 0; neutro = 0. Denominador: somente avaliações válidas selecionadas. As proporções são frequências descritivas.
- Bruto = directional_pct persistido; líquido = bruto menos custo total configurado, uma vez por avaliação. Média aritmética, mediana exata, positivos líquidos e baseline de compra no mesmo instante (directional_pct × direction menos custo). Sem somar como saldo ou retorno de carteira, sem impostos/spread reais presumidos.
- Gráficos de médias/distribuição exigem n >= 30 por grupo. Evolução média diária exige n >= 30 naquele dia. Trinta não é comprovação de validade estatística. Contagens/monitoramento mostram o que foi registrado e não exigem esse tamanho.
- Seis visualizações SVG leves: contagem por dia, distribuição, comparação de ativos, comparação de horizontes, média diária bruta/líquida, disponibilidade. Sem preencher lacunas com preços/observações inventados.

## Monitoramento

Disponibilidade por ativo/dia = slots completos de 5 min com candles confirmados / slots esperados. Exclui o slot atual incompleto e períodos anteriores ao primeiro registro confirmado. Caso não exista registro, o denominador é zero, sem disponibilidade inventada. O último relatório de cada slot é escolhido sem contar execuções repetidas duas vezes. Última execução e último sucesso dentro do período são distintos do estado atual consultado por /health.

Distingue 400, 429, API_NETWORK, cooldown sem chamada, coletas rejeitadas por integridade, falhas diversas, relatórios antigos não classificados e slots sem execução. Soma minutos ausentes e duplicatas diagnosticados; “coletas rejeitadas” não afirma quantos candles foram descartados. Períodos confirmados por cooldownUntil são unidos antes da soma, com limites do recorte; não se infere duração de relatórios que não tinham essa informação. Até 50 períodos detalhados são enviados, com total completo. Ausência de execução não é classificada como erro de rede. /health mantém a distinção entre Worker respondendo, estado do provedor e frescor por ativo. A UI atualiza a cada cinco minutos apenas na seção visível e se a opção de atualização da nuvem estiver ativada.

## Banco, implantação e reversão

**Nenhuma migração, DDL ou escrita dos endpoints novos.** Não executar migrations novamente. Nenhum dado histórico é recalculado. O agendamento normal pode continuar acrescentando observações/resultados/diagnósticos conforme v5.7.2.

Artefato UI: `node scripts/build-preview.mjs` inclui intelligence.js, CSS e todos os arquivos anteriores. Coletor: publicar os módulos cloud-collector.js, indicators.js e historical.js com a configuração existente, exclusivamente em radar-cloud-collector-preview. Site exclusivamente radar-de-mercado-preview. Preservar bindings/compatibility_date/flags e Cron; conferir versões e endpoints após publicação. Produção não recebe uploads nem merge automático.

Reversão de código: restaurar versão anterior do site e coletor v5.7.2. Não reverter banco nem remover registros. Rotas antigas continuam disponíveis. A fase 6 não requer estado adicional para continuar a coleta ou para restaurar a UI anterior.

## Verificação

Comandos e resultados finais, links CI/deploy e capturas estão na seção de evidências abaixo. `scripts/test-intelligence.py` usa o dataset real capturado em artifacts/market-snapshot.json (arquivo de trabalho ignorado) e os handlers reais contra SQLite por meio de scripts/serve-history-fixture.mjs. Mocks matemáticos e de falhas existem apenas nos testes. Não consulta a Coinbase. Chromium em 1440, 768, 390, 375 px; sem alegação de teste Safari real. Capturas são do cenário reproduzível, não prova de disponibilidade atual da fonte. Não confundir métricas locais de carregamento com Core Web Vitals de campo.

### Evidências locais

- Node.js 24.19.0: **135 testes executados, 135 aprovados, zero falhas** (`node --test --test-isolation=none tests/*.test.mjs`). A opção de isolamento permite contar os casos reais neste ambiente; a suíte também será executada normalmente no Node 22 do Actions.
- Sintaxe: coletor, módulo histórico, indicadores, estatísticas compartilhadas, motor, dashboard e intelligence.js verificados. Artefato Preview gerado e testado por igualdade dos arquivos servidos. `git diff --check` aprovado.
- Chromium: quatro larguras, navegação, canvas de candles, paginação ida/volta, filtros combinados, custo, gráficos SVG, estados vazios e falha de rede. Zero pageerrors e nenhuma rolagem horizontal da página. `artifacts/intelligence-browser.json` contém resultados e métricas locais. Primeiro conteúdo visível entre 0,2–0,5s no cenário local capturado; não é benchmark de rede móvel.
- Capturas: `artifacts/intelligence-{1440,768,390,375}.png` e `artifacts/intelligence-charts-{1440,390}.png`. Dataset real capturado em 01/11/2026 às 15:28:29 UTC. Não são dados inventados nem evidência de disponibilidade atual.
- Pré-publicação: D1 tinha 286 observações e 846 resultados. Impressões FNV-1a de 64 bits (comparação de conteúdo, não prova criptográfica), ordenadas por rowid: observações até rowid 286 = `83e176e4b38a28ad`; resultados até rowid 846 = `6162e9bc1323823c`. Todas as consultas da auditoria retornaram rows_written = 0. Os mesmos subconjuntos serão conferidos após o upload; novos registros normais do Cron não devem ser confundidos com alteração do histórico.
