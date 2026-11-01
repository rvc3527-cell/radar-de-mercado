# Validação v5.7

Base inspecionada: fix/collector-integrity-v56, commit 118e625.
Branch: feature/indicator-consistency-v57. Produção intocada.

## Node

Executados os testes do código real, sem dependências npm de produção:
- 14 testes de integridade do coletor v5.6 preservados.
- 12 testes matemáticos: pesos racionais independentes para EMA 9/21,
  referências RSI Wilder, limites, constantes, alta/queda, dados inválidos,
  séries e exclusão de candles abertos.
- 10 testes de metodologia: paridade painel/coletor, migração, idempotência,
  persistência, registros antigos, API, agrupamentos e execução da interface em VM.
- 1 teste do artefato publicado, garantindo conteúdo exato de HTML e scripts.
- 10 testes do motor de simulação e 35 testes de integração preexistentes.

Total esperado/executado: 82 testes. Verificar resultado completo no Actions
referenciado no relatório final e nesta branch; nenhuma falha foi ignorada.
Os testes matemáticos antigos que replicavam o cálculo foram substituídos por
referências independentes. Uma expectativa textual de atraso foi substituída por
teste que executa a função real com candle antigo.

Comandos:

```sh
node --test tests/*.test.mjs
node --input-type=module --check < cloud-collector.js
node --check indicators.js
node --check statistics.js
node scripts/build-preview.mjs
git diff --check
```

## Interface móvel

`scripts/smoke-mobile.py` executado com Playwright + Chromium local e emulação de
iPhone 13: 9 verificações aprovadas, 0 erros JS. Verifica scripts compartilhados,
agrupamento visual, rótulos, horário, amostra pequena, preservação do diário,
persistência nova, laboratório e ausência de overflow horizontal do documento.
Preços e biblioteca gráfica são fixtures isoladas: não valida mercado ao vivo nem
renderização da biblioteca externa real. Screenshot em
`/tmp/radar-v57-chromium-mobile.png` no ambiente de trabalho.

WebKit 26.5 foi baixado apenas para teste em /tmp; execução bloqueada por bibliotecas
nativas ausentes (GTK4, Graphene, HarfBuzz ICU, Manette, Hyphen e GLES). Nenhum
pacote de sistema foi instalado. Não afirmamos teste aprovado em Safari real ou
WebKit. Continua pendente teste no iPhone físico após publicação autorizada.
A interface escura e as regras de responsividade existentes foram preservadas.

## Cloudflare / D1

Inspeção somente leitura confirmou binding DB, esquema anterior sem coluna de
metodologia, painel preview e Cron de cinco minutos. Consultas iniciais desta
etapa: 14 observações e 33 resultados; números mudam com o coletor ativo.
As execuções recentes v5.6 retornaram 180 candles contínuos por ativo, HTTP 200,
sem lacunas/duplicatas. Não houve execução da migração no D1 remoto, nem deploy
v5.7. Publicação depende da aprovação descrita em MIGRACAO-v57.md.
