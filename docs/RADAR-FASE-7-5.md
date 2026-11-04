# Radar de Mercado — Fase 7.5

## 1. Auditoria inicial

Base real `feature/paper-archive-iphone-v74`, `b0133f01965bd8a97df031d047acda8e33532a3d`, PR #11. Nova branch isolada: `feature/strategy-lab-validation-v75`. A consulta GitHub confirmou #11 → #10 → #9 → #8 → #7 → #6 → #5 abertos, sem merge. Main continua antiga (`00b333d`); não foi usada. Worktrees/evidências anteriores preservados, sem merge/reset/limpeza. Actions da entrega final v7.4 (#41616780744) aprovado; isto foi conferido novamente, não presumido pelo relatório.

Preview autenticado: `radar-de-mercado-preview`, ETag `dd6ed8ec9c2b00489b5e3126e0dd7ecce25aa33e330097e901510394388ef00e`, publicado 03/11/2026 04:24:51 UTC, mensagem runtime `fd39e53`. Bindings/flags/tags/tail_consumers vazios, placement vazio, usage_model standard, logpush false. Coletor ETag `3fa23aa03b432537448217bc2628bfd278feecfde3ba4bd3302bdf97ae905d2e`, modificado 02/11/2026 00:29:16 UTC; Cron `*/5 * * * *` criado/modificado 31/10/2026 23:04:23 UTC. Produção mantém modificação 31/10/2026 20:18:49 UTC. Sem ação D1/migração.

Código inspecionado: risco/L1, sequência/timestamp/spread, stop condicionado à liquidez, custos inteiros, idempotência, CAS/IndexedDB, replay/hash, exportação/restauração, Session e telemetria. Ativação manual, supervisão, pausa síncrona, teto de 10.000 eventos, orçamento 1.000/reserva 200 e cooldown permanecem. Nenhuma alteração no motor de risco foi necessária ou feita. O laboratório anterior é um backtest Binance/USDT; foi preservado e não reutilizado como evidência Coinbase/USD.

Achados reais: faltava contrato de candidata sem autoridade de execução, protocolo identificando código e avaliador somente leitura. Diário v7.2/v7.3/v7.4 não vincula criptograficamente o hash do protocolo/código a SESSION_START; comparações finais são bloqueadas até revisão dessa proveniência. Origem é declarada pelo host, não uma atestação externa. Limitações conhecidas de disponibilidade da Coinbase não são consideradas resolvidas pela auditoria: a captura de saúde da fase anterior indicava cooldown/429 e não foi apresentada como estado atual.

## 2. Mudanças e arquivos

- `lab/contracts.js`: cinco descritores de estratégias, parâmetros imutáveis, contrato as-of e protocolo selado com origem, fonte, custos/risco, janela, versão e hashes reais dos módulos.
- `lab/evaluator.js`: verifica backup/replay e reaproveita relatório do motor; nunca propõe/executa. Métricas de sessões separadas, bloqueios de comparabilidade, sensibilidade de custos e rejeição de amostras duplicadas.
- `lab/panel.js`, `index.html`, `paper/panel.css`: seção experimental no laboratório existente, arquivo somente leitura, Situação/Motivo/Resultado/Qualidade, preparação e salvamento por toque separado. Nada ativa sessão.
- `scripts/build-preview.mjs`: serve módulos do laboratório e `/lab/build.json`, gerado dos arquivos reais com SHA-256 e MIME JSON; mesmo Worker/sem infraestrutura extra.
- `scripts/evaluate-lab-v75.mjs`: avaliação offline com saída exclusiva (não sobrescreve evidências).
- `tests/lab-v75.test.mjs`, `tests/preview-build.test.mjs`: contratos, isolamento, matemática, sequência temporal, corrupção, integridade, custos e artefato.
- `scripts/test-lab-v75.py`, `scripts/test-archive-v74.py`: harnesses Chromium; prefixo novo evita substituir evidências v7.4; usa binário instalado ou bundle Playwright.
- `scripts/prepare-browser-fixture-v75.py`, `.github/workflows/indicators.yml`: job QA de navegador com Playwright 1.62.0 (já usado nos scripts locais) e biblioteca gráfica existente fixada por SHA. Sem dependência nova de produção, serviço pago ou consulta Coinbase. Screenshots/JSON de QA ficam no artefato Actions.
- `artifacts/v75-historical-exploration.json`: derivação identificada do diário original v7.3, não novo ensaio.

Estratégia `ema-observe-v72` / `v7.2-paper-test-1` preservada byte a byte; SHA-256 `952d4c18b3aa5ca4eb69a0202e6a3022649d95499e19e67511e7646bfb78a39d`. Indicadores v5.7, engine/risk/market/session/archive/store e dados antigos intactos. Nenhuma execução financeira, IA ou segundo plano.

## 3. Arquitetura do laboratório

Candidatas: referência EMA/RSI congelada; tendência confirmada; rompimento/volatilidade; reversão à média; abstenção. As quatro alternativas são **somente contratos**, não algoritmos implementados/validados. Cada descritor tem ID/família/versão/parâmetros/metodologia/fonte e `execution: forbidden`. Nenhum callback ou módulo de código arbitrário é aceito; parâmetros alterados ou campos adicionais são rejeitados. Não existe plugin dinâmico de JavaScript. Não se promete sandbox contra código malicioso executado no mesmo origin: a proteção é a ausência de código executável/capacidades no contrato.

O avaliador recebe cópia/exportação, verifica pelo leitor de backups e replay em MemoryPaperStore separado, gera relatório e não escreve na carteira ativa/IndexedDB. Não recebe strategyPort, feed, credencial, engine ativo ou callback. O painel não lê automaticamente a carteira do usuário. Selecionar arquivo analisa; não restaura, compra ou vende.

`frameAt` entrega somente candles com fechamento + margem de 5s e disponibilidade declarada <= horário as-of, cópia profundamente congelada. Valores OHLC futuros não alteram a aceitação de uma visão passada. Duplicatas, ordem/OHLC inválidos e moeda/fonte erradas nos dados conhecidos são rejeitados. Disponibilidade fornecida pelo importador não comprova conhecimento histórico; dados baixados depois não podem virar prospectivos por reetiquetagem.

## 4. Protocolo prospectivo e estatístico

Protocolo `radar-protocol-v75`: preparar ANTES do período final. UI escolhe início futuro e 60/120min; salva horários UTC em ms, registro, configuração de capital/custos/risco, fonte Spot Coinbase BTC-USD, moeda USD fictício, estratégia/política/metodologia, hashes SHA-256 de strategy/session/engine/risk/market/indicadores e contratos/leitor. `/lab/build.json` contém hashes do código empacotado; não são preços ou métricas inventados. Selo cobre o manifesto inteiro. Alteração de datas, parâmetros, custos, código ou origem falha na verificação. Registro local/hash não é carimbo de tempo confiável externo.

Janelas semiabertas e não sobrepostas: desenvolvimento, seleção, final. No formulário, os dois dias anteriores ao preparo são reservados em duas janelas de 24h; final começa no horário futuro escolhido. Isso reserva períodos, não baixa/amostra dados desses dias nem prova independência. Para pesquisa, definir janelas maiores no contrato e congelar antes da coleta. Não ajustar a referência atual. Sessões atravessando limites são excluídas, não repartidas silenciosamente. Warmup pode usar somente informação anterior conhecida.

Interrupções pré-definidas: risco, livro/contexto inválidos ou atrasados, lacunas/429/rede, armazenamento/integridade, página oculta/bloqueio, falta de supervisão >30s, tempo ou orçamento do diário. Nenhuma retomada automática. Consultas mantêm 15s/livro e no máximo contexto por minuto; sem retries extras. Decisões (inclusive AGUARDAR) são as da política congelada, deduplicadas por fechamento como já implementado; leituras permanecem nos eventos. Não se promete evento extra de estratégia por cada polling idêntico.

Guardar protocolo antes de iniciar; no fim guardar diário/backup original, manifesto de código, checksum e dispositivo/horário/condições da fonte. Manter origens `synthetic`, `retrospective`, `prospective-real` e `unknown` separadas. Um ensaio interrompido é parcial; posição residual não é operação perdida nem saída executada. Não mudar regra para gerar sinais. Nunca usar o período final para desenvolvimento/seleção e depois chamá-lo de validação independente.

Métricas por sessão, sem pooling/ranking: líquido já após taxas/slippage, drawdown amostrado, pares completos, ganho/perda médios, exposição (união de intervalos), bloqueios/propostas, cotações/telemetria e cobertura de intervalos monitorados/duração. Proporção de acerto só permanece disponível na regra descritiva herdada quando há >=30 pares, origem conhecida, término/ausência de pendências e compatibilidade. Esse limiar não prova significância, independência ou lucro futuro. Sem intervalos probabilísticos ingênuos para séries dependentes; incerteza explicitada por amostra/qualidade/exclusões. Condições de mercado e períodos ficam preservados para análise futura de estabilidade, sem rotular regimes com evidência inexistente.

Sensibilidade: mesmos fills/quantidades/tempos, preços bid/ask originais e funções monetárias do motor, cenários zero custo, custo original e 20bps taxa/10bps slippage. Cenário original deve coincidir exatamente com o líquido observado. Não reexecuta risco/estratégia: outro custo pode tornar aquelas operações inviáveis e os valores não são backtest alternativo. Herdadas/residuais/incompletas não recebem essa análise. Nunca contar duas cópias do mesmo diário/sessão como amostras distintas; snapshots estendidos também não duplicam sessões.

**Limitação deliberada:** avaliação final protocolada de diários legados fica bloqueada por falta de vínculo comprovado com código/protocolo no diário. O protocolo externo prepara o próximo teste, mas não promove automaticamente o legado. Candidatas não têm execução nesta fase. Não existe “melhor estratégia” validada.

CLI: `node scripts/evaluate-lab-v75.mjs ORIGINAL.json NOVO-relatorio.json [protocolo.json development|selection|final]`. Saída usa criação exclusiva. Reprodução histórica executada: `artifacts/v73-prospective.json` → `artifacts/v75-historical-exploration.json`, sem rede. Original SHA `840744695270d8c854a2924e3545c9e7fd6325ee29b20061c31b97a004d6e895` preservado.

## 5. Testes e evidências

Primeira regressão completa local: 311/311 aprovados, zero falhas, incluindo 291 anteriores. Depois foi adicionado teste de não interferência de OHLC futuro; os 21 casos do laboratório passaram. Regressão final local em andamento nesta versão do documento (preencher evidência final). Não considerar comandos de navegador interrompidos como testes executados.

Novos testes executam contratos e leitor reais: imutabilidade, ausência de callbacks/ports, protocolo e hashes, janelas ordenadas/sem sobreposição, registro antes do futuro, selo/custos mutados, candles abertos/futuros/disponibilidade atrasada, ordenação/duplicatas/moeda/OHLC, preservação de arquivos e ausência de fetch, PnL/custo matemático original, cenário de sensibilidade, amostra pequena, final legado bloqueado, backups antigos/novos, corrupção, duplicação de diário/sessão e build/MIME/hashes reais.

Job CI `browser-lab` preparado para laboratório/backup em Chromium 1440/768/390/375px, arquivos reais anteriores revisados somente em perfis QA descartáveis, nenhuma Coinbase. Testa consentimento/manual, arquivo incompleto, cancelamento/gesto, quota/abort nativo, recuperação desativada e zero consultas do laboratório. Resultado/capturas pendentes até execução do job; não são certificação de Chrome iPhone.

## 6. iPhone e roteiro manual curto

Não há iPhone físico disponível. Chrome de desktop e Chromium emulado não certificam WebKit/Chrome iOS. Tentativas locais com rede adicional foram interrompidas antes de executar; lançamento de Chromium no sandbox sem rede falhou. Não contornar restrições do sistema. IndexedDB pode ser removido pelo iOS; Web Locks é requisito, storage.estimate não garante gravação. Salvamento por gesto separado, backup integral, erros e posições residuais continuam na versão auditada. Teto de eventos não aumentou.

Registrar para cada item: aparelho, iOS/Chrome, UTC, SHA/versão do protocolo, screenshot, checksum/contagem/saldo/posições antes/depois, resultado PASS/FAIL e erro literal. Usar perfil QA; nunca apagar o histórico principal.

| Teste físico | Resultado esperado | Reprovar se |
| --- | --- | --- |
| Abrir/recarregar Preview | Desativado, sem operação nova; restaurar histórico conserva saldo/IDs | Retomar/operar automaticamente |
| Validar fonte/diário e consentir | Ativa somente com fonte recente, diário íntegro, lock e espaço | Aceitar atraso/corrupção/falta de lock |
| Segunda aba | Uma única controladora da carteira | Duas sessões simultâneas |
| Trocar app, bloquear/desbloquear, voltar/avançar | Pausado, nova validação/ativação manual | Retomar ou executar sem supervisão |
| Offline/reconectar | Pausado, cooldown preservado, sem retry agressivo | Reentrada automática ou preço inventado |
| Preparar/Salvar backup em Arquivos; cancelar/repetir | Gesto explícito, arquivo completo validável; nenhum evento apagado | Afirmar durabilidade sem arquivo válido |
| Restaurar cópia em perfil vazio | Mesma contabilidade/IDs/limites, desativado; repetir não duplica | Reset contábil, aceitar fork/cópia antiga |
| Encerrar com posição fictícia | Aviso residual, sem fill fictício inventado | Ocultar posição ou inventar saída |
| Laboratório: preparar/salvar protocolo e analisar cópia | Candidatas sem execução, resultado exploratório; simulador intacto | Comprar/vender/ativar por análise de arquivo |

## 7. Novas evidências prospectivas

**Nenhum novo ensaio prospectivo realizado.** A única derivação v7.5 usa evidência histórica original v7.3 (38min36s, não 60/120 completos), uma operação líquida fictícia -USD 0,988383; não aumenta amostra e não é ajuste de estratégia. Fixtures/testes virtuais ficam rotulados. Disponibilidade atual da Coinbase/60 ou 120min de continuidade não foi comprovada.

Próximo ensaio: preparar/salvar protocolo e manifesto antes do início futuro; verificar origem/livro/candles/diário/espaço; escolher 60min primeiro, consentir na simulação principal (laboratório não ativa). Manter tela visível e supervisão. Parar nos critérios predefinidos, sem forçar entradas/reiniciar. Exportar e revalidar backup, registrar duração efetiva, motivos de espera/interrupção, custos, qualidade e posições pendentes. Só depois repetir 120min como outra sessão. Sem operar com fonte em cooldown.

## 8. Publicação e limitações

Preview/PR v7.5 pendentes nesta versão inicial. Alvo exclusivo `radar-de-mercado-preview`; sem mudanças em produção/coletor/Cron/D1. Publicar só após testes/CI críticos aprovados e guarda ETag/configuração. Sem dependência de migração. Simulação permanece desativada por padrão; laboratório não muda os módulos operacionais.

Riscos: proveniência local sem atestação externa, correlação/sobreposição temporal entre sessões, amostra pequena, liquidez somente L1 e stop não garantido, indisponibilidade API, perda/limite de IndexedDB, execução suspensa no iOS. Sem sincronização entre aparelhos/checkpoints operacionais; backup não libera capacidade. Falta de teste físico permanece pendência explícita.

## 9. Fase 7.6 recomendada

Executar roteiro físico e ensaio congelado de 60min, preservando evidência antes de buscar mais operações. Depois revisar vínculo opcional entre protocolo/manifesto e sessão no diário sem mudar estratégia/risco ou reetiquetar legado, com regressão de backup. Apenas após isso implementar uma candidata por vez em ambiente offline isolado e períodos cronológicos reservados, comparar qualidade/estabilidade/custos com amostra adequada. IA/ordens reais e segundo plano continuam fora do escopo.
