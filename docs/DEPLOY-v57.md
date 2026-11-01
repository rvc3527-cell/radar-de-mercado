# Implantação v5.7 — ambiente experimental

Autorização explícita do proprietário recebida nesta sessão para o ALTER TABLE.
Nenhuma alteração no Worker de produção radar-de-mercado.

## Código e testes

- Branch: feature/indicator-consistency-v57.
- Commit funcional: 20fdbbe896ac2d216bc28f468e231108ea08eef1.
- Commit validado antes do deploy: 47ff6b774ba7964d53c309c0850fbc2079971711.
- 82 testes Node aprovados antes da migração; após ajuste de diagnóstico,
  83 testes aprovados (um teste adicional).
- Actions antes do deploy: https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41259354124
- Actions do ajuste: https://github.com/rvc3527-cell/radar-de-mercado/actions/runs/41269115427
- Commit do ajuste: 973b927aebbc1cac22e98812cb21c09706a32b3a.
- PR: https://github.com/rvc3527-cell/radar-de-mercado/pull/2

## Migração confirmada

Aplicado uma única vez, exclusivamente ao banco
radar-de-mercado-preview-observations (a583aa28-6961-4f6c-a490-e8c4bf560816):

```sql
ALTER TABLE observations ADD COLUMN methodology_version TEXT;
```

PRAGMA confirmou coluna TEXT, opcional, sem DEFAULT. Não executados DELETE,
DROP, UPDATE histórico ou recálculo de observações anteriores.

Fotografia anterior completa: 17 observações, 45 resultados. Todos os campos
originais dessas linhas foram comparados por chave antes/depois e permaneceram
idênticos. Todas as observações fotografadas ficaram com NULL na nova coluna.
O Cron seguiu ativo durante a migração: na verificação imediatamente posterior
havia 18 observações e 51 resultados, ainda sem metodologia marcada. Esse
crescimento veio da coleta v5.6 em andamento, sem relabeling para v5.7.

Cópias locais fora do Git, em /workspace/shared:
- radar-v57-data-before.json: observações e resultados anteriores completos.
- radar-cloud-collector-preview-before.txt: código anterior retornado pela API.
- radar-de-mercado-preview-before.txt: código anterior completo do painel.
- radar-v57-before.json: configurações, deployments e snapshot inicial de diagnóstico.

A API de ferramentas limita respostas grandes. O snapshot inicial de diagnóstico
continha truncamentos; ele NÃO foi usado para certificar dados ou como única cópia
de reversão. As cópias de código foram obtidas em blocos e conferidas por tamanho;
a fotografia de dados foi lida em páginas sem truncamento.

## Deploys confirmados

| Recurso | Publicação UTC | Deployment ID | Worker version ID |
| --- | --- | --- | --- |
| radar-cloud-collector-preview | 2026-11-01 01:06:39 | de90eab5-901c-4c6e-ba7a-6bc671ac6cde | 31b5986e-f043-4df1-8500-ecabb60948cd |
| radar-de-mercado-preview | 2026-11-01 01:06:49 | 0e7ce0d3-5883-41aa-96b3-ba576e4a2123 | e8f9753a-4c88-4c24-b449-0de5217ded23 |

Coletor enviado com cloud-collector.js e indicators.js. Painel publicado com
artefato reproduzível de scripts/build-preview.mjs. API confirmou sucesso e
versões ativas a 100%. Binding DB, compatibility_date 2026-10-01 do coletor,
configuração do painel e Cron */5 * * * * preservados. Metadados do Worker de
produção comparados antes/depois e idênticos (modified_on permanece
2026-10-31T20:18:49.8865Z).

## Verificação dos endpoints

- /health: version 5.7, methodology_version v5.7, methodologyReady true,
  database true, scheduleDelayed false.
- /probe: HTTP 200 e qualidade válida para BTC, ETH e SOL, 180 candles fechados
  por ativo, zero lacunas/duplicatas. Consulta é somente leitura.
- /observations: HTTP 200, metodologia da observação em cada linha, legados NULL.
- HTML, engine.js, indicators.js e statistics.js servidos pelo preview foram
  comparados byte a byte com os arquivos da branch: todos idênticos.

Links públicos:
- https://radar-de-mercado-preview.rvc3426.workers.dev
- https://radar-cloud-collector-preview.rvc3426.workers.dev/health
- https://radar-cloud-collector-preview.rvc3426.workers.dev/observations

## Reversão operacional

Preferir manter o painel v5.7 para preservar a separação estatística e restaurar
apenas o coletor v5.6: Worker version 0067aba0-25ef-455d-b6f0-011f204604d7.
A coluna opcional permanece no banco; não apagar metadados ou dados novos.
Versão anterior do painel: ea08a7d9-5141-4eb3-b8d3-8037e3a1d068. Esse painel antigo
não separa versões; se for usado, ocultar estatísticas remotas para evitar mistura.
Nenhuma reversão foi necessária ou executada nesta publicação.


## Atualização do painel e validação automática real

Pequeno ajuste após deploy: o diagnóstico distingue “Código ativo” da metodologia
informada em cada execução. Isso evita apresentar relatório antigo como v5.7
no intervalo entre deploy e próximo Cron. O cálculo dos indicadores não mudou.

Painel final republicado em 2026-11-01 03:26:37 UTC:
- Deployment: d6ec4220-1f45-478c-8f19-57536d60cb7a.
- Worker version: 44daa126-068b-496b-aca2-d54c3cfe6416 (100%).
- Coletor continua na versão 31b5986e-f043-4df1-8500-ecabb60948cd.

Primeira execução com metodologia v5.7 confirmada no D1:
started_at=1793495750404 (2026-11-01 01:15:50.404 UTC).
Execução recente consultada: started_at=1793503550101
(2026-11-01 03:25:50.101 UTC). BTC, ETH e SOL retornaram HTTP 200,
180 candles fechados, zero lacunas/duplicatas e idade de 50–57 s.
EMA 9, EMA 21 e RSI 14 numéricos e methodology_version v5.7 em cada diagnóstico.
ETH e SOL alinhados nessa execução; observações novas foram efetivamente gravadas.

Fotografia após validação:

| Metodologia | Observações | Resultados |
| --- | --- | --- |
| Anterior/NULL | 18 | 54 |
| v5.7 | 44 | 126 |
| Total | 62 | 180 |

51 execuções registradas no total. Todas as 17 observações e 45 resultados da
fotografia inicial permanecem com os mesmos campos originais. As observações
antigas fotografadas continuam com NULL; zero resultados órfãos, zero referências
não positivas, direções/horizontes inválidos ou timestamps desalinhados nas
verificações SQL. Números mudam naturalmente com o Cron ativo.

Há respostas HTTP 400 intermitentes da Coinbase em ciclos anteriores, registradas
como API_HTTP. Também ocorreram antes da v5.7. Nesses casos o coletor rejeita a
consulta, sem aceitar dados inválidos como atuais. Uma consulta posterior ao mesmo
período respondeu 200, e o /probe e o ciclo recente voltaram a funcionar. A causa
precisa de diagnóstico dedicado com resposta sanitizada do provedor; não foi
atribuída incorretamente aos indicadores nem escondida como sucesso permanente.
Não houve troca de fonte ou relaxamento das validações para contornar a falha.

## Navegador

Interface publicada carregada em Chromium com viewport de iPhone 13, biblioteca
de gráficos real e dados remotos reais: HTTP 200, scripts funcionais, scanner
concluído, dados da nuvem visíveis, sem erros JavaScript nem overflow horizontal.
O navegador local não confia no certificado do proxy do ambiente; os recursos
HTTPS foram obtidos via curl com validação TLS e fornecidos ao navegador, mantendo
origens e cabeçalhos. Não foi desligada a validação TLS. WebSocket ao vivo não foi
certificado por esse procedimento. Isso não substitui Safari físico, ainda pendente.
O teste isolado com fixtures tinha nove verificações móveis aprovadas.
