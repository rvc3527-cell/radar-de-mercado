# Auditoria inicial — 1 de novembro de 2026 (UTC)

## Código e histórico

Repositório inspecionado integralmente: index.html, engine.js, cloud-collector.js,
cloud-schema.sql, README, três arquivos de testes e workflow indicators.yml.
A árvore v5.5 contém 9 arquivos e nenhum AGENTS.md.
Todas as branches remotas são ancestrais de feature/collector-freshness-v55
(92e45fff7df7b63fe5500092eadf68c0d4be2794). main está em 00b333d e não serve
como base atual. Sequência: v5.1 Coinbase USD → v5.2 painel → v5.3 horizontes →
v5.4 exclusão de sobreposição → v5.5 diagnóstico. v5.5 difere de v5.4 somente
pelo diagnóstico de candles. Nova branch: fix/collector-integrity-v56.
PR #1 permanece aberto como rascunho da v0.2 para main; seu código já é
ancestral da v5.5. Nenhuma integração ou fechamento desse PR foi realizado.

## Infraestrutura confirmada por API (somente leitura na auditoria)

- Workers radar-de-mercado, radar-de-mercado-preview e radar-cloud-collector-preview existem.
- Coletor com binding DB para a583aa28-6961-4f6c-a490-e8c4bf560816.
- D1 radar-de-mercado-preview-observations existe; 36.864 bytes na consulta inicial.
- Cron */5 * * * * configurado. Registros D1 recentes espaçados aproximadamente
  300 segundos comprovam execução efetiva; não apenas configuração.
- Consulta inicial: 9 observações, 23 resultados, nenhum resultado órfão.
  Esses números são uma fotografia, não um estado permanente.
- Logs persistidos: consulta de telemetria não retornou eventos do coletor;
  configuração não apresentava observability. Diagnósticos investigados via
  collector_runs no D1. Não presumimos ausência de erros por falta de logs.
- Código publicado do coletor conferido e igual ao arquivo v5.5.
- Produção não modificada. Nenhuma tabela ou linha apagada.

## Causa reproduzida e primeira correção

A consulta Coinbase sem start/end recebeu cache-control public,max-age=300,
cf-cache-status HIT e Age 195–292 segundos. Em comparação no mesmo instante,
BTC/ETH tinham candles com 188 s de atraso e SOL 249 s. Com start/end explícitos,
os três retornaram cache MISS e último candle fechado com 8–9 s de idade,
sem lacunas na amostra consultada. Não foi necessária outra fonte.

v5.6 solicita janela móvel de 180 minutos, limitada ao fechamento de minuto com
margem de 5 s. O timestamp da Coinbase é de abertura; o banco continua recebendo
fechamento (abertura + 60 s). Valida números finitos, OHLC, volume, alinhamento de
minuto, ordenação, duplicatas e continuidade. Ignora candles abertos/fora da janela;
rejeita duplicatas divergentes e histórico com lacunas, sem criar preços artificiais.
Mantém mínimo de 40 candles e limite de atraso de 120 s. Resultados exigem
referência e todos os minutos até o horizonte. Falha por ativo não interrompe os demais.

Diagnósticos incluem versão, quantidade, idade, lacunas, duplicatas, status HTTP,
cache e janela. /probe usa o mesmo caminho de validação, sem gravar dados.
/health acrescenta runAgeSeconds e scheduleDelayed (mais de 10 minutos sem execução).
O registro started_at passa a representar o início real da execução.
Sem migração, dependência de produção nova ou serviço pago.

Risco: rejeitar uma janela inteira com lacunas reduz disponibilidade de coleta;
é uma decisão conservadora para evitar indicadores calculados sobre tempo irregular.
A nova janela menor pode alterar levemente a semente da EMA; dados anteriores
permanecem exploratórios. Margem de 5 s reduz risco de candle incompleto, mas não
constitui garantia contra revisão posterior pelo provedor.

## Cálculos e limitações ainda pendentes

- Coletor usa EMA inicializada no primeiro preço e RSI simples dos últimos 14
  deltas; painel usa EMA com semente média e RSI Wilder. Manter regras nesta
  correção evita mudar simultaneamente a definição do estudo; próxima etapa deve
  versionar a metodologia no banco e separar amostras antes de unificá-las.
- RSI plano no coletor resulta em 100, enquanto no painel resulta em 50.
- direction=-1 mede movimento direcional, não venda Spot executável.
- Custos são aproximação aditiva de 0,2%; não incluem spread/impostos, nem
  representam retorno executável, composto ou lucro comprovado.
- API limita a 180 linhas após JOIN. Estatísticas são uma janela recente e podem
  truncar horizontes de uma observação. Exclusão de sobreposição ocorre apenas
  dentro de ativo/horizonte. Falta mediana e custo configurável na nuvem.
- Não há versão metodológica nem separação prospectiva persistida no D1.
- Resultados pendentes são recuperados por até duas horas; indisponibilidades mais
  longas exigem backfill separado e auditado. Não preenchemos histórico nesta tarefa.
- Banco possui chaves primárias contra duplicação, mas não CHECKs/FKs para domínio.
  Dados existentes não foram reclassificados nem certificados retrospectivamente.
- Scanner, gráfico e simulação locais continuam Binance USDT; nuvem usa Coinbase USD.
- Card remoto ainda imprime BTCUSD sem barra (defeito cosmético de replace USDT).
- Safari real não foi testado nesta etapa. Interface preservada.
- README original descrevia apenas v0.1 e implantação Pages desatualizada.

## Testes e segurança

Antes da correção, cinco testes de integração falhavam por expectativas textuais
obsoletas (inclusive uma inserção de ocultação de resultado na troca de ativo).
Expectativas foram sincronizadas sem mudar a interface. Testes anteriores de
indicadores replicavam funções e integração verificava sobretudo presença de strings;
isso não provava funcionamento do coletor.

Adicionados 14 testes que executam o código real do coletor com fetch simulado,
relógio controlado e SQLite em memória usando o esquema real. Cobrem ordenação,
fechamento, atraso, lacunas, duplicatas, preços inválidos, HTTP/JSON/timeout,
isolamento de falha por ativo, idempotência, cálculo dos horizontes e endpoints
somente leitura. Suite total: 63 testes (14 coletor, 10 motor, 4 indicadores,
35 integração). Executada localmente com sucesso. Validação sintática inclui HTML
inline. Workflow ampliado para branches fix/**; continua Node 22.

Endpoints públicos aceitam apenas GET e usam SQL estático/preparado. CORS limitado
à origem preview (não é autenticação). /probe público pode amplificar consultas de
terceiros: aplicar limitação se surgir abuso. Nenhum token no código.
Volume normal permanece três consultas de mercado por ciclo, 288 ciclos/dia;
D1 cresce com histórico e diagnósticos, sem retenção automática destrutiva.
Não foi possível certificar a fatura total da conta ou conversão para R$ 50.


## Evidências complementares da infraestrutura

Antes da primeira execução v5.6, a consulta ampliada encontrou 16 execuções,
com intervalos entre 297.442 e 303.253 ms. Havia 9 observações (BTC 4, ETH 1,
SOL 4) e 24 resultados; nenhum preço de referência não positivo, direção inválida,
símbolo inesperado, horizonte inválido ou timestamp desalinhado nas verificações SQL.
A observação ETH estava sem resultados nesse instante; o coletor antigo interrompia
sua avaliação quando a consulta do ativo retornava cache antigo.
O HTML servido pelo preview era idêntico ao index.html da branch base.

Deploy v5.6 confirmado em 2026-11-01 00:33:38 UTC:
- Commit do código: beefd95681459d405fa4494004d54028e5ace058.
- Deployment: 562fb177-6b2d-4667-8f48-63b93909cd3d.
- Worker version: 0067aba0-25ef-455d-b6f0-011f204604d7 (100%).
- GitHub Actions: https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41257263226
  concluído com sucesso no Node 22.
- /probe após publicação: três ativos válidos, 180 candles fechados por ativo,
  sem lacunas/duplicatas, idade 44 s. /observations respondeu normalmente.
- Cron conferido novamente após deploy: */5 * * * *.

Uma checagem pontual não comprova estabilidade de longo prazo. É necessário
acompanhar múltiplos ciclos antes de considerar encerrada a fase de confiabilidade.

## Primeira execução automática após deploy

Confirmada no /health e em collector_runs: started_at 1793493349984
(2026-11-01 00:35:49.984 UTC). Os três ativos reportaram version 5.6,
HTTP 200, 180 candles contínuos, zero lacunas e duplicatas; idade 50–51 s.
Nenhum erro por ativo. Nenhuma condição alinhada nessa execução, portanto é
correto não criar novas observações. A avaliação de pendências foi executada
para BTC (12 combinações), ETH (3) e SOL (12), com INSERT OR IGNORE preservando
resultados anteriores. `evaluated` conta combinações avaliadas, não novas linhas.
