# Radar de Mercado v0.1

Painel estático de preços de criptomoedas com velas de 1 minuto, EMA 9, EMA 21 e RSI 14.

## Publicar
1. Crie um repositório público ou privado no GitHub chamado `radar-de-mercado`.
2. Envie o arquivo `index.html` para a raiz do repositório.
3. No Cloudflare, acesse Workers & Pages > Create > Pages > Connect to Git.
4. Escolha o repositório, framework `None`, comando de build vazio e diretório de saída `/` (raiz).
5. Publique e abra a URL `.pages.dev` gerada.

## Limitações
- Requer acesso a `data-api.binance.vision`, `data-stream.binance.vision` e `unpkg.com`.
- WebSocket funciona enquanto a aba estiver ativa; em segundo plano no iOS pode ser suspenso.
- Não possui previsão nem registro persistente nesta versão.
- Indicadores usam somente velas fechadas. O preço atual usa a vela em formação.
- Reconexão busca novamente o histórico para preencher lacunas.

## Continuação do projeto (v5.6 experimental)

O projeto evoluiu além da v0.1 descrita acima. Leia a
[auditoria técnica](docs/AUDITORIA-2026-11-01.md) e as
[instruções do coletor](docs/COLETOR.md) antes de implantar.
Produção exige autorização explícita do proprietário.

## v5.7 — indicadores compartilhados (experimental)

- [Metodologia e regras preservadas](docs/METODOLOGIA-v57.md)
- [Migração proposta, riscos e reversão](docs/MIGRACAO-v57.md)
- [Validação e limitações](docs/VALIDACAO-v57.md)

A migração foi autorizada pelo proprietário e aplicada exclusivamente no D1
experimental. O módulo `indicators.js` precisa acompanhar o coletor no upload;
para o painel, gerar o artefato com `node scripts/build-preview.mjs`.

[Evidências da implantação v5.7](docs/DEPLOY-v57.md).

## Coletor 5.7.1

[Correção confirmada do User-Agent exigido pela Coinbase e limitação 429](docs/COINBASE-HTTP-v571.md).
A metodologia dos indicadores permanece v5.7; a atualização é operacional.

## Fase 6 — Inteligência Estatística (Preview)

[Documentação, APIs, evidências, implantação e reversão](docs/HISTORICAL-INTELLIGENCE-v60.md).

Histórico paginado, filtros, estatísticas por metodologia e monitoramento histórico
na seção Observações do dashboard Petróleo & Coral. GET /history, /statistics e
/collector-history usam somente D1, sem novas consultas à Coinbase. Nenhuma
migração nesta fase. Preserva indicadores v5.7 e controle do coletor v5.7.2.

[Preview experimental](https://radar-de-mercado-preview.rvc3426.workers.dev/#observacoes)
· [PR para revisão](https://github.com/rvc3527-cell/radar-de-mercado/pull/6).
Produção permanece protegida; os passos de publicação v0.1 acima são históricos.

## Radar 7.0 — Oportunidades (Preview)

[Arquitetura auditada, regras de bloqueio, evidência e testes](docs/RADAR-v70.md).
Tela simples com análise determinística e detalhes acessíveis. Sem amostra
prospectiva compatível, mostra AGUARDAR. Política v7.0-observe-1 separada dos
indicadores v5.7 e do histórico Coinbase USD. Sem alteração no D1 ou no coletor.
