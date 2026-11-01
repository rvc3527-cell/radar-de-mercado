# Coletor 5.7.2 — implementação pronta, migração aguardando autorização

Branch fix/coinbase-rate-limit-v572 a partir de fix/coinbase-http-diagnostics-v571
(004f783). A branch feature/petroleo-coral-redesign existe, está publicada e não
foi sobrescrita. Nenhum CSS, componente do redesign ou artefato do painel alterado.
O deploy futuro é exclusivo do coletor experimental, não do painel ou produção.

## Investigação somente leitura

Fotografia do D1: 198 execuções, intervalos de 296.987 a 303.253 ms. Cron continua
*/5 * * * *. Contagem por ativo/relatório desde o início: 275 respostas 200,
260 respostas 400, 11 respostas 429 e 48 itens antigos sem httpStatus. Isso não é
contagem de requisições do /probe: essas chamadas não eram persistidas na v5.7.1.
Os 400 históricos incluem a exigência de User-Agent já corrigida; não se deve
atribuir todos os erros à limitação de taxa ou à frequência atual do Cron.

Documentação consultada:
https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits

Coinbase declara limite público por IP de 10 req/s e rajada de até 15, com token
bucket. Nossa coleta normal faz somente três requisições sequenciais por ciclo.
O /probe antigo acrescenta três requisições por acesso e era chamado pelo painel
na carga e atualização manual. Há risco de chamadas simultâneas em vários clientes.
Saída compartilhada de Cloudflare pode contribuir para limites por IP, mas isso
não foi comprovado como causa única; não há telemetria de todo o tráfego do IP.
Não foram feitas sondagens agressivas, rotação de IP ou mudança de provedor.

Cache HIT podia mascarar o 400 de User-Agent, enquanto a origem respondia BYPASS.
Um HIT não comprova ausência de rate limit. A janela temporal explícita continua
mudando com o fechamento: cache não é usado para promover dados antigos a atuais.

## Política implementada

- Uma linha de controle persistente para Coinbase, acessível por todos os isolates.
- Claim atômico D1: lease de 180 segundos e identificador aleatório por execução.
- Um claim por intervalo de cinco minutos. Execução repetida/concorrente não chama
  Coinbase. Após crash, o próximo intervalo pode tomar lease expirada.
- Inserts de observações/resultados condicionados à lease/token atual: o dono
  anterior não grava após ser substituído. Journal e liberação final em batch
  transacional; não se editam execuções históricas.
- Um segundo entre ativos; máximo de dois segundos de pausa normal por execução.
  Ordem gira por intervalo, sem aumentar requisições.
- Zero retentativas dentro do Worker. Um 429 persiste cooldown e adia os demais
  ativos, pois o limite público é por IP/provedor.
- Retry-After aceita segundos inteiros ou data HTTP. Nenhuma espera bloqueante até
  esse horário: o Cron registra adiamento e sai. Valor 0 tem piso conservador de
  60 segundos. Datas futuras longas são respeitadas sem manter Worker em execução.
- Sem Retry-After válido: 5, 10, 20, 40 e depois até 60 minutos entre ciclos com
  limitação; sequência reinicia após um ciclo completo bem-sucedido.
- 400 e falhas de rede são contabilizados por ativo; os outros ativos prosseguem.
- Não reprocessa observações já concluídas nos três horizontes, reduzindo inserts
  ignorados. Nenhuma referência, direção ou resultado histórico é recalculado.

O espaçamento não coordena todo o tráfego do IP compartilhado de Cloudflare;
portanto, não garante eliminação de 429. A primeira chamada de cada ciclo ainda
pode encontrar um bucket consumido por outros clientes do mesmo IP.

## Endpoints e monitoramento

/observations mantém seu contrato, metodologia, limite e ordenação.

/health mantém HTTP 200, last_run.report em JSON string e campos consumidos pelo
painel. `ok` agora significa fonte operacional, não apenas banco acessível:
- workerOk/database: serviço e D1 acessíveis;
- providerState/providerLabel: operational/Operacional, partial/Parcialmente
  operacional, cooldown/Aguardando limite da API, stale/Dados desatualizados ou
  unavailable/Indisponível;
- assets: última tentativa, sucesso válido e timestamp de candle; idade e erro;
- http400/http429/networkErrors por ativo e totals;
- cooldownUntil/cooldownActive, leaseActive e scheduleDelayed;
- metricsSince identifica o início dos novos contadores. Não são retroativos.

Monitoramento considera atualização recebida há até 10 minutos para acomodar Cron
5 min; isso NÃO relaxa o gate de novas observações: candles continuam exigindo
fechamento confirmado, atraso máximo 120 s, integridade e indicadores v5.7.
Sem estado inicial, health não inventa histórico de sucesso. Antes do primeiro
ciclo da v5.7.2, pode indicar indisponível, mesmo com registros antigos no diário.

/probe passa a mostrar SOMENTE o estado armazenado: mode=stored, checks com last
success/error e nota explícita. Zero fetch e zero escrita para 30 chamadas repetidas
no teste. Estado antigo não se apresenta como consulta feita naquele momento.
A forma básica checks/ok é compatível com o painel atual. A explicação textual do
painel sobre “teste de conexão” pode ser refinada depois, sem tocar CSS nesta tarefa.

## Migração proposta — NÃO EXECUTADA NO D1 REMOTO

Arquivo migrations/0002_collector_control_v572.sql:

```sql
CREATE TABLE IF NOT EXISTS collector_control (
  provider TEXT PRIMARY KEY CHECK(provider='coinbase'),
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_slot INTEGER NOT NULL DEFAULT -1,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO collector_control(provider) VALUES('coinbase');
```

Tabela pequena, inicialmente uma linha. Nenhuma alteração nas tabelas observations,
results ou collector_runs. Não copia nem reclassifica dados. JSON guarda estado e
contadores de apenas três ativos; não acumula candles. Custo adicional: poucas
leituras/escritas de uma linha por ciclo, sem serviço pago ou infraestrutura nova.

Riscos: alteração persistente de esquema, pequena contenção D1 durante DDL e uma
queda de processo podendo adiar coleta até a lease expirar. IF NOT EXISTS não
valida tabela preexistente incompatível: conferir sqlite_master e PRAGMA antes.
O script é reaplicável quando o esquema é o esperado e preserva controle já existente.

Reversão operacional: restaurar coletor 5.7.1, deixar tabela/estado e dados intactos.
Não executar DROP nem limpar observações/resultados. A reversão reativa o /probe
ativo antigo e perde a proteção de cooldown; usar apenas se necessário e limitar
sondagens manualmente. Não há obrigação de desfazer o esquema para reverter código.

## Testes

Suite completa Node inclui indicadores, motor, integração, migração v5.7,
diagnósticos e os novos testes de rate limit. SQLite real em memória, fetch simulado
e relógio controlado; sem requisições Coinbase para testes automatizados.

Cenários: 200/400/429, Retry-After/data/ausência/inválido, cooldown ativo/encerrado,
recuperação, falhas parciais/totais, stale, concorrência, lease vencida com fencing,
probe sem rede/escrita, migração/reexecução segura, preservação de dados anteriores,
indicadores e espaçamento/rotação. Novos testes: tests/rate-limit.test.mjs.

## Sequência após autorização

1. Confirmar Actions e commit; fotografar por chave registros e versão publicada.
2. Conferir nome/ID do D1 preview e esquema. Aplicar somente a migração acima.
3. Conferir preservação de observações/resultados e linha de controle inicial.
4. Upload de cloud-collector.js + indicators.js para radar-cloud-collector-preview,
   preservando DB, compatibility_date 2026-10-01 e Cron */5 * * * *.
5. Conferir /health, /probe mode=stored e /observations. Não fazer probe ativo.
6. Aguardar Cron real e validar cooldown/recuperação quando o provedor limitar,
   sem fabricar erro ou inserir observação de teste no D1 remoto.
7. Comparar registros antigos por chave e metadados de produção/painel.

Sem aprovação da migração, manter 5.7.1 publicada. Não publicar código que exige
controle antes da tabela: ele registra CONTROL_MIGRATION_REQUIRED e não consulta
Coinbase. Não há mecanismo de auto-migração no runtime.

## Fontes alternativas — avaliação preliminar

| Fonte | Candles / pares | Limites e disponibilidade | Custo / impacto |
| --- | --- | --- | --- |
| Coinbase Exchange | 1 min; BTC/ETH/SOL em USD, já usados | Público por IP 10/s, rajada 15; 429 observado | API pública sem assinatura paga, continuidade metodológica |
| Kraken Spot | OHLC com intervalo de 1 min; pares USD devem ser confirmados na AssetPairs antes de migrar | Documento limita retorno a 720 entradas e inclui última vela não concluída; requer filtrar fechamento; rate limit/throttling próprio | Consulta pública; preços de outro livro/mercado, precisa identificação de provedor e estudo separado |
| Binance Spot | 1 min, BTC/ETH/SOL USDT já usados no scanner | Limites por peso/IP; houve 403 na coleta deste projeto, sem evidência de que deixou de ocorrer no Worker | API pública; USDT não equivale a USD, sem migração silenciosa |

Referências:
- https://docs.kraken.com/api/docs/rest-api/get-ohlc-data (documento consultado: limite
  720 e presença da vela ainda não concluída confirmados).
- https://docs.kraken.com/api/docs/guides/spot-rest-ratelimits
- https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits

As três usam HTTPS/JSON compatível com Workers; isso não certifica disponibilidade
regional ou confiabilidade equivalente. Limites atuais específicos de Kraken/Binance
não foram certificados nesta etapa. Não há comparação de uptime medida nem motivo
para trocar automaticamente de fonte antes de observar esta política econômica.
