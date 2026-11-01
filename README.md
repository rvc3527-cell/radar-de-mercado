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

## v5.7 — indicadores compartilhados (publicação pendente)

- [Metodologia e regras preservadas](docs/METODOLOGIA-v57.md)
- [Migração proposta, riscos e reversão](docs/MIGRACAO-v57.md)
- [Validação e limitações](docs/VALIDACAO-v57.md)

O SQL persistente aguarda autorização. Não publicar o coletor v5.7 antes da
migração aprovada. O módulo `indicators.js` precisa acompanhar o coletor no upload;
para o painel, gerar o artefato com `node scripts/build-preview.mjs`.
