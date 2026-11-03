# Radar de Mercado — Fase 7.3

## 1. Auditoria e preservação

Base auditada: `976497416bf74fbd2671fe0f3882c0c0ffefd625`, branch feature/paper-real-data-v72 / PR #9. Nova branch isolada: **feature/paper-session-analysis-v73**. PRs #5–#9 continuam abertos e não integrados à main; main permanece em 00b333d, anterior às melhorias. Não houve merge, reset, stash, sobrescrita de branches ou modificação dos worktrees v7.0/v7.1/v7.2, inclusive documentação/capturas ainda não commitadas.

Contratos confirmados: propostas somente pelo strategyPort limitado; risco determinístico; nenhuma corretora/IA/credencial financeira; IndexedDB/CAS; idempotência; SHA-256 e replay; ativação manual; lock entre abas; cooldown; limite 10.000 eventos com orçamento de 1.000/sessão e reserva. Os 249 testes anteriores continuam na suíte. A estratégia **ema-observe-v72 / v7.2-paper-test-1**, indicadores v5.7, custos, limites e cadência não foram alterados para produzir entradas.

Cloudflare antes da publicação: Preview corresponde à Fase 7.2 (ETag 63a3c9cd50b6ab5760ac30a3109a31fc1d60c03f16c232907721a067d5b68101); bindings vazios, usage_model standard, demais configurações preservadas. Coletor permanece com ETag 3fa23aa03b432537448217bc2628bfd278feecfde3ba4bd3302bdf97ae905d2e e modificação 02/11/2026 00:29:16 UTC; Cron `*/5 * * * *` inalterado. Produção conserva modificação 31/10/2026 20:18:49 UTC. Nenhuma escrita/migração/consulta de alteração de dados D1 nesta fase.

Achados: faltavam latências/origem explícita, encerramento por risco não era sempre auditado e uma rejeição podia gerar duas pausas, substituindo a causa por DATA. Restauração via BFCache precisava de bloqueio explícito; exportação e atualização visual exigiam cuidado no Safari. Adicionar um evento separado a cada leitura excederia o orçamento de duas horas; a telemetria foi incorporada ao evento de cotação existente.

## 2. Arquivos e mudanças

| Arquivo | Finalidade |
| --- | --- |
| paper/report.js | Relatório determinístico por sessão; verificação antes de analisar; métricas, grupos comparáveis e compatibilidade legada |
| paper/report-panel.js | Sessão atual, decisões e resultados em português, sem números de confiança inventados |
| paper/engine.js | Campo opcional de telemetria na cotação, protegido pelo mesmo checksum/replay; eventos antigos permanecem idênticos |
| paper/market.js | Latência monotônica por requisição, status HTTP, timeout/rede e metadados de rejeição/cooldown, sem novas consultas |
| paper/session.js | Metadados de origem/estratégia, exportação v73, pausas auditáveis, bloqueio imediato e preservação da causa original |
| paper/panel.js / panel.css / index.html | Três seções, cronômetro/idade locais, avisos, relatórios, exportação e proteção BFCache |
| scripts/build-preview.mjs / tests/preview-build.test.mjs | Novos assets incluídos/testados no mesmo Worker do Preview |
| scripts/prospective-v73.py | Ensaio real supervisionado de 60/120 minutos, sem fixtures/retentativas, encerrado em falha/risco |
| scripts/audit-paper-journal.mjs | Revalida o diário e gera análise derivada com SHA do leitor/captura; proíbe sobrescrever o original |
| scripts/test-paper-v72.py | Prefixos isolam evidências; origem sintética explícita no harness; testes de ciclo de vida |
| tests/paper-report-v73.test.mjs | Referências matemáticas independentes, censura/pendências, origem, telemetria, integridade e regressões de pausa |
| artifacts/v73-* | Evidências de navegador, captura prospectiva e auditoria derivada, identificadas separadamente |

Não foram modificados indicators.js, statistics.js, engine.js de backtest, paper/risk.js, paper/money.js, paper/strategy.js, coletor, esquema D1 ou Cron. Sem dependência/serviço pago novo.

## 3. Definições das métricas

Relatório **v7.3-report-1**, calculado somente após verificar o diário por replay/checksum. O JSON exportado contém diário original e resumo derivado; resumo isolado não substitui a evidência. Origem é declarada pelo host, não prova criptográfica externa: prospective-real, synthetic, retrospective ou unknown. Registros antigos sem origem continuam unknown; não são retroativamente rotulados como reais ou v7.3.

- Tempo efetivamente monitorado: soma de intervalos de até 30s entre duas cotações válidas durante a sessão. Não extrapola após a última leitura nem preenche suspensão/gaps. Uma única leitura cobre zero intervalo confirmado. Duração entre eventos e tempo de exposição são apresentados separadamente.
- Leituras válidas = eventos de cotação aceitos; sequências únicas também registradas. Rejeições de livro, falhas de contexto e decisões de aguardar são contagens diferentes. Falha em candles não inventa uma tentativa de livro. HTTP/rede/latência desconhecidos em diário antigo não viram comprovação de zero erros.
- Latência = tempo monotônico da requisição/leitura do corpo; idade = horário do comando menos timestamp do provedor. Não cria timestamp/volume/preço para preencher campos ausentes. Telemetria é metadado e não muda o risco ou os preços de execução.
- Patrimônio estimado = caixa + liquidação indicativa das posições ao último bid observado após custos. Com posições residuais/marcas antigas isso não representa saída executada. Resultado líquido = diferença entre patrimônios inicial/final; realizado e custos também ficam separados.
- Custos totais = taxas + slippage. Já afetam preços/PnL do motor e não são descontados duas vezes; spread afeta os preços, sem custo adicional inventado.
- Operação completa válida: entrada e saída da mesma posição/estratégia dentro da sessão. Posição herdada tem sua saída exibida, mas não fabrica um round trip novo. Pendente/residual nunca é classificada como perdedora. Exposição usa união dos intervalos, evitando dupla contagem de posições simultâneas.
- Drawdown observado: maior queda do patrimônio em relação ao pico nas marcas/eventos recebidos. Não reconstrói mínimos intraminuto ou períodos sem dados. Ganho/perda médios usam PnL líquido dos pares completos.
- Taxa observada e expectativa média por par só aparecem com pelo menos 30 pares válidos, origem conhecida, término confirmado e condições de comparabilidade. Posições herdadas/residuais ou fonte inconsistente bloqueiam a exibição. O mínimo 30 é um limiar conservador de apresentação, não calibração ou garantia estatística. Nenhum valor é probabilidade de lucro futuro.
- Grupos de comparação preservam estratégia/política/metodologia, fonte/instrumento/moeda observados e declarados, origem, configuração de custos/risco/capital e duração planejada. Não há agregação automática de métodos incompatíveis ou alegação de independência entre sessões.

Decisões mantêm o motivo original. Para a política v7.2 conhecida, o leitor pode explicar a causa específica de saída usando apenas a evidência registrada (médias, RSI e tempo já decorrido), sem mudar a decisão nem ler preços futuros. Os motivos ficam vinculados ao ID da proposta/posição.

## 4. Ensaio prospectivo real

Executado com dados públicos reais Coinbase Exchange BTC-USD, sem fixtures, estratégia/indicadores/custos/riscos originais e sem operação forçada. Planejado para 60 minutos; interrompido pelo risco antes do prazo, **sem reinício automático**. Não foi executada uma sessão real completa de 60 ou 120 minutos.

| Medida observada | Resultado |
| --- | --- |
| Início UTC | 03/11/2026 01:14:48.234 |
| Pausa UTC | 03/11/2026 01:53:24.479 |
| Duração entre início e pausa | 38 min 36,245 s |
| Execução total do harness, incluindo preparo | 38 min 38,460 s |
| Continuidade efetivamente observada | 38 min 36,097 s |
| Leituras válidas / sequências únicas | 153 / 153 |
| Requisições registradas | 192 (livro e contexto) |
| HTTP 400 / 429 / rede / timeout | 0 / 0 / 0 / 0 neste ensaio |
| Latência do livro média / máxima | 120,693 ms / 288 ms |
| Idade média / máxima na ingestão | 1.270,235 ms / 2.518 ms |
| Decisões de aguardar | 36 |
| Propostas aprovadas / rejeitadas | 2 / 1 (entrada + saída aprovadas; nova entrada rejeitada) |
| Operações completas / vencedoras / perdedoras | 1 / 0 / 1 |
| Capital fictício inicial / final | USD 10.000 / USD 9.999,011617 |
| Resultado líquido fictício | **−USD 0,988383** |
| Taxas / slippage / custos totais | USD 1,000513 / 0,500256 / 1,500769 |
| Drawdown observado | USD 1,80885 (0,0180885%) |
| Exposição observada | 304,098 s |
| Posições residuais ao pausar | 0 |
| Motivo da pausa | NO_EXIT_LIQUIDITY — nova entrada bloqueada por liquidez insuficiente para saída |
| Taxa de acerto / expectativa | Não exibidas: amostra insuficiente |

Evidência original: `artifacts/v73-prospective.json` (201 eventos; checksum do diário `612d905eb4ec1798581790a892710be22d27ceb2d195d58f25d3e445d8c0f4f7`). Inclui hash dos módulos carregados, requisições, preços, quantidades, sequência/horários reais e captura do estado. Estratégia carregada SHA-256 `952d4c18b3aa5ca4eb69a0202e6a3022649d95499e19e67511e7646bfb78a39d`, igual à estratégia preservada no código final.

O ensaio foi realizado durante desenvolvimento, antes da publicação, com o snapshot de código identificado no manifesto. Revelou a duplicação de pausa: o runtime terminou exibindo DATA após a causa NO_EXIT_LIQUIDITY. O diário original, inclusive ambas as notas, foi preservado. A correção interrompe o fluxo após a primeira rejeição. A auditoria derivada `artifacts/v73-prospective-audit.json` revalida o mesmo checksum, preserva a causa inicial e conta um bloqueio, não dois. Registra SHA do leitor e da captura; a operação simulada e o PnL não foram regravados/recalculados com preços posteriores.

Reprodução: `node scripts/audit-paper-journal.mjs artifacts/v73-prospective.json artifacts/v73-prospective-audit.json`. A captura inclui resumo transitório do leitor em desenvolvimento; para métricas finais usar a auditoria derivada identificada, mantendo sempre o original.

Transporte do harness: urllib com CA/proxy herdados e **TLS verificado**, entregando corpos reais intactos ao adaptador no Chromium. É a mesma limitação conhecida da CA do proxy no Chromium, não uma alteração de fonte nem técnica para contornar rate limit. Não certifica rede/TLS nativos no Safari. Cadência não aumentada: livro a cada 15s, contexto no máximo por minuto; sem retries/rotação de IP. Uma amostra curta de disponibilidade não elimina 429 externos do coletor Cloudflare.

## 5. Testes e regressões

Suíte local completa: **272 testes executados, 272 aprovados, zero falhas**, incluindo os 249 anteriores. Sintaxe dos módulos e build clássico/módulo também executados. A primeira bateria detectou uma regressão de capacidade, corrigida e reexecutada; não se considera aquela bateria com falha como aprovada. [GitHub Actions 41567778402](https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41567778402) aprovado no commit de runtime `c8bff5f79b1a4feb6692d973ed769526d3bb74ec`; logs Node 22 confirmam 272 testes, 272 aprovados, zero falhas, além de sintaxe e build.

Novos casos cobrem referências independentes de PnL/custos/slippage/drawdown/exposição, 30 pares para taxa/expectativa observadas, pendências e posições herdadas, união de exposição, gaps, término desconhecido, grupos de origem, compatibilidade v7.2, corrupção de telemetria, HTTP/cooldown/timeout/rede, espera vs rejeição, idempotência, causa original de risco e pausa síncrona. A regressão de capacidade preserva os 9.000 eventos e impede consulta à API; cenário virtual completo de duas horas mantém o orçamento, sem ser apresentado como ensaio real.

E2E Chromium 1440/768/390/375 px: ativação/risco/execução fictícia/exportação/restauração/estados de falha, origem sintética explícita nas fixtures e separada do ensaio real. Testes de v7.0, Fase 6 e IndexedDB v7.1 preservados. Harnesses usam prefixo v73 para não sobrescrever evidências v72.

## 6. Safari/iPhone

Não foi testado Safari real. Chromium com dimensão/toque de iPhone não equivale a Safari; o binário WebKit de teste não está instalado neste ambiente. Documentação oficial consultada: [Safari 15.4 — Web Locks](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) e [WebKit — política de armazenamento](https://webkit.org/blog/14403/updates-to-storage-policy/).

Web Locks é detectado em runtime; sem ele não ativa. StorageManager.estimate tem suporte mais completo a partir de iOS 17; versão do sistema não substitui a verificação de capacidade. A estimativa não garante gravação: QuotaExceededError continua bloqueando. IndexedDB pode ser removido/evicto; não é backup. Nenhuma dessas limitações é resolvida com loop em segundo plano.

Automatizado em Chromium: IndexedDB/CAS nativo, Web Locks, download JSON, reload desativado, visibilitychange, pagehide, pageshow persisted e offline, sem novas consultas/reativação após perda de supervisão. Pausa bloqueia síncronamente antes de aguardar persistência. BFCache exige nova validação explícita. Exportação usa link anexado ao DOM e mantém Blob URL por 60s; cronômetro/idade visuais não fazem requisições nem reativam sessão.

Checklist manual em iPhone físico:

1. Abrir o Preview em Safari normal e privado; confirmar suporte/capacidade ou bloqueio compreensível. Em duas abas, apenas uma deve obter o lock.
2. Iniciar com dados válidos, manter tela visível, depois bloquear tela, trocar de app/aba e voltar. Deve permanecer pausado, sem novas entradas automáticas.
3. Testar voltar/avançar (BFCache), recarregar, perda/retorno de Wi-Fi e modo avião. Nenhuma retomada silenciosa.
4. Exportar JSON para Arquivos/compartilhamento e revalidar em outro leitor; verificar a última nota, checksum e posições residuais. Não limpar armazenamento sem exportar.
5. Acompanhar 60/120 minutos em aparelho carregado, registrando dispositivo/iOS/Safari e interrupções. Fonte ou risco pode encerrar antes; não forçar nova operação para preencher amostra.

## 7. Preview e PR

Alvo autorizado: **radar-de-mercado-preview**, https://radar-de-mercado-preview.rvc3426.workers.dev/#simulacao. Publicação somente após suíte/CI aprovados e verificação do ETag/configuração anterior. Tipo módulo, configurações, bindings vazios e orçamento existentes preservados. Simulação continua desativada ao abrir/recarregar.

Publicação **confirmada** em 03/11/2026 02:50:17 UTC, exclusivamente no Preview. Runtime `c8bff5f79b1a4feb6692d973ed769526d3bb74ec`; artefato SHA-256 `ed0c07bf6c2ac881eb7809bb425fea6602e640cd555aa5c3cfd0a38e952766c2`; ETag remoto `f2d12a4190db2aa08edb61a24e4c707e3bea49100c3047007bdc65581c7857c1`; deployment_id `2975b34defb349059008646f27a1f070`. Guardas de binding/ETag anterior impediram sobrescrita de outro deploy.

Verificação pós-deploy: cada HTML/CSS/JS próprio solicitado comparado byte a byte ao código testado, por HTTPS com TLS validado. Chromium 1440/390 restaurou a captura prospectiva real somente em perfis QA isolados, revalidou checksum e exibiu resultado líquido/amostra insuficiente/posição residual correta. Nenhuma consulta de mercado nova ou ordem foi disparada pela restauração, nenhuma reativação automática e nenhum erro de página. Relatório `artifacts/v73-results-preview.json`; capturas `v73-results-1440-preview.png` e `v73-results-390-preview.png`. São revisão de uma sessão real anterior, não um novo ensaio prospectivo.

Configurações do Preview preservadas: bindings/flags/tags/tail_consumers vazios, placement vazio, usage_model standard e logpush=false. Rechecagem autenticada mantém os mesmos timestamps/ETag de produção/coletor e o mesmo Cron da auditoria inicial. Não houve ação D1.

[PR incremental #10](https://github.com/rvc3527-cell/radar-de-mercado/pull/10), contra feature/paper-real-data-v72 / #9, aberto sem merge. Commits posteriores de documentação/capturas/harness não mudam o runtime publicado. Não fazer merge na main. Reversão: republicar o artefato da Fase 7.2, mantendo IndexedDB/exportações intactos; código antigo pode não interpretar telemetria v73 e não deve regravar os novos eventos. Preferir exportar/arquivar antes de qualquer reversão do leitor.

## 8. Problemas corrigidos e riscos restantes

- Rejeição seguida de segunda pausa mascarava o motivo como DATA e duplicava o bloqueio na apresentação; corrigido e reproduzido em teste.
- Falha de relatório por corrupção poderia deixar métricas em cache e sessão ativa; agora limpa o cache e bloqueia execução.
- Pausa assíncrona/BFCache exigia bloqueio imediato; implementado sem aguardar gravação, sem reinício automático.
- Nova telemetria não adiciona evento por leitura; mantém orçamento. Falha de preflight sem sessão identificada não escreve evento espúrio perto do limite.
- Drawdown é amostrado; execução L1 fictícia não modela fila/impacto real. Taxas e slippage são hipóteses declaradas. Origem local/checksum não são atestação externa contra proprietário malicioso.
- Arquivamento/checkpoints, servidor autenticado e sincronização entre aparelhos continuam ausentes. Ao atingir capacidade, bloquear novas sessões e exportar, sem apagar silenciosamente ou reiniciar capital.
- A sessão real foi interrompida pelo risco; 60/120 minutos contínuos reais e Safari físico permanecem pendentes. Não há evidência estatística de rentabilidade.

## 9. Recomendação para Fase 7.4

Priorizar ensaio manual Safari/iPhone e novas sessões prospectivas com protocolo fixo, sem ajustar a estratégia aos resultados já vistos. Projetar arquivamento/checkpoints verificáveis e restauração antes de operação contínua. Depois, comparar estratégias determinísticas em períodos futuros separados, com origem/fonte/custos/risco equivalentes e amostra justificada. Não integrar IA operadora antes de resolver essas etapas.
