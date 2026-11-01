# Petróleo & Coral — Design System 2.0

Base: fix/coinbase-http-diagnostics-v571, commit 004f783. Inspecionadas as branches
v5.7 e v5.7.1. Diretório limpo, um worktree local e nenhuma mudança simultânea
observada antes da criação de feature/petroleo-coral-redesign. Não há imagem de
referência anexada nesta solicitação; a implementação seguiu a hierarquia descrita.

## Estrutura implementada

- Menu lateral no desktop, ícones compactos no tablet e navegação inferior com
  safe-area no iPhone. Rotas por hash permitem favoritos e botão voltar.
- Visão geral: cartões BTC/ETH/SOL com fonte, moeda USDT, fechamento e variação
  de um minuto explicitados; gráfico real central; leitura dos indicadores ao lado.
- Gráfico mantém Lightweight Charts 4.2.3, candles, EMA 9/21, ativo selecionável e
  RSI 14 acessível. Intervalo real de vela é 1 minuto. Opções 3 e 5 estão claramente
  indisponíveis, sem inventar agregação. Horizontes observacionais 1/3/5 preservados.
- Análises: scanner completo, explicações e detalhes técnicos originais.
- Observações: recortes por metodologia/ativo/horizonte, média, mediana, proporção
  direcional positiva e quantidade após custo. Ambos usam statistics.js (cost 0
  para proporção bruta e cost 0.2 para custos), sem alterar o módulo ou suas fórmulas.
  Diário local, baseline e acompanhamento prospectivo continuam acessíveis.
- Laboratório, educação, simulador de risco e conta demo preservados.
- Monitor do coletor compacto com erro HTTP ou candles validados por ativo,
  última execução e diagnóstico expansível. Leitura automática a cada cinco minutos
  com aba visível; não dispara /probe automaticamente, nem altera o Cron.
- Configurações permitem controlar atualizações de leitura e detalhes técnicos.

## Design e acessibilidade

Tokens da paleta oficial em petroleo.css, fonte do sistema com fallback Inter,
sem download de fonte, efeitos neon, framework ou ícones externos. SVGs de traço
consistente. Cores do gráfico harmonizadas sem alterar dados, fórmulas ou classificação.

Contraste 4.5:1 testado para textos secundários, areia, coral, positivo e negativo
sobre as quatro superfícies. Vermelho original #E17D83 preservado para elementos
gráficos; --negative-text #F0A4AA é uma variante mais clara para textos pequenos,
pois a cor original não atende 4.5:1 em superfícies elevadas. Foco visível, link de
salto, nomes acessíveis nos ícones, aria-current/pressed, regiões de status e
prefers-reduced-motion. Carrossel de ativos é intencional; documento não transborda.

## Contratos preservados

Todos os IDs funcionais anteriores aparecem uma única vez. Mapeamento versionado
em tests/fixtures/frontend-contract.json. indicators.js, statistics.js, engine.js,
cloud-collector.js e cloud-schema.sql estão byte a byte iguais à base v5.7.1.
Não há escrita no D1, alteração de coletor, novas estratégias ou operações reais.
O build inclui CSS e apresentação JS novos, com tipos MIME corretos.

## Validação

- 93 testes Node: 88 anteriores + cinco de contratos, imutabilidade, apresentação
  de preços/erros, monitoramento e contraste. Suite completa aprovada localmente.
- Sintaxe JavaScript verificada; scripts inline também analisados pelos testes.
- Navegador Chromium real: 1440, 768, 390 e 375 px, sete rotas, seleção de ativo,
  canvas real de candles, indicadores, observações e histórico, controles de
  atualização, educação, compra/venda demo e fluxo do laboratório. Sem erros de
  console ou overflow do documento. A falha de histórico incompleto é tratada pelo
  laboratório; o snapshot curto não substitui estudo histórico de vários dias.
- Testes de navegador usam respostas REAIS capturadas de Binance e do coletor,
  congeladas no relógio de teste para reprodutibilidade. Biblioteca gráfica real,
  sem preços inventados. WebSocket substituído apenas no teste; execução ao vivo
  não é certificada por esse teste. O site publicado mantém WebSocket original.
- Diagnósticos reais, inclusive 429 do coletor, aparecem como erro, sem fingir saúde.
- Capturas e métricas em artifacts/. Local: primeira pintura 68–120 ms e
  carregamento ~0.9–1.0 s com respostas capturadas. Esses números NÃO representam
  Lighthouse, Core Web Vitals reais, rede móvel ou experiência do Safari.
- Safari físico/WebKit não disponível neste ambiente. Viewport Chromium não é
  certificado como Safari real; teste físico permanece recomendado.

Reproduzir, com Node e Playwright/Chromium já disponíveis:

```sh
node --test tests/*.test.mjs
node --check dashboard.js
node scripts/build-preview.mjs
python scripts/capture-market.py
python scripts/test-redesign.py
```

O capturador faz apenas GETs. Snapshot e cópia de biblioteca para teste são ignorados
pelo Git, não são usados na publicação e podem ser atualizados sem editar código.

## Arquivos

index.html (estrutura e integração), petroleo.css (tokens/componentes/responsividade),
dashboard.js (apresentação/navegação/estado), scripts/build-preview.mjs (assets),
scripts/capture-market.py e scripts/test-redesign.py (teste real de navegador),
tests/redesign.test.mjs e tests/fixtures/frontend-contract.json (contratos),
tests/helpers/runtime.mjs, tests/integration.test.mjs e tests/preview-build.test.mjs
(adaptação dos testes ao CSS externo e novos assets), artifacts/ (capturas e métricas),
.gitignore (snapshots fora do Git) e este documento.

## Implantação e reversão

Destino exclusivo: radar-de-mercado-preview. Código do coletor e produção não são
enviados na publicação. Build: dist/preview-worker.js, mesmo processo de Service
Worker usado anteriormente. Conferir todos os assets servidos byte a byte após upload.

Reversão: reimplantar preview Worker version 44daa126-068b-496b-aca2-d54c3cfe6416.
Nenhuma reversão de banco ou coletor é necessária. Não há migração neste redesign.
