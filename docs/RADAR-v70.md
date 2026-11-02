# Radar 7.0 — auditoria e arquitetura

## Estado antes da alteração

Auditoria em 02/11/2026. Branch de trabalho exclusiva `feature/radar-simple-digital-v70`.

Fase 6 funcional concluída nos commits `813a652` e `e6f694e`, CI Node 22 aprovado e Preview publicado. PR #6 ainda em draft, sem merge; documentação e evidências finais preservadas no commit `096e9ac` da branch Fase 6 antes de criar esta branch. Essa preservação não altera runtime. Não havia outra branch v7.0 remota. Os PRs #2–6 formam uma sequência de melhorias ainda não integradas à main; main continua antiga e não é uma base adequada para esta entrega.

Componentes reutilizados:

- index.html: interface e orquestração legada; scanner Binance Spot USDT e candles/gráficos via REST/WebSocket. Metodologia compartilhada v5.7. Diário e simulação local existentes.
- indicators.js: EMA com média inicial, Wilder RSI e validação de candles fechados. Imutável nesta fase.
- engine.js/statistics.js: simulação e resumos anteriores, preservados.
- dashboard.js/petroleo.css: apresentação e roteamento. A nova camada digital usa outro CSS, mantendo a base histórica disponível no Git.
- historical.js/intelligence.js: Fase 6, leitura D1 paginada/limitada, estatísticas por metodologia e monitoramento, preservados.
- cloud-collector.js: v5.7.2, Coinbase Exchange USD, Cron */5, lease/cooldown persistentes, /probe armazenado e /health por provedor. D1 contém observations, results, collector_runs e collector_control. Nenhuma alteração no backend, D1 ou agendamento prevista na v7.
- scripts/build-preview.mjs: Service Worker de assets embutidos, exclusivamente Preview.
- 135 testes Node existentes passaram antes das alterações. Actions testa Node 22, sintaxe e build. Harnesses Chromium cobrem quatro larguras e compatibilidade dos fluxos anteriores.

## Fronteiras da nova análise

A tela principal acompanha somente BTC/ETH/SOL **Binance Spot USDT**. Histórico D1 **Coinbase USD** permanece separado em Histórico. Não serve como evidência para o instrumento Binance, mesmo com os mesmos nomes BTC/ETH/SOL e indicadores v5.7.

Novo módulo puro `opportunity-engine.js` combina leitura v5.7 com filtros de prudência e política explícita `v7.0-observe-1`. Não altera EMA/RSI nem o coletor. `opportunities.js` apresenta os resultados e mantém registros prospectivos locais separados do diário antigo. Reaproveita os candles já recebidos pelo scanner, sem novas consultas à Coinbase e sem biblioteca de IA. Nenhum percentual de segurança ou chance de lucro.

Os limites de volatilidade/alongamento são barreiras conservadoras de engenharia, **não parâmetros calibrados ou estratégia validada**. A nova política não herda resultados da v5.7 como se tivesse sido avaliada retrospectivamente. Sem evidência prospectiva da própria política, a resposta é aguardar e “Tempo de operação ainda não validado”.

Arquitetura: candles reais → validação/fechamento/continuidade v5.7 → filtros determinísticos → evidência prospectiva compatível → explicação/estado → registro local opcional → resultado posterior com o mesmo feed. D1 e coleta existentes continuam independentes.

## Política v7.0-observe-1

São regras de observação, não uma estratégia validada. São fixas, determinísticas e expostas nos detalhes; não há LLM, previsão de preço, ordens ou probabilidade de lucro.

1. Fonte/mercado permitidos: Binance Spot USDT, BTCUSDT/ETHUSDT/SOLUSDT, matemática v5.7. Não comparar com Coinbase USD.
2. Pelo menos 60 candles fechados de um minuto, contínuos, preços/OHLC/volume válidos, timestamps alinhados. Duplicatas idênticas não pesam duas vezes; divergentes bloqueiam. Margem de fechamento de 5s; último fechamento com no máximo 120s. Falha de API preserva somente contexto do cache, sem confirmar condição nova.
3. Tendência: EMA 9/21 da v5.7, separação absoluta >= 0,015% e inclinação da EMA 9 sobre três fechamentos no sentido observado.
4. Força: regra original de alinhamento v5.7, RSI >= 52 para alta ou <= 48 para baixa, e movimento direcional de cinco fechamentos >= 0,03%.
5. Confirmação: dois movimentos consecutivos estritos de fechamento no mesmo sentido. Igualdade não confirma. Não usa a vela em formação.
6. Oscilação: desvio-padrão populacional dos últimos 20 retornos logarítmicos de um minuto, em %, <= 0,35%. Zero não gera oportunidade por si: tendência/força/fechamentos continuam bloqueando mercado parado.
7. Alongamento bloqueia se |preço/EMA21 − 1| > 0,5%, |movimento em 5 min| > 1%, RSI >= 68 em alta ou <= 32 em baixa.
8. Evidência: somente registros prospectivos locais da **própria política**, mesmo instrumento/direção/metodologia. Custos totais fixos 0,2% por avaliação, sem spread/impostos reais presumidos. Seleciona janelas cronológicas sem sobreposição **antes** de conhecer seus resultados, inclusive pendentes. Coorte fixa das primeiras 90 janelas, com ao menos sete dias UTC: primeiras 60 exploratórias e próximas 30 de acompanhamento. Todas precisam estar avaliadas; média e mediana líquidas positivas em ambas as partes. Não pula pendentes para escolher resultados melhores. Essa exigência é uma barreira conservadora, não prova de vantagem ou independência estatística.
9. Horizonte: primeira janela que atende aos critérios na prioridade pré-declarada **3, 5, 1 min**. Não escolhe o maior retorno nem afirma duração ótima. Exibe “evidência inicial” e mantém aviso de que execução/lucro não estão validados. Ausência de evidência: “Tempo de operação ainda não validado”.

Qualidade é ordinal, sem percentual: Consistente quando as quatro dimensões técnicas são favoráveis, Parcial com duas/três, Fraca abaixo disso; dados/API inadequados = Não avaliada, risco de alongamento/oscilação = Bloqueada. Essa qualidade não remove nenhum bloqueio histórico. Não é segurança financeira. Ranking separa escopos, prioriza elegibilidade, frescor, critérios técnicos atendidos e bloqueios de risco; empates por horário e símbolo. Não usa maior valorização. A interface só mostra os três instrumentos do escopo Binance.

Estados: UP/DOWN só após todas as barreiras; DATA para fonte incompatível/candles inválidos/insuficientes/atrasados; WAIT para confirmação/alinhamento/API/evidência pendentes; RISK para oscilação/alongamento excessivos; INDEFINITE para direção sem força definida. Detalhes listam cada critério e bloqueio real. Plano pode ficar aguardando, confirmado para acompanhamento, invalidado por mudança de condições/fonte/direção, encerrado pelo término do horizonte. Não há entrada financeira automática.

## Registros prospectivos e limitações

Chave nova `radar-observation-policy-v70` no localStorage, separada de `radar-observations-v1` e D1. Registra só mediante toque, em até 30s do fechamento, antes do primeiro resultado possível, com fonte/moeda/política, preço/horário, direção, indicadores, critérios e bloqueios. Mesmo instrumento/política/fechamento não duplica. A nova política não atribui resultados antigos a si própria.

Reavalia resultados exatos de 1/3/5 min com candles já recebidos pelo scanner (120) e gráfico selecionado (até 1.000), sem requisição adicional. Timestamps exatos; sem interpolação; resultados concluídos não são sobrescritos. Resultados indisponíveis continuam pendentes. `evaluated_at` e instante de observação impedem usar resultados futuros em decisões históricas da política. Não se registra retrospectivamente uma leitura depois do resultado.

Limites: histórico local pode ser editado pelo proprietário, não tem auditoria externa nem sincronização entre aparelhos. Se o navegador ficar fechado além da cobertura dos candles existentes, resultados podem permanecer sem dado; não há garantia de avaliação em segundo plano no Safari. Nenhuma amostra é inventada para compensar isso. Arquivo corrompido é preservado e novas gravações bloqueadas; erro/quota de armazenamento é explicado. Máximo de 1.000 registros novos, sem descarte automático dos existentes. Exportação JSON disponível. Persistência central da política exigiria desenho de ingestão/validação e eventual autorização D1 em outra etapa.

A primeira execução normalmente não dispõe dessa evidência, portanto **aguardar é o resultado esperado**, inclusive com indicadores tecnicamente consistentes. O aplicativo não chama isso de “entrada validada”. Todos os números do produto vêm do feed ou registros reais; datasets sintéticos aparecem apenas nos testes matemáticos.

## Verificação e publicação

- Baseline: 135 casos anteriores. Entrega: **162 testes Node executados, 162 aprovados, zero falhas** (27 casos novos), incluindo alta/baixa/lateral, fonte indisponível, atraso, divergência, oscilação excessiva, candles faltantes/duplicados/incompletos, amostra, separação de instrumentos, custo, horizonte, ausência de oportunidade, registro idempotente, avaliação futura, invalidação/encerramento e contraste. Matemática compartilhada, motor, estatísticas, esquema e coletor protegidos pelos testes anteriores.
- `scripts/test-v70.py`: Chromium 1440, 768, 390 e 375 px. Cinco rotas primárias, detalhes, dados reais capturados, registro/exportação, ausência de duplicatas, diário antigo preservado, cache envelhecido sem nova consulta, falha de API e histórico F6. Zero pageerrors/overflow, zero chamadas do navegador à Coinbase. Relatório `artifacts/v70-browser.json`.
- Regressões: `scripts/test-intelligence.py --artifact-prefix v70-history` (quatro larguras), `scripts/test-redesign.py --no-screenshots --report artifacts/v70-compat-browser.json` (quatro larguras), `scripts/smoke-mobile.py --browser chromium` (nove verificações no iPhone 13 emulado), todos aprovados. Harnesses adaptados à navegação de cinco rotas e ferramentas secundárias. Só foi atualizada uma expectativa antiga de título; nenhum teste matemático removido.
- Capturas `v70-opportunities-*`, `v70-analysis-*` e `v70-history-*` usam o dataset real de 01/11/2026 15:28:29 UTC para comparação reproduzível. Não são previsão nem comprovação da disponibilidade atual da fonte. Dados sintéticos positivos existem apenas em testes de regras, nunca no produto ou nas capturas.
- Métricas de Chromium local: primeiro conteúdo em cerca de 0,3–0,5s no cenário capturado; não são métricas de campo em rede móvel. Não foi certificado Safari/iPhone real nem streaming com WebSocket real nesse harness.

Build: `node scripts/build-preview.mjs`. Adiciona digital.css, opportunity-engine.js e opportunities.js aos assets anteriores. Publicação autorizada somente de código em **radar-de-mercado-preview**, após CI. Backend e D1 não recebem uploads, migrações ou escritas da v7.0. Reversão: restaurar UI da Fase 6, versão `9f4dcb41-94e8-4029-aebd-b50518e44cf2`; deixar todos os dados e o coletor intactos. Registros locais v7 ficam preservados sem serem lidos como v5.7.

Limitações adicionais: amostra manual pode sofrer viés de seleção e não representa todos os eventos do mercado. Divisões cronológicas compartilham contexto, sem validação independente. O conjunto de três ativos não representa “melhores oportunidades de todo o mercado”. Qualquer futuro serviço de ingestão central ou revisão de política deve ter versão própria e não reclassificar o passado silenciosamente.
