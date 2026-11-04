# Radar de Mercado — Fase 7.6

## 1. Auditoria inicial

Base auditada `feature/strategy-lab-validation-v75`, `ea4b939ea2763c02a43ed44be1185987f14d3efc`, PR #12. Branch nova `feature/provenance-candidate-v76`, worktree separado. Consulta real confirmou #12/#11/#10/#9/#8/#7/#6/#5 abertos, sem merge; main antiga não usada. Relatório v7.5, contratos, avaliador, Session, arquivo, risco, custos, telemetria, testes/build/CI foram lidos. Não se sobrescreveu trabalho das fases anteriores.

Preview auditado: `radar-de-mercado-preview`, ETag `fe1ecff2753f94b4d14fa29474beb9dbc8f2d58ef554caa26310f2e94710cdf2`, publicado 04/11/2026 01:39:21 UTC, runtime v7.5 `651295a`, SHA-256 registrado `03ac4307bab25a029d24ba7edc19994713643b0cb1496b3e020c00766df5db29`. Bindings/flags/tags/tail_consumers vazios, placement vazio, logpush false, standard. Coletor ETag `3fa23aa03b432537448217bc2628bfd278feecfde3ba4bd3302bdf97ae905d2e`, modificação 02/11/2026 00:29:16 UTC. Cron `*/5 * * * *` e timestamp 31/10/2026 23:04:23 UTC. Produção mantém modificação 31/10/2026 20:18:49 UTC. Nenhum acesso de alteração ao D1.

Achados: protocolos externos v7.5 não eram vinculados a SESSION_START; candidata era só contrato; fonte original v7.3 contém livros e evidências de estratégia, mas não série completa de OHLC/disponibilidade suficiente para reconstruir a candidata. Não reconstruir low/high/open ou disponibilidade por estimativa. Limite de nota de 16.384 caracteres exige manifesto limitado; risco de ciclo de imports resolvido extraindo configuração estável, sem alterar valores.

## 2. Proveniência implementada e limite de confiança

`lab/protocol.js`: protocolo `radar-protocol-v76`, ID explícito, versão 7.6, SHA-256 do manifesto completo, janelas, estratégia/política operacional, candidata congelada, origem, instrumento/moeda, capital/custos/risco e hashes de todos os JS empacotados. Leitor v7.5 preservado. `paper/provenance.js`: confere protocolo e igualdade exata entre hashes congelados e manifesto atual do runtime, inclusive aritmética/replay.

Selecionar arquivo em Simulação Automática chama `attachProtocol`, somente inativa e fora do preparo. Não faz consulta Coinbase nem ativa carteira. Durante início manual os hashes são conferidos novamente; divergência bloqueia antes de SESSION_START/ordens. O protocolo fica copiado/congelado, não pode ser substituído durante preparo/execução. Novas sessões `prospective-real` exigem vínculo; sessões antigas e testes desconhecidos/sintéticos sem protocolo continuam legíveis, sem promoção.

`SESSION_START.details.provenance` contém:

- Schema `radar-session-binding-v76`, protocolo inteiro, ID/versão e `manifestSha256`.
- Hashes do runtime conferidos pelo host, estratégia `ema-observe-v72` / política `v7.2-paper-test-1`, método v5.7, Coinbase Exchange BTC-USD Spot/USD.
- Configuração real da mesma carteira, capital inicial, custos/risco e janela original.
- `activatedAt` (toque/ativação), `startedAt` (início efetivo), `window` e selo SHA-256 de todo o vínculo.
- `clockTrust: client-declared`, `codeTrust: runtime-manifest-host-checked`, `independentAnteriority: false`.

O evento inteiro participa do checksum/replay. Metadados não são regravados após iniciar; backups preservam os bytes/IDs/risco. O vínculo é verificado do diário, não atribuído apenas por arquivo externo. Manifesto é limitado antes de escrever para caber na nota; arquivo de seleção <=32KB. `SESSION_CONFIG` mudou de localização para `paper/config.js`, mas continua reexportado de Session com valores idênticos.

**O que é e o que não é comprovado:** integridade, consistência do vínculo e correspondência ao manifesto servido pelo host são verificáveis. Nem SHA-256 nem um relógio do cliente provam, contra um proprietário capaz de reescrever tudo, que o protocolo existia antes do mercado ou que o código foi executado por um ambiente atestado. Não foi criada falsa assinatura/recibo externo. Não há provedor confiável de anterioridade configurado, infraestrutura ou credenciais novas. O avaliador sinaliza vínculo local íntegro, mas mantém **validação final independente bloqueada**. Isso também vale para novos vínculos; não se troca o problema antigo por confiança indevida em timestamp local.

A ativação deve ocorrer no início escolhido ou até 60s depois (tolerância congelada), nunca antes. O término permanece o fim da janela original, não é deslocado para completar 60min após um atraso. Duração efetiva pode ser menor; registrar atraso/terminação. Fuso do formulário é o do aparelho; manifesto guarda UTC em ms. Preparar/verificar dados não agenda ativação. Cada nova sessão precisa de seleção manual; não reaproveita protocolo consumido automaticamente.

## 3. Compatibilidade e preservação

Nenhuma migração de schema/IndexedDB/D1. É campo opcional dentro de nota já suportada; esquema `radar-paper-v1`, exportação v73 e arquivo `radar-paper-archive-v1` permanecem. Leitores v7.2–v7.5 continuam aceitos. Sessões antigas ficam sem vínculo; anexar protocolo externo não as reclassifica. Arquivo/restauração, CAS, Web Locks, idempotência, replay/SHA, orçamento 1.000+reserva 200/teto 10.000 e interrupção por falhas/suspensão permanecem.

`paper/engine.js`, `paper/risk.js`, `paper/money.js`, `paper/strategy.js`, `paper/market.js`, `paper/store.js`, `paper/archive.js`, indicadores, coletor, D1 e Cron não foram modificados. Estratégia SHA-256 `952d4c18b3aa5ca4eb69a0202e6a3022649d95499e19e67511e7646bfb78a39d`; captura original SHA-256 `840744695270d8c854a2924e3545c9e7fd6325ee29b20061c31b97a004d6e895` preservados.

Configuração padrão do protocolo continua capital inicial USD 10.000, taxa 10bps/slippage 5bps por lado, risco operacional existente. Carteira com configuração diferente é bloqueada, nunca reiniciada/convertida silenciosamente. Posições herdadas e resultados pendentes não viram perdas ou pares completos.

## 4. Candidata pré-especificada

Hipótese e parâmetros definidos primeiro em `docs/HYPOTHESIS-confirmed-trend-v1.md`, sem consultar um período final reservado e sem otimizar. `lab/confirmed-trend.js`: ID `confirmed-trend-v1`, política `confirmed-trend-policy-1`, parâmetros profundamente imutáveis. Hipótese: confirmação mais longa e filtros mais restritos podem reduzir sinais desfavoráveis; também podem perder movimentos. Não presume melhor retorno.

EMA9>EMA21, ambas crescentes versus três velas antes, três fechamentos crescentes acima de suas EMA9; >=40 candles fechados/contínuos, margem 5s, contexto recente. Últimas dez velas: máximo (high-low)/close <=0,8%; extensão close/EMA9 entre 0 e 0,3%. Com livro: timestamp/seq válidos, spread <=20bps, ambos volumes >0, bid>EMA9, distância ask/close <=0,3%. Sem livro: só observar condição de candle, não confirmar entrada.

Saída de sinal hipotético: cruzamento/perda de tendência, fechamento abaixo da EMA21 ou cinco minutos. Não é uma ordem ou posição. Razão e evidências (EMA, volatilidade/extensão/fechamento) ficam no relatório. Ausência, gaps, erros de fonte, insuficiência, lateralização/queda, extensão/volatilidade e livro sem confirmação levam à abstenção. Nenhuma candidata recebe strategyPort, carteira, feed, armazenamento, callback de execução ou credencial. Catálogo legado v7.5 não é alterado; implementação v7.6 tem descritor separado e versão explícita.

## 5. Executor offline e comparação

`lab/offline.js`, entrada `radar-offline-bars-v76`: origem explícita (synthetic/retrospective/prospective-real declarada pelo host), instrumento exato, janelas cronológicas, candles `time/open/high/low/close/availableAt`, instantes de avaliação e livros Coinbase opcionais `{availableAt,book}`. Limites: 10.000 candles, 1.000 decisões, 2.000 livros; leitor UI <=32MiB. Configuração divergente é rejeitada. Duplicatas/ordem incorreta, timestamps inválidos, moeda/fonte misturadas e selo de dados adulterado são bloqueados.

Visão as-of: só dados disponíveis e velas fechadas+5s. Warmup máximo de 180 velas conhecidas, mesma entrada para referência/candidata; valores OHLC futuros não mudam decisões passadas. Indicadores compartilhados, sem ajuste/treino. Livros são validados na sua disponibilidade com parser real (seq/timestamp/spread), depois exigidos recentes no instante. Repetição/reordenação/conflito, stale, spread e falta de volume impedem decisões comparáveis; nada é preenchido com preços estimados.

O executor é **somente decisões**. Até livros L1 pontuais não comprovam caminho de execução/stop/risco/fila durante toda a posição. Referência operacional original é chamada como função pura com acompanhamento hipotético de sinal e capital de referência explícito, sem submeter sua proposta. Candidata também acompanha sinais hipotéticos. Não são posições executadas. Todas as decisões, waits, intenções, qualidade e livros utilizados são registrados; intenções de sinal e execuções ficam separados. `executions`/`roundTrips` vazios; PnL/custos pagos/drawdown/exposição financeira/sensibilidade executável = null, não zero. Configuração hipotética de taxas/slippage/limite de spread permanece explícita.

Comparação de **decisões** só fica habilitada nos instantes com entrada comum válida e livro líquido recente. Sem livro a referência não pode avaliar os filtros de preço; candidata pode informar condição de candles, mas comparação não permitida. Cobertura, counts de entrada/saída/abstenção e rejeições descrevem somente instantes observados, não vantagem financeira. Não há vencedora nem inferência de desempenho. Períodos/fonte/origem permanecem separados.

CLI: `node scripts/run-offline-v76.mjs INPUT.json NOVO-output.json [development|selection|final]`; saída exclusiva, não sobrescreve. Fixture identificada `tests/fixtures/v76-synthetic-bars.json` e gerador `v76-data.mjs`. Derivação executada `artifacts/v76-synthetic-comparison.json`: **40 decisões sintéticas**, nenhuma operação financeira simulada/real, comparação financeira false. Esses números não são resultados de mercado. A captura real v7.3 não fornece OHLC completo/disponibilidade por candle apropriados; não foi inventada uma comparação candidata real a partir dela.

## 6. Interface e arquivos

Design e navegação preservados. Laboratório mostra referência, regra da candidata, importação offline e Qualidade: sintético/exploração/prospectivo declarado, sem PnL ou vencedora. Importar dados no laboratório não inicia sessão. Importar backup mostra se o protocolo interno está vinculado; leitor verifica selo/contexto, mantendo limitações.

Simulação Automática ganha seletor de protocolo antes de verificar fonte. Selecionar arquivo compara manifesto atual sem chamadas Coinbase, preserva capital e não ativa. Botão de ativação continua consentimento/manual, e exige protocolo para prospectivo. Janela/duração divergentes, manifesto antigo ou protocolo adulterado geram mensagens em português. Recarregar/suspender mantém desativado/pausado. Exportação/backup anteriores permanecem.

Arquivos novos: `paper/config.js`, `paper/provenance.js`, `lab/protocol.js`, `lab/confirmed-trend.js`, `lab/offline.js`, hipótese, testes/fixtures, CLI offline, helper de manifesto e E2E de proveniência. Alterados: `paper/session.js`, `paper/panel.js`, `paper/messages.js`, `paper/panel.css`, `lab/contracts.js` (import da mesma config), `lab/evaluator.js`, `lab/panel.js`, `index.html`, build, testes do build, harness prospectivo (agora exige --protocol), harness v7.5 e workflow QA. Sem dependências de produção/serviços pagos novos.

## 7. Testes e isolamento

24 testes novos direcionados executados e aprovados nesta versão inicial; compatibilidade de leitor/relatório/build: 48 aprovados. Suíte completa e navegador/CI finais serão registrados após execução; não considerar comandos pendentes como aprovados. Testes executam funções reais, não apenas presença de palavras.

Cobrem IDs/versão/protocolo legado, selo/hashes/capital/origem/tempo, runtime alterado inclusive após preparo, ativação explícita, impossibilidade de troca em execução, SESSION_START/capacidade/replay/backup, legado sem promoção, corrupção com rehash do diário pelo proprietário, bloqueio final sem prova externa, determinismo/imutabilidade, confirmação/abstenção/saída, dados futuros/incompletos/duplicados, moedas/config, candles-only, gaps, spread/liquidez/seq, custo não inventado e JSON roundtrip. Testes sentinela fazem rede/IndexedDB/strategyPort falharem se chamados pelo offline e comparam carteira ativa antes/depois.

CI mantém regressões anteriores e acrescenta E2E em 1440/768/390/375 px: preparar/salvar protocolo, anexar antes do preflight, ativar por consentimento, verificar vínculo exportado, prazo original, encerrar/recarregar sem retomada e sem chamadas extras. Fixtures de fonte e patches QA de origem são explicitamente sintéticos e têm hashes próprios; não são ensaios prospectivos. IndexedDB/backup/abort nativos continuam nos harnesses anteriores. Capturas e resultado pendentes até CI finalizar.

## 8. Ensaio prospectivo e checklist físico

Nenhum novo ensaio prospectivo executado; não foi iniciada sessão real automaticamente. Sem iPhone físico disponível. Chromium emulado não certifica WebKit/Chrome do iPhone. O objetivo é preparar sessão supervisionada real de 60min sem alterar horário/estratégia. Falhas podem encerrar cedo; duração efetiva e residual devem constar.

1. Registrar aparelho/iOS/Chrome, UTC/fuso, código/manifesto e origem. Conferir relógio configurado, sem tratar isso como prova independente.
2. Em Laboratório, escolher início FUTURO e 60min; preparar/salvar protocolo em Arquivos. Não alterar depois. Conferir ID, versão e SHA.
3. Em Simulação, ainda desativada, selecionar esse arquivo ANTES de verificar fonte. Deve reconhecer manifesto e mostrar vínculo preparado sem operar. Reprovar se ativar ao selecionar arquivo.
4. Verificar fonte/diário/espaço/Web Locks, capital/custos/risco e eventual posição residual. Sem dados válidos/cooldown/tempo fora da janela, não iniciar. Consentir e ativar no horário escolhido (tolerância 60s, término original). Reprovar se horário mudar silenciosamente ou ordem ignorar risco.
5. Tela visível, aparelho carregado e supervisão. Trocar app/bloquear/desbloquear, perder/retornar conexão ou reload devem pausar/desativar sem retomada. Reprovar se executar em suspensão ou reiniciar sozinho. Não contornar iOS.
6. Encerrar/preservar posições residuais; exportar diário e backup, salvar e selecionar novamente para verificar. SESSION_START deve conter protocolo/selo/manifesto/janela e horários. Conferir checksum, saldo, custos, IDs/posições e limites antes/depois da restauração em perfil QA vazio. Repetir não duplica. Não limpar carteira original.
7. Registrar tempo planejado/efetivo, qualidade, esperas, bloqueios, interrupções, fills reais fictícios (se houver), custos e resíduos; não forçar entradas. Arquivar original e relatório derivado separado. Classificação final independente permanece bloqueada por ausência de atestação confiável.

Harness opcional: `python scripts/prospective-v73.py --minutes 60 --protocol PROTOCOLO.json --output NOVO-ensaio.json`, apenas com supervisor e código local exatamente igual ao protocolo. Deve ser iniciado na janela escolhida; não aguarda/ajusta horário ou retoma automaticamente. Não foi executado nesta fase. Cópias existentes nunca são sobrescritas.

## 9. Publicação, riscos e próximos passos

Preview/PR finais pendentes nesta versão inicial do relatório. Alvo único `radar-de-mercado-preview`, após testes aprovados e guarda ETag/configuração. Sem alteração de produção/coletor/Cron/D1, migração ou reset contábil. Preservar evidências/IndexedDB ao reverter UI; módulos antigos podem omitir detalhes do vínculo mas não devem reescrever/apagar eventos.

Limitações: proveniência local não equivale a carimbo/atestado externo; código/relógio são conferidos/declarados pelo host. Sem candles completos/livros contínuos apropriados não existe PnL comparável. Observações e preços pontuais não garantem stop ou liquidez. Amostra sintética não avalia rentabilidade. Navegador público após deploy e iPhone físico dependem do ambiente e devem ser distinguidos de CI.

Fase 7.7 recomendada: executar checklist físico e sessão congelada de 60min; avaliar mecanismo de anterioridade confiável com modelo de confiança e autorização de infraestrutura explícitos, sem reclassificar legado; obter dataset apropriado com disponibilidade verificável antes de construir execução offline completa usando risco/custos/L1 existentes. Só então comparar retornos em períodos separados. Não integrar IA/ordens reais ou reduzir filtros para produzir sinais.
