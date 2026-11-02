# Radar de Mercado — Fase 7.1

## Auditoria antes das alterações

Branch isolada: `feature/radar-stabilization-paper-v71`, worktree separado, base `b4d6b3e` da v7.0 validada. O worktree original contém documentação/evidências pendentes da v7.0; foram preservadas sem stash, reset ou sobrescrita. Nenhuma alteração na main.

| Versão / PR | Head auditado | Base do PR | Estado real |
| --- | --- | --- | --- |
| main | 00b333d | — | Versão antiga, somente index.html; não contém as melhorias recentes |
| 5.7.2 / #5 | ad6d651 | fix/coinbase-http-diagnostics-v571 | Aberto, draft, merged=false |
| 6.0 / #6 | 096e9ac | fix/coinbase-rate-limit-v572 | Aberto, draft, merged=false |
| 7.0 / #7 | b4d6b3e | feature/historical-intelligence-v60 | Aberto, draft, merged=false |

PR #5: commit funcional 1a71550, documentação 350aaf9/ad6d651. PR #6: integração do redesign 29ef242/3f75a80 em c8b412c, API/estatísticas 813a652, correção mobile e6f694e e evidências 096e9ac. PR #7: interface/política 4b05546 e correção de validade temporal b4d6b3e. Campos merge_commit_sha em PR aberto representam merges de teste, não integração. Nenhum dos três foi incorporado à main, embora tenham CI aprovado.

A base v7 incorpora por ancestralidade coletor 5.7.2, estatísticas 6.0 e redesign. Matemática compartilhada v5.7, engine.js e statistics.js são preservados. Scanner/gráfico: Binance Spot USDT. Coletor/D1: Coinbase Exchange USD. A política local v7.0-observe-1 não herda evidência de instrumentos/moedas diferentes. A regra histórica de empate EMA do coletor é mantida; não foi introduzida estratégia nova.

Preview confirmado pela API: site versão 32ac8d3c-06a2-4144-8d08-e9035aa2ddb1 (03:37 UTC); coletor com mesmo ETag 3fa23aa03b432537448217bc2628bfd278feecfde3ba4bd3302bdf97ae905d2e e modificação 00:29 UTC. Produção conserva modificação 31/10/2026 20:18:49 UTC. Cron `*/5 * * * *` e binding DB para a583aa28-6961-4f6c-a490-e8c4bf560816 confirmados, sem alteração.

Consulta D1 somente leitura em 02/11/2026: 377 observações (359 v5.7 e 18 legadas), 1.113 resultados, zero resultados órfãos; todas as consultas retornaram rows_written=0. Execução armazenada 11:55 UTC: três ativos HTTP 200, 180 candles, sem lacunas/duplicatas. 12:00 UTC: BTC 200/180 candles, ETH 429, SOL adiado pelo cooldown. Isso confirma funcionamento do agendamento e recuperação parcial, não eliminação do rate limit. Não foi feita sondagem ativa à Coinbase.

Rechecagem final via API autenticada do Cloudflare, 17:13 UTC: Cron inalterado; registros 17:00/17:05/17:10 UTC confirmam cadência. Às 17:05 os três ativos retornaram HTTP 200/180 candles, sem lacunas/duplicatas, idades 51–55s; às 17:10 SOL recebeu 429 e os demais foram adiados pelo cooldown. SELECT limitado aos três últimos registros: rows_read=3, rows_written=0, changed_db=false. GETs públicos /health e /probe feitos pelo Python deste ambiente retornaram HTTP 403, corpo Cloudflare `error code: 1010`; portanto o acesso público desses endpoints não foi confirmado nesta origem. Não confundir o bloqueio de acesso HTTP com falha do Cron, nem afirmar que toda a infraestrutura está saudável. Não foram alteradas regras de segurança para contornar o bloqueio.

Testes de entrada: 164 casos Node executados e aprovados. Workflow Node 22 aprova testes, sintaxe e build. Testes existentes cobrem indicadores matemáticos, persistência D1/SQLite, migrações locais, cooldown/concorrência, estatísticas, filtros, separação metodológica e política v7.0. Harnesses Chromium existentes cobrem navegação e quatro larguras; não equivalem a Safari real.

## Achados e gravidade

| Prioridade | Achado | Tratamento |
| --- | --- | --- |
| P1 / alta | main desatualizada e PRs empilhados ainda não integrados; publicar main causaria regressão | Base preservada na branch v7, sem merge automático; revisão da cadeia de PRs continua necessária |
| P1 / alta | Demo educacional existente não é base de execução automática com risco, atomicidade e diário durável | Novo Paper Trading Engine independente, sem substituir o demo nem ligar estratégias |
| P2 / média | /collector-history falha com relatório válido JSON contendo null; um único registro derruba monitoramento | Falha reproduzida; corrigir parser isolando relatórios/itens inválidos e duplicados, sem regravar D1 |
| P2 / média | Consultas REST Binance podem ficar penduradas sem timeout | Limitar espera a 8s, sem aumentar frequência ou acrescentar consultas |
| P2 / média | createRecord aceita relógio NaN e persiste registro que depois não pode ser restaurado | Falha reproduzida; validar tempo, identidade da política e referência antes de registrar |
| P2 / média | 429 externo persiste; fonte não garante atualização intraminuto em todos os ativos | Preservar cooldown/Retry-After/lease; simulador exigirá cotação explícita recente, não observação D1 antiga |
| P2 / média | Diário v7 local/manual, não auditado externamente e sujeito a quota/viés de seleção | Não serve como credencial para execução; nova carteira terá armazenamento separado e replay verificável |
| P3 / baixa | Lógica de apresentação extensa inline e harnesses com algumas asserções de texto | Não reescrever agora; ampliar testes comportamentais dos módulos puros e regressão |
| P3 / baixa | Dependência externa do CDN do gráfico | Não adicionar dependências; indisponibilidade não poderá gerar preenchimentos no novo motor |

Não há arquivos duplicados literalmente substituíveis: petroleo.css é a base usada por digital.css; engine.js atende backtest, demo inline atende educação e o novo módulo atende futuras propostas simuladas. São responsabilidades distintas. EMA/RSI já usam indicators.js; as leituras de volatilidade possuem uso/política documentados. Nenhum framework, modelo de IA, serviço pago ou credencial novo.

## Arquitetura do Paper Trading Engine

Módulos ES independentes em paper/: valores inteiros em micros da moeda e 1e-8 do ativo, risco determinístico, execução somente fictícia e armazenamento com compare-and-swap. Carteira long Spot, sem alavancagem, separada por moeda. Propostas e cotações têm instrumento/fonte/horário explícitos. Bid/ask e liquidez são obrigatórios; candles/observações não são preço executável.

Entrada e saída cobram taxas e slippage conservadores. Stop é gatilho, não preço de execução garantido: gap é preenchido no bid disponível, e falta de liquidez bloqueia o preenchimento e novas entradas. Limites por operação/dia/exposição/quantidade de posições; bloqueios persistentes e reativação explícita. Novas entradas exigem cotações recentes de toda a carteira. Duplicatas são idempotentes, conflitos de ID rejeitados e decisões registradas.

Diário de comandos com replay e versão atômica, adaptadores em memória (testes) e IndexedDB (uso futuro explícito). Reinício não reexecuta ordens. Falhas de armazenamento impedem aprovações. Nada é conectado à interface, ao coletor, à IA, ao Cron ou a APIs de corretoras nesta fase. Persistência D1 do simulador dependerá de desenho e eventual migração autorizada, sem usar as tabelas históricas existentes.

## Correções realizadas

- `historical.js`: parser tolerante a JSON nulo/não-array, itens inválidos e símbolos repetidos. Isola o item/relatório como não classificado e expõe malformed_reports/malformed_items. Não atribui sucesso ou erro HTTP a informação ambígua, não reescreve os registros.
- `dashboard.js`/`index.html`: parser compartilhado da apresentação evita falha nos cards e detalhes; alinhamento sem prova HTTP/candles não recebe “Candles validados”. Fixture antiga atualizada para exigir dados completos; novo teste cobre relatório incompleto.
- `intelligence.js`: avisa sobre diagnósticos incompletos sem esconder os ativos válidos.
- REST Binance: limite de espera de oito segundos, incluindo leitura do corpo pelo sinal de abort. Fallback com AbortController para navegadores sem AbortSignal.timeout. Mesmos endpoints, limites e cadência; nenhuma nova consulta ao provedor.
- `opportunity-engine.js`: registros rejeitam relógio não inteiro/NaN, política estrangeira e referência inválida antes da persistência. Critérios de mercado e metodologia v5.7 não mudaram.

Não são corrigidos artificialmente os erros 429 externos: mantêm-se lease, rotação, espaçamento, Retry-After, backoff e ausência de retentativa inline. Não há substituição de fonte. Dados atrasados continuam bloqueados. O contador legado evaluated do coletor contabiliza tentativas protegidas por INSERT OR IGNORE; usar COUNT em results para quantidade efetiva, não interpretar o contador como novas linhas.

## Paper Trading Engine implementado

### Arquivos e responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| paper/engine.js | Propostas, cotações, preenchimentos fictícios, stops, revisão de sessão, diário com replay e idempotência |
| paper/risk.js | Fonte/moeda, frescor, liquidez, spread, stop, exposição, risco por posição e diário |
| paper/money.js | Aritmética inteira, arredondamento conservador, taxas e slippage |
| paper/store.js | Compare-and-swap atômico em memória e IndexedDB nativo; sem corretora/mercado |
| paper/integrity.js | Encadeamento SHA-256 da configuração e dos eventos para detectar corrupção acidental |
| paper/package.json | Declara módulo ES, sem dependências |
| tests/paper-trading.test.mjs | Contabilidade, limites, falhas, restart e concorrência |
| tests/stability-v71.test.mjs | Regressões reproduzidas e tratamento de diagnóstico/timeout/relógio |
| scripts/test-paper-v71.py | IndexedDB real com reload e duas instâncias, em perfis de teste isolados |

O módulo não é importado pelo index.html nem incluído no bootstrap do dashboard. Não há runner automático, estratégia integrada, timers de negociação, IA, rede de mercado, API de conta ou credencial. Os stops são somente reação simulada a uma chamada explícita onQuote com cotação válida. O demo e backtest anteriores permanecem intactos.

### Contratos

- `PaperTradingEngine.open({walletId, store, config?, clock?})`: config obrigatória para criar carteira; sem config, só restaura carteira existente. Nunca recria silenciosamente capital após perda de arquivo. Configuração existente não pode mudar sem carteira nova.
- `resume({id, reason, now?})`: revisão explícita do operador a cada instância/reinicialização; não remove bloqueio diário nem libera posição sem cotação recente/liquidez ou stop ainda ativo.
- `onQuote({id, quote, now?})`: entrada de dados confiável, marca patrimônio e processa saídas protetivas fictícias. Não abre posições sozinho.
- `strategyPort(strategyId).submit(proposal)`: capacidade limitada para estratégia futura. Não permite passar preço/cotação, relógio ou comandos de revisão. Usa somente o último livro armazenado pelo canal onQuote e o relógio do host. StrategyId é fixado pelo host; outra estratégia não pode fechar suas posições.
- `submit(proposal, quote, {now}?)`: API do host confiável para testes/execução; não deve ser entregue à estratégia não confiável. Action open/close, ID único, instrumento completo, quantidade e stop para entrada; saída integral com positionId. Parcial, short, margem e alavancagem não implementados e não aceitos silenciosamente.
- `reportFailure({id, code, now?})`: circuito persistente para NETWORK/PROVIDER/DATA/STORAGE. Atualizar dados não reativa entradas automaticamente.
- `snapshot()`: caixa, patrimônio indicativo líquido, posições, realizados/não realizados, custos e histórico; freshness e possibilidade de liquidação aparecem separadas dos números estimados.
- `lookup(id)`/`exportJournal()`: resolver confirmação perdida e obter cópia do diário sem reexecutar ordens.

Cotação obrigatória: instrument `{provider, market, base, quote, symbol}`, timestamp at em ms, sequence monotônica, bid/ask, bidSize/askSize e available=true. Permitidos inicialmente BTC/ETH/SOL Binance Spot USDT e Coinbase Exchange Spot USD em carteiras distintas. Coinbase usa símbolo de mercado BTC-USD, não o identificador interno BTCUSD do D1. Sem conversão automática de moeda ou feed. Não aceitar candle, observação ou preço sugerido pela estratégia como livro executável.

### Carteira, risco e execução

Uma carteira usa uma moeda (USD ou USDT). Dinheiro em micros (1e-6), ativo em unidades de 1e-8, intermediários BigInt; precisão excedente e overflow são rejeitados. Compras e taxas arredondam contra a carteira; vendas arredondam para baixo. Caixa não fica negativo, posições são compradas Spot.

Padrões: 10.000 unidades fictícias, risco planejado de 1% do patrimônio por entrada, perda diária de 3%, três posições, exposição máxima de 25% por ativo, taxa de 10 bps e slippage de 5 bps por lado, spread máximo 100 bps, cotação com até 30s. Limites configuráveis, com faixas finitas; maxQuoteAgeMs nunca acima de 60s. Um basis point é 0,01%.

Perda planejada inclui entrada + custos menos liquidação no stop com custos/slippage. Orçamento diário considera drawdown realizado/não realizado e reservas de todas as posições; o cálculo é conservador e pode bloquear antes do limite. Exposição agrega lotes do mesmo ativo; exige liquidez de entrada e saída para todas as posições do instrumento. Book/sequence repetido não repõe volume consumido.

Patrimônio = caixa + liquidação estimada ao bid após custos. PnL não realizado = essa estimativa menos custo de entrada. Dia UTC: âncora no patrimônio da última marca conhecida ao primeiro comando do novo dia; pode incluir gap de preço, não é uma cotação inventada de meia-noite. Perda diária fica bloqueada até o próximo dia, mesmo que o preço recupere. Falha crítica ainda exige revisão.

Stop é gatilho, **não garantia de perda máxima**. Gap é preenchido ao bid disponível, não ao preço antigo do stop. Excesso de perda aciona bloqueio. Sem liquidez, não há preenchimento inventado: posição continua aberta, saída rejeitada no diário e novas entradas bloqueadas. Valor do patrimônio fica indicativo quando marcas estiverem antigas ou ilíquidas.

Comparação de custos: política v7.0 usa custo descritivo total 0,2%; backtest anterior tem seus próprios parâmetros; Paper Engine padrão soma aproximadamente 0,3% por ida/volta, além do spread. Não se herda “evidência favorável” de um modelo de custos para outro. Estratégias futuras precisam reavaliação comparável antes de conexão.

### Persistência e falhas

Cada comando válido produz decisão aprovada/rejeitada em diário atômico com versão. Repetir a mesma proposta/ID retorna a decisão anterior sem novo preenchimento; payload conflitante é rejeitado e auditado. IDs reservados de protótipo são proibidos. Duas instâncias concorrem por compare-and-swap, até quatro tentativas locais; não há retentativa de mercado.

Restore reconstrói caixa/posições/custos pelo replay, confere decisões, versão e encadeamento SHA-256 incluindo configuração inicial, rejeita forma/esquema corrompido. Não reexecuta rede ou ordens. Nova instância começa sem revisão, mesmo que o último processo estivesse ativo. Cotações restauradas servem somente como marcas indicativas: precisam de nova entrega pelo host na sessão e revisão explícita antes de uso pela estratégia. Falha do provedor invalida a capacidade de execução dos livros guardados, inclusive para saídas: nunca se preenche ordem com preço em cache de uma fonte interrompida. Store que falha ou perde confirmação deixa estado indeterminado, trava a instância e retorna PERSISTENCE_UNCONFIRMED: não presumir rejeição, consultar ID/diário depois da recuperação. Confirmação perdida não duplica posição.

IndexedDB usa banco próprio radar-paper-trading-v1 e transação readwrite para comparar versão e gravar atomicamente. Abertura só ocorre quando invocada explicitamente; testes usam perfis isolados. Não usa localStorage antigo nem D1. Memória é adaptador de teste, não promete durabilidade sem export/import. Limite de 10.000 eventos por diário: bloqueio explícito, sem exclusão automática; arquivamento/checkpoints são pendência antes de simulação contínua.

Erros de precondição (ID/tempo inválido), concorrência esgotada ou store indisponível podem não ser auditáveis no próprio store; nunca retornam execução aprovada. Um diário local não fornece autenticação nem prova criptográfica contra quem controla todo o armazenamento. API do host/store/canal de cotações são fronteiras confiáveis; o port não é um sandbox para executar código arbitrário de IA.

## Validação executada

- Suíte Node local: **216 testes, 216 aprovados, zero falhas**, incluindo os 164 casos anteriores e 52 novos. Comando detalhado neste ambiente Node 24: `node --test --test-isolation=none tests/*.test.mjs`. O comando padrão `node --test tests/*.test.mjs` também terminou com código zero (12 arquivos); Actions continua usando Node 22.
- Sintaxe dos módulos existentes e `paper/*.js`, build `node scripts/build-preview.mjs` e `git diff --check`: executados com sucesso. Os módulos Paper não entram no artefato do dashboard.
- Chromium: interface v7.0, histórico Fase 6 e compatibilidade do dashboard em 1440, 768, 390 e 375 px; navegação, gráfico, scanner, diário/exportação, educação, demo, laboratório, filtros, paginação e estados de falha. Sem erro de página/console ou rolagem horizontal. Fixtures de mercado são capturas reais anteriores, com relógio fixo, e não representam preços atuais. Fixtures sintéticas são usadas somente nos testes de risco/persistência.
- IndexedDB nativo em Chromium 1440/390 px: carteira restaurada após reload, caixa 9.900/posição única, sessão desarmada, cache não executável, duplicata sem preenchimento e concorrência com uma única entrada aprovada.
- Evidências JSON: `artifacts/paper-v71-browser.json`, `artifacts/v71-browser.json`, `artifacts/v71-history-browser.json`, `artifacts/v71-compat-browser.json`. Capturas geradas localmente em `artifacts/v71-*.png`, preservadas fora do commit para não duplicar os binários da v7.0.
- Safari real não foi testado; Chromium com dimensões de iPhone não equivale a validação em aparelho. Necessária revisão manual no iPhone antes de ativar qualquer nova experiência.

## Publicação e preservação

Entrega pelo [PR #8](https://github.com/rvc3527-cell/radar-de-mercado/pull/8), contra `feature/radar-simple-digital-v70`, preservando a revisão empilhada e sem merge automático. Commits: `cff129b` (correções isoladas) e `65308fa` (simulador/testes/evidências). [GitHub Actions 41488631914](https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41488631914) aprovado no commit `65308faff07f8be33fae69706cc353d87c9cbfea`; logs Node 22 confirmam 216 testes, 216 aprovados, zero falhas, mais sintaxe e build aprovados. Atualizações documentais posteriores têm suas próprias execuções na aba Actions.

Nenhuma implantação nesta fase: Preview permanece na v7.0 já publicada, coletor permanece 5.7.2, Cron/bindings preservados. Nenhuma migração SQL nova, nenhum índice/tabela criado remotamente, nenhum dado histórico alterado/apagado. Contagens D1 acima são uma fotografia de auditoria; o Cron continua acrescentando dados normalmente. Produção intocada.

## Pendências e próxima etapa

1. Revisar PRs #5/#6/#7 e este PR antes de decidir sua integração; main permanece antiga.
2. Revisão manual Safari/iPhone, limite/quota e descarte de IndexedDB pelo sistema operacional. Dados locais exigem exportação; não são backup de servidor.
3. Criar adaptador de cotações confiável e validado com bid/ask/liquidez/sequence, orçamento de requisições e relógio do host. O coletor de candles de cinco minutos **não** é feed executável de 30 segundos. Nenhuma consulta de mercado foi acrescentada pelo Paper Engine.
4. Projetar arquivamento/checkpoints, recuperação operacional e monitoramento antes de simulação contínua; replay é limitado e revalida todo o diário, portanto não atende alta frequência. Ao atingir 10.000 eventos, o motor bloqueia inclusive novos comandos protetivos; não usar como sistema autônomo antes de resolver capacidade e continuidade.
5. Definir estratégia determinística de referência, validação prospectiva e custos comparáveis. Somente depois conectar propostas ao port de risco, ainda com dinheiro fictício e revisão de segurança. Sem integração de IA nesta fase.
6. Eventual persistência no servidor exigirá autenticação/autorização, idempotência transacional, retenção e revisão específica de migração D1. Não foi criada API de escrita pública.

Próxima etapa recomendada: revisão do PR e ensaio prospectivo limitado com feed controlado e estratégia determinística, após resolver arquivamento e proteção de continuidade. Nenhuma promessa de lucro, probabilidade não calibrada ou execução financeira real é introduzida.
