# Coinbase HTTP — correção 5.7.1

Branch: fix/coinbase-http-diagnostics-v571, a partir da v5.7 publicada.
PR: https://github.com/rvc3527-cell/radar-de-mercado/pull/3

## Causa confirmada

Os diagnósticos antes da alteração registravam apenas status 400. Foi adicionado
um leitor limitado de erro JSON (máximo 1 KiB, mensagem de até 200 caracteres),
sem copiar HTML ou corpos grandes. Em execuções reais do Worker, a Coinbase
respondeu: `User-Agent header is required.`

Exemplos: execuções de 2026-11-01 15:00 e 15:05 UTC, com cacheStatus BYPASS.
Consultas respondidas pelo cache podiam retornar 200, ocultando a exigência da
origem e dando aparência de falha aleatória dos candles.

Experimento controlado com a mesma janela temporal:
- Sem User-Agent: HTTP 400, mensagem `User-Agent header is required.`
- Com identificação RadarDeMercado: HTTP 200 e 180 candles.

## Correção

O coletor envia `User-Agent: RadarDeMercado/5.7.1
(+https://github.com/rvc3527-cell/radar-de-mercado)` em todas as consultas Coinbase.
Não simula navegador, não troca fonte e não tenta contornar autenticação.
Mantém pares USD, janela explícita, validação de fechamento, lacunas, duplicatas,
atraso e isolamento de erros por ativo. Não aumenta consultas por ciclo.

Versão operacional 5.7.1; metodologia matemática continua v5.7. Nenhuma migração
adicional, edição de registros históricos, deploy do painel ou alteração em produção.
Cron */5 * * * * e binding DB preservados.

Diagnóstico adicional inclui mensagem JSON sanitizada, data e identificador público
da resposta. Se a leitura falhar ou exceder o limite, conserva a classificação HTTP.
No erro, o corpo é cancelado e a conexão de leitura liberada. Não há retry automático.

## Testes e publicação

88 testes Node aprovados (83 anteriores + 4 de diagnóstico + 1 regressão de User-Agent).
- https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41311028062 (diagnóstico)
- https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41320020249 (correção)

Commit de diagnóstico: dce1ba8. Commit de correção: e951b0a.
Coletor experimental publicado às 15:12:40 UTC de 2026-11-01.
Worker version: 61347c71-4a57-4a13-8687-106f5cb2e9e8.
Reversão operacional possível por redeploy da versão anterior registrada no
histórico do coletor. Não remover coluna de metodologia ou apagar dados.

## Limitação separada

Após o ajuste, /probe confirmou BTC e ETH válidos e identificou uma resposta
SOL HTTP 429: `Public rate limit exceeded`. Isso é limitação de requisições do
provedor, diferente da causa do HTTP 400. Resposta rejeitada sem usar dados antigos.
O teste não prova estabilidade permanente. Evitar sondagens frequentes e investigar
limitação de /probe se houver uso excessivo, mantendo o Cron econômico de cinco minutos.

## Cron confirmado após publicação

Execução real de 2026-11-01 15:15:50.734 UTC, versão operacional 5.7.1:
- ETH e SOL: HTTP 200, cache MISS (origem consultada), 180 candles fechados,
  sem lacunas/duplicatas, User-Agent registrado, metodologia v5.7 e observações
  alinhadas efetivamente gravadas. Idade do fechamento: 51–56 segundos.
- BTC: HTTP 429 com mensagem `Public rate limit exceeded`, rejeitado corretamente.
  Nenhum HTTP 400 por ausência de User-Agent nessa execução.
- D1: zero resultados órfãos; 18 observações legadas/NULL e 198 observações v5.7
  nessa fotografia. Registros antigos preservados; nenhuma migração nesta correção.
- Cron inalterado; produção mantém modified_on 2026-10-31T20:18:49.8865Z.
- Deployment do coletor: d9b5677e-75cd-4cad-8d37-ca5d45b0b6b0 (100%).

O ajuste resolve a causa identificada do HTTP 400. Não se afirma coleta sem falhas:
a limitação 429 continua observada e requer acompanhamento separado. Não foram
adicionadas retentativas em loop que aumentariam a pressão no provedor.
