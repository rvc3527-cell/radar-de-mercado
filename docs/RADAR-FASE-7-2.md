# Radar de Mercado — Fase 7.2

## 1. Estado inicial e auditoria

Branch incremental `feature/paper-real-data-v72`, criada a partir de `bc7c9eb249aa5591d972dd687d90beef1594cf64` da Fase 7.1. Worktrees v7.0 e v7.1 preservados, inclusive arquivos não commitados. PR #8 aberto contra v7.0; PRs #5/#6/#7 continuam abertos/draft, sem merge na main. A main antiga não foi usada como base. Entrega será revisada contra `feature/radar-stabilization-paper-v71`.

Contratos auditados: engine recebe propostas/cotações explícitas e só retorna aprovação após CAS persistido; strategyPort não permite fornecer cotações/relógio/revisão; risco Spot comprado, custos e liquidez verificáveis; store usa transação IndexedDB; integrity usa SHA-256 encadeado para detectar corrupção, não autenticar o proprietário do armazenamento. Reinícios começam desarmados. Limite original: 10.000 eventos, sem arquivamento. Replay completo tinha custo excessivo de copiar o mapa de idempotência em cada evento.

Frontend v7.0, matemática v5.7, estatísticas 6.0 e coletor 5.7.2 preservados. Nenhuma alteração no coletor, Cron, esquema, migrações, indicadores, regras antigas, dados D1 ou produção. Carteira experimental nova, ID `supervised-btc-usd-v72`, no banco IndexedDB já separado do histórico. Não reaproveita saldos do demo anterior nem credenciais financeiras.

## 2. Modificações e arquitetura

| Arquivo | Finalidade |
| --- | --- |
| paper/market.js | Adaptador público Coinbase BTC/USD, livro L1, candles fechados, ordenação, timestamps, spread, timeout e cooldown |
| paper/strategy.js | Estratégia determinística de integração, razões e evidências reproduzíveis |
| paper/session.js | Sessão supervisionada, ativação explícita, exclusão entre abas, orçamento, estados e encerramento |
| paper/panel.js / panel.css | Painel integrado à identidade Radar 7.0, carteira, estados, custos, histórico e exportação |
| paper/engine.js | Notas auditáveis de sessão/decisão, capacidade exposta e replay sem copiar mapa de idempotência imutável a cada evento |
| paper/store.js | Acesso preguiçoso ao IndexedDB e tratamento de exceção síncrona de gravação sem execução indevida |
| index.html / dashboard.js | Rota secundária Simulação Automática; cinco rotas principais e ferramentas anteriores preservadas |
| scripts/build-preview.mjs | Inclui os módulos/CSS novos no mesmo artefato estático do Preview |
| tests/paper-integration-v72.test.mjs | Fluxo integrado, fonte, estratégia, risco, corrupção, concorrência, quota e sessão virtual de duas horas |
| tests/preview-build.test.mjs | Conteúdo/MIME exatos dos novos assets |
| scripts/test-paper-v72.py | E2E IndexedDB/Web Locks/UI com fixtures; ensaio real separado |
| .github/workflows/indicators.yml | Mantém Node 22 e suíte completa; timeout de dez minutos para cenário virtual extenso |

Sem framework, dependência de runtime, servidor de ordens, IA, serviço pago ou API pública de escrita novos. Notas são acrescentadas ao mesmo diário verificável: SESSION_CHECK/START/END/PAUSE e STRATEGY_DECISION. Notas não modificam as fórmulas nem regravam eventos existentes. Wallet v7.2 usa identificação própria: a versão anterior não deve ler os novos tipos de nota após rollback.

## 3. Fonte real selecionada

Coinbase Exchange **BTC-USD / Spot / USD**, exclusivamente. Não se mistura ao scanner Binance BTCUSDT/USDT, nem à evidência estatística de outro mercado/política.

- Livro: `GET https://api.exchange.coinbase.com/products/BTC-USD/book?level=1`. Usa bids/asks e quantidades fornecidos, sequence real, auction_mode=false e time do snapshot do provedor. Nanosegundos são truncados explicitamente para milissegundos para compatibilidade Safari, sem inventar horário local para substituir o timestamp.
- Contexto: `/candles?granularity=60&start=...&end=...`, janela explícita de 180 minutos. OHLC são contexto dos indicadores, nunca preço de execução. Validação de OHLC, duplicatas divergentes, gaps, fechamento com margem de cinco segundos, histórico mínimo 40 e referência de até 90 segundos.
- Livro validado com até cinco segundos de idade, sem futuro; motor limita a dez segundos. Sequências regressivas/conflitantes, preços inválidos, leilões e spread acima de 20 bps bloqueiam. Liquidez zero nunca vira volume inventado.
- No máximo um sample a cada 15 segundos: quatro livros e aproximadamente um contexto por minuto por navegador ativo. Inicialização faz duas consultas sequenciais; abrir o dashboard não consulta a Coinbase pelo novo módulo. Um único controlador por carteira/origem via Web Locks. Sem suporte ao recurso, ativação é bloqueada.
- HTTP 400/rede/JSON inválido pausam, sem retentativa automática. HTTP 429 grava cooldown em localStorage: Retry-After respeitado, piso de 60s; sem cabeçalho válido, cinco minutos. Uma nova instância lê o cooldown antes de consultar. Uma falha de armazenamento do cooldown também bloqueia.
- Timeout de cinco segundos por requisição. Não há rotação de IP, proxy para burlar rate limits ou substituição automática de fonte.

Documentação oficial consultada em 02/11/2026: [livro](https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductbook), [rate limits](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits) e [canais WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels). Limite público documentado: 10 requisições/s/IP, rajada até 15. Isso não elimina limitações intermitentes de IP compartilhado. Escolheu-se REST L1 com timestamp e sequência explícitos para reduzir complexidade; o snapshot REST Binance pesquisado não fornece timestamp de evento no próprio livro.

O tráfego adicional ocorre no navegador supervisionado. Cloudflare continua servindo arquivos; não há polling no Worker, binding ou processo permanente novo, nem acréscimo ao Cron. Contas/aplicativos de corretora e chaves de negociação não são usados.

## 4. Estratégia experimental

ID `ema-observe-v72`, política **v7.2-paper-test-1**, indicadores compartilhados **v5.7**. Não é estratégia validada de rentabilidade, previsão ou recomendação.

Proposta de compra fictícia somente se EMA9 > EMA21, RSI14 entre 50 e 65, dois fechamentos consecutivos de alta, faixa high-low máxima das últimas dez velas até 1%, extensão da última marca sobre EMA9 até 0,5% e livro atual confirmando a média sem desvio maior que 0,5% do último fechamento. Pode aguardar sem operar. Não herda estatísticas favoráveis da política v7.0 ou do D1.

Tamanho: 5% do caixa, limitado a USD 1.000, arredondado para baixo em 1e-8 BTC. Stop planejado em 0,5% abaixo do bid. Saída fictícia por EMA sem alinhamento, RSI >=70 ou gatilho de cinco minutos de exposição experimental; não é horizonte de lucro validado. Stop reage ao bid real do snapshot recebido, com slippage/taxas; gaps e ausência de liquidez não são disfarçados.

Todas as propostas usam exclusivamente strategyPort, com IDs derivados do instrumento/fechamento/posição, passando pelo risco existente. Notas registram razão, política, instrumento, closes e início da série uniforme, últimas dez faixas, valores EMA/RSI e proposta; é possível reproduzir os cálculos sem dados futuros. Preços, volumes, horários e sequência dos preenchimentos permanecem nos eventos do motor. Propostas rejeitadas também permanecem no diário. Não abrir nova posição no mesmo fechamento após reinício.

Configuração experimental: uma posição; exposição máxima de 10% por ativo, risco planejado por entrada 1%, perda diária 3%, taxa 10 bps/lado e slippage 5 bps/lado, além do spread. Perda diária é drawdown realizado/não realizado com âncora UTC conforme Fase 7.1; não pode ser desfeita por revisão no mesmo dia. Esses custos não equivalem automaticamente ao modelo descritivo de 0,2% das estatísticas anteriores.

## 5. Continuidade, persistência e recuperação

**Escolha deliberada: sessões supervisionadas, sem execução contínua ou arquivamento automático.** Duração de 60 ou 120 minutos; orçamento de 1.000 eventos por sessão. Antes de ativar exige espaço para todo o orçamento mais reserva de 200 eventos, estimativa de pelo menos 20 MB livres, escrita de verificação, replay íntegro e lock de exclusão. Sem estimativa/lock/armazenamento confiável, não ativa.

Cada tick verifica prazo, supervisão e capacidade antes de consultar/executar. Chegar perto do orçamento encerra novas propostas e registra encerramento com reserva. Limite de 10.000 não é aumentado. Uma carteira sem capacidade é preservada e não aceita nova sessão; não há reinicialização de capital nem exclusão silenciosa. O cenário virtual de duas horas testa o orçamento completo. O caso com 9.000 eventos válidos demonstra bloqueio antes de pedir dados.

Dados antigos e cache após restart não executam. Reload começa Desativado; restaurar não consulta a fonte nem rearma o motor. Diário mantém configuração, notas, decisões, custos e SHA-256; corrupção impede consultas/ativação. CAS atômico e IDs mantêm idempotência. Falha de quota/gravação/ack deixa execução não confirmada, pausa e exige recuperação/exportação; nunca presumir que uma confirmação perdida significa que não houve gravação.

Falta de supervisão por mais de 30s, página oculta, offline ou pagehide bloqueiam novas propostas. Eventos de fechamento de página podem não terminar de gravar: sessão START sem END deve ser considerada interrompida. Não há retomada automática. Ao pausar/encerrar, posições fictícias **podem continuar abertas sem monitoramento**; interface avisa e preserva todas. Não simula venda se não há cotação válida. Depois, nova sessão explícita precisa revalidar a carteira/fonte e pode processar stops pendentes ao primeiro livro válido.

IndexedDB local não é backup, sincronização entre aparelhos nem armazenamento permanente. O usuário precisa exportar JSON, especialmente antes de limpar dados/reverter. Limite futuro exigirá arquivos/checkpoints, restauração autenticada e testes de migração próprios; nenhuma migração D1 está prevista/executada nesta entrega.

## 6. Testes e evidências

Suíte local completa: **248 testes aprovados, zero falhas**, incluindo os 216 anteriores; mais o novo teste específico de publicação em formato módulo aprovado (249 casos totais no CI). Sintaxe, artefatos clássico/módulo e regressões existentes executados. O CI executa todos os casos juntos em Node 22 e valida o mesmo módulo que será enviado ao Preview.

E2E Chromium 1440/768/390/375: desativado sem chamadas de mercado, preflight, consentimento, geração da proposta, risco, preenchimento fictício, custos, UI, exportação, encerramento com posição residual, reload/restore sem entrada duplicada e falha de rede. Native IndexedDB e Web Locks exercitados. Fixtures são sintéticas, explicitamente identificadas; nenhum resultado é publicado como desempenho financeiro.

Regressões v7.0/Fase 6 nas quatro larguras: scanner/gráfico/histórico/filtros/paginação/educação/demo/laboratório preservados. Teste IndexedDB v7.1 1440/390 também executado. Não foi testado Safari real. Capturas PNG locais e relatórios JSON em artifacts/v72-* distinguem captura de fixtures de ensaio real.

## 7. Ensaio real e limites de validação

Pesquisa inicial retornou HTTP 200 para livro BTC-USD com sequência, quantidades e timestamp reais; candles com 181 linhas (180 fechadas + atual) e Access-Control-Allow-Origin: *. O primeiro teste nativo Chromium ficou bloqueado por `ERR_CERT_AUTHORITY_INVALID` no proxy do ambiente. Não se desativou TLS. O auxiliar de ensaio usa urllib com CA/proxy herdados e verificação TLS ativa, confirma CORS e entrega o corpo real intacto ao mesmo adaptador no navegador. Isso não equivale a certificar acesso direto Safari/iPhone.

O ensaio real é separado das fixtures e não força entrada. Ensaio prospectivo curto às 20:18 UTC de 02/11/2026 aprovado: dois livros válidos, seis eventos verificáveis, nenhuma entrada forçada; razão registrada “Aguardar: tendência e dois fechamentos de alta ainda não confirmados.” Evidências: artifacts/v72-paper-live.json e artifacts/v72-live-paper-journal.json; checksum e401be33dcfcb0ad8389b7115e8728afd6ecdcc243ca29a6920e13d687e1fd19. Ausência de operação é comportamento válido. Uma sessão curta não demonstra estabilidade durante duas horas nem rentabilidade da estratégia. A sessão virtual de duas horas demonstra orçamento/estado/recuperação, não disponibilidade futura da Coinbase.

## 8. Preview, revisão e reversão

Alvo único permitido: **radar-de-mercado-preview**, https://radar-de-mercado-preview.rvc3426.workers.dev/#simulacao. Antes do upload: confirmar alvo, binding vazio do site, ETag anterior 72cc4cc7b1a2311368fb967db7460b543a82677bf22cd7be886add9c5ab739b4, ausência de credenciais financeiras, build testado e CI aprovado. O módulo é gerado por `node scripts/build-preview.mjs dist/preview-worker.mjs --module`, mantendo o tipo de Worker já publicado; módulo e formato clássico compartilham o handler testado. Se evidências críticas falharem, não habilitar a execução experimental.

Situação de publicação ainda pendente nesta versão do relatório. Nenhum upload para produção, coletor ou D1; Cron `*/5 * * * *` e configurações existentes devem permanecer iguais. Reversão do site: republicar artefato anterior v7.0, versão 32ac8d3c-06a2-4144-8d08-e9035aa2ddb1, preservando IndexedDB/exportações. Não apagar carteira ou tabelas ao reverter.

## 9. Riscos e pendências

- Fonte pública sem SLA; 429, gaps, CORS e cache atrasado continuam possíveis. Modelo de execução usa liquidez L1 publicada, não posição de fila, impacto de mercado ou preenchimento real comprovado. Não usa dados privados de conta.
- Supervisão é obrigatória; bloqueio de tela, suspensão do iPhone, bateria ou falta de rede interrompem o fluxo. Posições residuais têm aviso explícito. Não há garantia de perda máxima ou stop durante interrupções.
- Armazenamento local pode ser removido pelo navegador. SHA-256 detecta corrupção acidental, não impede um proprietário malicioso de reconstruir todo o diário. Nenhum resultado local é prova externa autenticada.
- Replay limitado e sem arquivamento: não usar para alta frequência, operação contínua ou integração de IA. Backlog de PRs empilhados permanece para revisão humana, sem merge automático.
- Falta validação em Safari real e ensaio supervisionado longo no dispositivo do proprietário. Não confundir fixture sintética, candles capturados e amostra prospectiva real.

## 10. Como realizar uma sessão supervisionada de 1–2 horas

1. Abrir o Preview, configurações → Simulação Automática (ou rota #simulacao), em uma única aba. Manter o aparelho carregado, página visível e rede estável; não pressupor funcionamento com iPhone bloqueado.
2. Para carteira existente, restaurar e exportar antes. Conferir posições residuais e saldo; dados são exclusivamente fictícios em USD, separados de USDT. Não apagar armazenamento para contornar limites de risco.
3. Selecionar uma ou duas horas e saldo inicial apenas na criação. Clicar Verificar fonte e diário. Não iniciar se houver cooldown, dados atrasados, pouco espaço, falha de integridade ou outra aba controlando a carteira.
4. Ler custos, stop, limites e avisos. Marcar ciência e clicar Ativar sessão fictícia. O clique registra configuração/horários; se a verificação envelheceu, a ativação reconsulta respeitando o intervalo mínimo. Não há IA ou ordem financeira real.
5. Acompanhar estado, fonte, horário, razão e posições. É normal aguardar sem operar. Em pausa, exportar e investigar; não haverá reinício automático. Não tentar repetidamente durante cooldown.
6. Encerrar a sessão e exportar JSON. Conferir se ficaram posições fictícias abertas e aviso de ausência de monitoramento. Nunca anotar saída manual com preço inventado. Para novo acompanhamento, fazer nova validação/ativação explícita.
7. Registrar horário, dispositivo, interrupções e política v7.2-paper-test-1. Avaliar qualidade do fluxo e dados, sem divulgar taxa de acerto/lucro com amostra curta ou misturar métodos/moedas/custos.
