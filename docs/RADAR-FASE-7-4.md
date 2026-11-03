# Radar de Mercado — Fase 7.4

## 1. Auditoria inicial e preservação

Base efetiva: `feature/paper-session-analysis-v73`, commit `a92eaa46eff109fd3d0e5fa31c16ec132465e8f5`, PR #10. Branch isolada: **feature/paper-archive-iphone-v74**. Não se usou a main antiga. Na auditoria, PRs #5–#10 permaneciam abertos, sem merge. Cadeia: #10 → v7.2/#9 → v7.1/#8 → v7.0/#7; main `00b333d` não contém essas fases. Os outros worktrees, incluindo documentação e capturas não commitadas, foram preservados. Não houve merge, reset, limpeza de histórico ou substituição de estratégia.

Contratos preservados: `PaperTradingEngine.strategyPort`, risco determinístico, idempotência, dinheiro inteiro com precisão definida, replay/SHA-256, IndexedDB v1/CAS, Web Locks, ativação manual e interrupção imediata por perda de supervisão. O teto continua **10.000 eventos**, orçamento de 1.000/sessão e reserva de 200. A estratégia `ema-observe-v72`, política `v7.2-paper-test-1`, mantém SHA-256 `952d4c18b3aa5ca4eb69a0202e6a3022649d95499e19e67511e7646bfb78a39d`.

Preview auditado: `radar-de-mercado-preview`, ETag anterior `f2d12a4190db2aa08edb61a24e4c707e3bea49100c3047007bdc65581c7857c1`, publicado em 03/11/2026 02:50:17 UTC, correspondente ao runtime v7.3 `c8bff5f`. Bindings, flags, tags e tail_consumers vazios; usage_model standard, placement vazio, logpush false. Coletor: ETag `3fa23aa03b432537448217bc2628bfd278feecfde3ba4bd3302bdf97ae905d2e`, modificação 02/11/2026 00:29:16 UTC, Cron `*/5 * * * *`. Produção: modificação 31/10/2026 20:18:49 UTC. Nenhuma alteração em produção, coletor, Cron ou D1; nenhuma migração remota/local de esquema.

| Achado | Gravidade / decisão |
| --- | --- |
| Exportação anterior não tinha restauração integral verificada | Alta: implementar manifesto + replay e restauração atômica |
| Substituir histórico por cópia antiga reiniciaria limites/contabilidade | Alta: rejeitar rollback, bifurcação, moeda/capital/configuração divergentes |
| Esvaziar diário ao exportar perderia idempotência e risco acumulado | Crítica: proibido; backup não remove eventos nem libera capacidade |
| Mensagem NO_EXIT_LIQUIDITY não distinguia entrada bloqueada de saída frustrada | Média: explicar e mostrar quantidades reais do L1 |
| Salvar arquivo após várias operações assíncronas pode perder gesto no iOS | Média: preparar e salvar em toques separados |
| IndexedDB não é backup permanente; Safari físico não certificado | Limitação operacional: exportação externa, checklist e bloqueios mantidos |

## 2. Diagnóstico original de liquidez

Evidência imutável: `artifacts/v73-prospective.json`, SHA-256 do arquivo `840744695270d8c854a2924e3545c9e7fd6325ee29b20061c31b97a004d6e895`. Checksum do diário `612d905eb4ec1798581790a892710be22d27ceb2d195d58f25d3e445d8c0f4f7`, 201 eventos. Revalidada por replay antes da análise; não foi regravada.

| Dado original | Valor |
| --- | --- |
| Proposta rejeitada / evento | Nova **entrada**, `v72:open:BTC-USD:1793670780000`, evento 198 |
| Horário da proposta UTC | 03/11/2026 01:53:24.438 |
| Fonte/instrumento | Coinbase Exchange Spot BTC-USD, cotação USD |
| Cotação / sequência | Evento 196, sequência 138691671314 |
| Timestamp / idade ao propor | 1793670803039 / 1.399 ms |
| Melhor bid / ask | USD 77.134,96 / 77.134,97 |
| Quantidade observada no bid / ask | 0,00518561 BTC / 0,07121000 BTC |
| Nova posição proposta / saída exigida | **0,00648150 BTC** / **0,00648150 BTC** |
| Posições já abertas | 0 |
| Falta no melhor bid | **0,00129589 BTC** |

O ask comportava a compra, mas a regra conservadora exige cobertura também no melhor bid para a saída planejada. O **motor de risco** rejeitou a nova entrada corretamente; não ocorreu uma saída executada sem liquidez, erro da estratégia ou prova de iliquidez de toda a Coinbase. O simulador considera somente L1 e não percorre níveis adicionais. Quantidade de entrada é a regra congelada de 5% do caixa, truncada em 8 casas; não foi alterada para produzir operações.

Reprodução isolada: `node scripts/diagnose-liquidity-v74.mjs`. O script verifica o original, reconstitui o prefixo anterior à proposta e repete a mesma proposta com a mesma cotação histórica, sem rede. Resultado derivado: `artifacts/v74-liquidity-audit.json`, novamente NO_EXIT_LIQUIDITY, caixa USD 9.999,011617 inalterado, nenhuma posição/fill novo. Trata-se de **replay histórico**, não nova sessão prospectiva. O leitor v7.4 apenas acrescenta a explicação/quantidades ao relatório derivado; eventos originais permanecem idênticos. SHA-256 detecta corrupção, não autentica o proprietário contra alteração deliberada com recálculo de todos os hashes.

## 3. Mudanças e arquivos

| Arquivo | Finalidade |
| --- | --- |
| paper/archive.js | Backup integral, manifesto segmentado, verificação, compatibilidade legada, restauração sem rollback |
| paper/store.js | Instalação de snapshot em transação única com comparação da preimagem; CAS normal continua +1 |
| paper/session.js | Backup/importação com lock da carteira, validação de configuração/relógio, sessão restaurada desativada |
| paper/archive-panel.js | Preparar/Salvar, selecionar/verificar arquivo, confirmação explícita, restauração e mensagens |
| paper/messages.js | Mensagens compartilhadas para armazenamento, corrupção, conflitos e recuperação |
| paper/panel.js, paper/panel.css, index.html | Controles integrados ao painel atual, toque/legibilidade e estado bloqueado durante ações |
| paper/report.js, paper/report-panel.js | Leitor `v7.4-report-1`, consumo L1 do mesmo sequence e detalhes da rejeição; contabilidade/estratégia intactas |
| scripts/build-preview.mjs, tests/preview-build.test.mjs | Assets adicionais incluídos/verificados nos dois formatos de build |
| tests/paper-archive-v74.test.mjs | Arquivamento, replay, perda diária, posições, concorrência, limites e diagnóstico original |
| scripts/diagnose-liquidity-v74.mjs | Investigação reproduzível sem mercado/API |
| scripts/test-archive-v74.py | Fluxo de arquivo/IndexedDB nativo, abort, repetição, compartilhamento cancelado e quatro dimensões |
| scripts/review-v73-trace.py | Prefixo configurável para não sobrescrever evidências anteriores |
| scripts/prospective-v73.py | Caminho de saída explícito e criação exclusiva; recusa sobrescrever capturas anteriores |
| artifacts/v74-* | Evidências separadas das originais v7.2/v7.3 |

Não alterados: `paper/engine.js`, `paper/risk.js`, `paper/money.js`, `paper/strategy.js`, `paper/market.js`, indicadores, estatísticas, coletor, configurações de Cron e D1. Nenhuma dependência paga ou infraestrutura adicional.

## 4. Arquitetura de arquivamento e recuperação

Implementado **backup de snapshot completo**, formato `radar-paper-archive-v1`, sem truncamento/checkpoint operacional. Mantém o documento original completo e ordenado, configuração, IDs, todos os eventos, decisões e checksum. Manifesto contém wallet/schema, quantidade, SHA-256 do documento completo e de segmentos contíguos de 250 eventos; selo SHA-256 cobre cabeçalho/data/manifesto. Reconstituir pelo motor é obrigatório antes de exportar, inspecionar e restaurar. O limite de arquivo é 32 MiB, verificado antes de ler no painel e no parser; teto de eventos continua validado pelo motor.

Formatos anteriores aceitos: diário `radar-paper-v1`, exportações `radar-supervised-export-v72/v73`, captura original `real-prospective` contendo uma dessas exportações. Relatórios anexados não são confiados como saldo/resultados: são recalculados do diário verificado. Arquivo desconhecido, incompleto, com eventos/partes repetidos, contagem, manifesto, selo ou replay divergentes é rejeitado.

Restauração requer toque/confirmação e o mesmo Web Lock da sessão. Só ocorre com sessão inativa e fora de preparo/pronto. Regras:

1. Carteira inexistente: instalação integral na mesma identidade, preservando capital/configuração do arquivo.
2. Carteira idêntica: nenhuma escrita, operação ou contagem duplicada.
3. Extensão comprovada: mesma configuração e todos os eventos atuais como prefixo exato da nova cópia; acrescenta apenas o histórico preservado.
4. Cópia antiga, fork, carteira/moeda/configuração/capital diferentes ou relógio anterior ao último comando: bloqueio, sem sobrescrever o atual.
5. Diário local corrompido: preservar evidência; não sobrescrever automaticamente. Recuperar a cópia válida em outro perfil/navegador **vazio**, sem iniciar duas sessões paralelas. Não há sincronização entre aparelhos nem proteção contra forks entre perfis diferentes.

`installSnapshot` compara versão, checksum e representação completa da preimagem na mesma transação IndexedDB que grava o novo documento; conclui somente em `oncomplete`. Abort/quota mantêm o anterior. Perda de confirmação ou da leitura posterior é estado não confirmado: parar e verificar; repetir a mesma cópia completa é idempotente. Interrupção durante preparo de arquivo não altera o diário. Arquivo salvo parcialmente falha na inspeção; cancelamento do compartilhamento conserva o arquivo preparado e o histórico local. O arquivo previamente preparado é um snapshot daquela versão: se houver nova sessão depois, preparar outra cópia para incluir os novos eventos.

Restauração abre **nova instância desarmada**, sem cotação ou API, sem revisão automática de mercado, sem reiniciar saldo/perda diária/IDs e sem encerrar posições a preços inventados. Posições residuais continuam visíveis e **sem acompanhamento quando a sessão está parada**. Arquivos locais podem ser perdidos pelo iOS; a cópia precisa ser salva e conferida externamente. O navegador não confirma durabilidade no aplicativo Arquivos.

### Checkpoints futuros — projeto técnico, ainda não implementado

Backups integrais **não liberam capacidade**. Atingir o limite continua bloqueando novas sessões. Execução contínua permanece desabilitada. Não aumentar o teto nem remover eventos como solução.

Antes de checkpoints operacionais: separar segmentos imutáveis do documento ativo; manifesto encadeado com wallet/configuração/schema e sequência global; checkpoint que preserve caixa, posições, custos, PnL, perda/exposição diária, último timestamp/sequence e liquidez consumida, bloqueios, IDs/fingerprints de todas as propostas processadas e raiz da cadeia. A confirmação atômica de manifesto/checkpoint deve exigir que todos os segmentos tenham sido verificados e permaneçam recuperáveis; exportar ao usuário não comprova disponibilidade futura. Manter segmentos originais, detectar ausência/duplicação/truncamento, reconstruir por replay completo e comparar com checkpoint. Testar crash antes/depois de cada commit e conflitos entre abas. IDs/dias não podem reiniciar na fronteira. Essa mudança altera os contratos de persistência/replay e precisa de revisão própria, orçamento de memória e plano de compatibilidade. Não foi introduzida nesta entrega.

## 5. Qualidade dos dados e segurança

Adaptador existente mantém Coinbase BTC-USD Spot, book nível 1 real, timestamp do provedor verificável, sequência e comparação de snapshots repetidos. Reordenação/conflito, livro cruzado, quantidades inválidas, spread/idade excessivos, leilão e falta de liquidez bloqueiam. Repetir sequência não repõe volume já consumido. Candles são usados para indicadores, nunca como preços executáveis: somente fechados, ordenados, suficientes e contínuos; duplicatas idênticas deduplicadas e conflitantes rejeitadas. Não há candles/preços estimados.

Cadência preservada: livro no mínimo a cada 15 s, contexto no máximo por minuto, sem tentativas agressivas. HTTP 400, rede/timeout e 429 não geram execução. Retry-After/cooldown persistente continuam respeitados; inspeção/backup/restauração/relatórios não consultam Coinbase. Lock, armazenamento disponível, integridade e confirmação continuam pré-requisitos. Sem credenciais financeiras, IA ou corretora real.

Consulta pública armazenada `/health` (somente leitura, sem probe ativo): `artifacts/v74-collector-health-before.json`. Worker/D1 operacionais (`workerOk/database=true`), coletor v5.7.2/metodologia v5.7, agendamento recente (`scheduleDelayed=false`), **fonte em cooldown**, `ok=false` e três ativos sem frescor. Totais acumulados desde `metricsSince`: 101 HTTP 429, zero 400/rede conhecidos. Não são contagens desta fase ou do ensaio v7.3. O coletor adia consultas corretamente; isso não comprova que a disponibilidade Coinbase foi resolvida. A sessão usa seu próprio adaptador público sujeito aos mesmos bloqueios e não deve ser ativada sem preflight válido. Não se alterou o coletor para contornar limites.

## 6. Testes e resultados

Suíte final local: **291 testes executados, 291 aprovados, zero falhas**, incluindo os 272 anteriores e 19 novos de arquivo/sessão. Comando: `node --test --test-isolation=none tests/*.test.mjs`, Node 24 local, duração 140.743 ms. Sintaxe de 22 arquivos JavaScript, builds clássico/módulo, sintaxe do artefato e `git diff --check` executados e aprovados. GitHub Actions usa Node 22; resultado será registrado após o envio do commit. O teste de concorrência força as duas leituras antes da gravação; importa uma vez e rejeita a preimagem concorrente.

Testes incluem formato legado/original, hashes/manifesto, truncamento, duplicatas, mutação após inspeção, falta de confirmação, importação idêntica, extensão, rollback/fork/capital, corrupção local preservada, quota/abort, confirmação perdida, leitura pós-commit indisponível, concorrência, sessão sem chamadas/reativação, posições/IDs/custos/perda diária após restauração, relógio futuro, diário integral com 10.000 eventos e bloqueio do próximo comando. Regressão original de liquidez usa quantidades reais do evento, sem API.

Navegador Chromium nativo, quatro dimensões (1440/768/390/375 px), todas aprovadas nos quatro harnesses:

- `scripts/test-archive-v74.py`: arquivo legado real verificado, download da cópia integral, arquivo incompleto rejeitado, repetição sem escrita, recuperação desativada em carteira QA vazia, aborto **nativo** IndexedDB preservando a versão anterior, repetição pós-aborto e cancelamento de compartilhamento com gesto do usuário preservado. Zero chamadas Coinbase pela função de arquivo, zero erros de página.
- `scripts/test-paper-v72.py --artifact-prefix v74 --lifecycle`: fixtures sintéticas de entrada/custos/risco/posição residual, exportação/reload; em 390px também pagehide, pageshow, offline e visibilitychange, todos pausando sem retomada automática.
- `scripts/test-v70.py --artifact-prefix v74`: navegação, gráficos, motor e estados vazios/erros anteriores.
- `scripts/test-intelligence.py --artifact-prefix v74-history`: histórico/estatísticas reais do handler SQLite em dados de teste, filtros, estados de rede e navegação.

Relatórios `artifacts/v74-archive-browser.json`, `v74-paper-browser.json`, `v74-browser.json`, `v74-history-browser.json`; capturas `v74-archive-{1440,768,390,375}.png`, além dos painéis preservados. Sem rolagem horizontal acidental detectada. Medidas de carregamento de fixtures são evidência local, não promessa de desempenho da rede móvel.

## 7. iPhone: verificado e pendente

Não se certifica Safari ou Chrome de iPhone com Chromium de desktop. Os testes automatizados usam emulação de largura/toque; não contornam suspensão/timers do iOS. Chrome no iPhone não equivale ao Chromium executado aqui. IndexedDB, Web Locks, storage.estimate e compartilhamento são detectados em runtime; falta de capacidade bloqueia, não ativa modo inseguro. Quota estimada não garante escrita.

Preparar verifica assincronamente; **Salvar** invoca compartilhamento de File no próprio toque, quando disponível. Alternativa: link download anexado ao DOM, Blob URL por 60 s. Cancelamento é explicado. Selecionar a cópia permite validar sem restaurar; restaurar requer checkbox e novo toque. Interface preserva design, IDs e recursos anteriores; mensagens explicam ação, motivo e resultado fictício sem porcentagens de lucro.

Checklist físico pendente, registrar aparelho/iOS/navegador/horários e resultados:

- [ ] Safari e Chrome normais: abrir Preview, confirmar desativado e ausência de operação antes do consentimento.
- [ ] Modo privado/falta de espaço/Web Locks indisponível: erro compreensível e nenhuma entrada.
- [ ] Duas abas: somente uma controla carteira; backup/restauração bloqueados durante sessão ativa/pronta.
- [ ] Tela visível: validar fonte/diário, iniciar explicitamente e observar motivo/posição/resultado.
- [ ] Trocar app/aba, bloquear tela e retornar: pausado, sem reativação ou consulta silenciosa; validar novamente por toque.
- [ ] Offline, reconexão, reload e voltar/avançar: mesma proteção, histórico preservado e alerta residual.
- [ ] Preparar, Salvar → Arquivos; cancelar e repetir. Selecionar arquivo salvo e verificar SHA/contagem; arquivo parcial rejeitado.
- [ ] Restaurar em perfil vazio: saldo/custos/IDs/sessões/posições iguais, desativado; repetir sem duplicação.
- [ ] Cópia antiga/fork: bloqueio preserva carteira; exportar cópia atual antes de qualquer teste de recuperação.
- [ ] Posição fictícia residual: aviso visível; não afirmar que foi encerrada sem fill registrado.

Não apagar armazenamento do aparelho usado para sessões reais de teste. Testes destrutivos de quota/corrupção devem usar perfil QA descartável, nunca a carteira original.

## 8. Evidência prospectiva e próximo protocolo

Nenhum novo ensaio real completo de 60/120 min foi executado nesta fase. O ensaio original v7.3 permanece: planejado 60 min, efetivo **38 min 36,245 s**, pausado por risco, 153 livros válidos, 192 HTTP, uma operação completa fictícia, resultado líquido **−USD 0,988383**, custos USD 1,500769, zero posições residuais. É uma amostra anterior auditada; replay/fixtures e revisão visual não contam como novas sessões ou evidência de rentabilidade. Não há amostra suficiente para taxa de acerto/expectativa.

Protocolo reproduzível para o próximo ensaio supervisionado:

1. Usar Preview identificado por commit/SHA; registrar aparelho, iOS/navegador, UTC, fonte/ativo/moeda, estratégia/política e custos. Não ajustar parâmetros durante o período. Salvar/verificar cópia anterior. Confirmar reserva de diário ≥1.200 eventos e armazenamento disponível; caso contrário não iniciar.
2. Ambiente normal HTTPS, uma aba, aparelho carregado, tela visível. Não desativar bloqueios do sistema nem executar em segundo plano. Conferir relógio automático, fonte recente, livro válido, diário íntegro e carteira/posições herdadas.
3. Escolher **60 ou 120 min**, conferir limites/custos e tocar consentimento/iniciar. Estratégia congelada `v7.2-paper-test-1`; dados prospectivos reais BTC/USD, sem fixtures e sem forçar operações. Ausência de entrada é resultado válido.
4. Acompanhar estado, motivo, idade/latência, spread/liquidez observados, waits, propostas/fills, HTTP/cooldown/interrupções. Livro a cada 15s/contexto por minuto, sem consultas paralelas adicionais para produzir evidência. Falha/risco/interrupção encerra a tentativa; não reiniciar automaticamente. Nova tentativa é outra sessão explícita.
5. Ao terminar ou pausar, registrar duração planejada/efetiva e monitorada, condições de mercado disponíveis, bloqueios/motivos, entradas/saídas, preço/qty/time/seq, custos/PnL/drawdown amostrados e posições pendentes. Duração parcial deve ser rotulada parcial. Patrimônio estimado não é liquidação executada.
6. Encerrar propostas; não fechar a preços inventados. Exportar relatório e backup integral, salvar em Arquivos, selecionar/verificar novamente, conservar original e SHA. Não apagar eventos. Comparar sessões somente com origem/fonte/moeda/estratégia/custos/método compatíveis; dados futuros não entram nas decisões anteriores.

Harness opcional: `python scripts/prospective-v73.py --minutes 60 --output artifacts/v74-prospective-NOVO-ID-60m.json` (ou `--minutes 120` e outro caminho). O caminho deve ser novo; criação exclusiva recusa substituir qualquer evidência existente antes de consultar a rede. Help e recusa do caminho original v73 foram executados e aprovados, SHA original intacto. Não foi iniciado novo ensaio real por esses testes de CLI. A automação de QA não substitui supervisão física de iPhone. O protocolo de 120min foi coberto por fixture virtual; isso não prova disponibilidade futura do provedor nem uma sessão real de duas horas.

## 9. Preview e revisão

Publicação e PR pendentes nesta versão inicial do relatório. Alvo exclusivo autorizado: **radar-de-mercado-preview**, https://radar-de-mercado-preview.rvc3426.workers.dev/#simulacao. Publicar somente após suíte e Actions aprovados, com guarda de ETag/configuração contra trabalho simultâneo; confirmar assets byte a byte e estado desativado. Sem migrações pendentes. PR incremental contra **feature/paper-session-analysis-v73**, sem merge automático.

Reversão de código: republicar build v7.3 verificado, sem remover IndexedDB ou arquivos externos. O diário mantém esquema compatível v1 e não altera eventos; leitor antigo pode omitir detalhes v7.4. As cópias v7.4 devem ser abertas pelo leitor v7.4 para restaurar; conservar diário original e cópia externa antes da reversão. Nunca converter rollback de interface em rollback contábil.

## 10. Riscos e proposta para a Fase 7.5

- Backup integral não é checkpoint nem armazenamento externo garantido. Limite global permanece, execução contínua indisponível; iOS pode remover dados locais.
- SHA-256/replay detectam inconsistência; não provam autenticidade externa contra alguém capaz de reescrever toda a carteira. Não há sincronização/antifork entre aparelhos.
- L1/slippage/taxas são modelo fictício conservador, sem fila/impacto real; NO_EXIT_LIQUIDITY continua podendo pausar corretamente.
- Continuidade/segundo plano e encerramento residual sem fonte não são garantidos nem tentados. Sessões desativam após reload/interrupção.
- Safari/Chrome físicos, teste real completo 60/120 min e amostra estatística significativa permanecem pendentes.

Fase 7.5 recomendada: primeiro executar o checklist físico e novo ensaio prospectivo congelado, preservar/exportar resultados e confirmar recuperação em outro perfil. Depois revisar arquitetura de segmentos/checkpoints com testes de crash e migração explícita, sem IA nem execução financeira real. Não buscar mais operações relaxando risco ou ajustando estratégia à amostra já vista.
