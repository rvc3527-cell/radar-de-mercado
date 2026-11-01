# Operação do coletor experimental

Único destino autorizado: radar-cloud-collector-preview.
Não usar radar-de-mercado como destino.

## Validar

Node 22.13 ou superior (SQLite embutido; sem pacotes npm):

```sh
node --test tests/*.test.mjs
node --input-type=module --check < cloud-collector.js
git diff --check
```

Para conferir contagem detalhada, executar também cada arquivo diretamente:
`node tests/collector.test.mjs`, e os outros três `tests/*.test.mjs`.

## Implantar

Via API Cloudflare autenticada, enviar multipart PUT para
`/accounts/{account_id}/workers/scripts/radar-cloud-collector-preview` com:

- metadata.main_module: cloud-collector.js
- metadata.compatibility_date: 2026-10-01 (preservada)
- metadata.bindings: [{"type":"d1","name":"DB","id":"a583aa28-6961-4f6c-a490-e8c4bf560816"}]
- parte cloud-collector.js: código do commit validado, application/javascript+module

Preservar Cron */5 * * * *; não recriar o banco nem executar limpeza.
Confirmar resposta success, deployment/version ID e endpoints públicos /health,
/probe e /observations. /probe não dispara coleta. Esperar próxima execução real
no Cron e conferir version 5.6 no report de collector_runs.
Não confundir ok:true do health (serviço disponível) com coleta saudável:
verificar scheduleDelayed e os erros por ativo no last_run.report.

## Reverter

Versão publicada anterior: 7858cc91-b7ac-4c1c-8466-2fbe47d3fe51 (v5.5).
Reimplantar essa versão pelo painel de deployments do coletor ou pela API de
Workers deployments, depois de conferir que ainda consta na lista de versões.
Alternativa: usar cloud-collector.js do commit
92e45fff7df7b63fe5500092eadf68c0d4be2794 com os mesmos metadados/binding acima.
Isso restaura também o problema conhecido de cache, mas preserva dados e Cron.
Reversão não exige DELETE, migração ou restauração do D1.
