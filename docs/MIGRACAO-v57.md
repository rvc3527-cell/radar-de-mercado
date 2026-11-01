# Migração proposta — AGUARDANDO APROVAÇÃO DO PROPRIETÁRIO

Destino exclusivo: D1 `radar-de-mercado-preview-observations`,
ID `a583aa28-6961-4f6c-a490-e8c4bf560816`.
Nenhuma alteração de esquema remota ou publicação v5.7 foi executada nesta etapa.

## SQL exato

Arquivo versionado: `migrations/0001_methodology_v57.sql`.

```sql
ALTER TABLE observations ADD COLUMN methodology_version TEXT;
```

Impacto: acrescenta uma coluna opcional, com NULL para dados antigos e para
escritas de código antigo. Não altera chaves/índices, não remove linhas ou tabelas,
não recalcula referências, direções ou resultados. `results` e `collector_runs`
não mudam de esquema. O Worker novo grava explicitamente v5.7; não há DEFAULT v5.7.

Riscos: ALTER TABLE é persistente; executá-lo duas vezes falha por coluna duplicada.
Há pequena atualização de metadados e possível contenção momentânea de escrita.
Schema inicial `cloud-schema.sql` é para banco novo: CREATE TABLE IF NOT EXISTS
não migra tabela já existente. Não se deve executar migrações automaticamente em
requisições HTTP ou no Cron. Sem aprovação, manter v5.6 publicada e operacional.

## Sequência após autorização

1. Confirmar branch/commit e Actions aprovados. Ler configurações e deployments
   dos dois Workers preview e preservar cópias de código para reversão.
2. Ler `PRAGMA table_info(observations)` e fotografar observações/resultados
   ordenados antes da mudança (valores e contagens). Registrar também último Cron.
3. Se coluna ausente, executar SOMENTE o SQL acima; se já existe, verificar
   tipo/conteúdo e não repetir ALTER. Não executar limpeza, DROP ou UPDATE histórico.
4. Conferir que todas as linhas anteriores mantêm seus campos originais, novas
   metadatas históricas são NULL e não existem resultados órfãos. Como o Cron
   continua ativo, contagens podem aumentar; comparar preservação por chave,
   e não igualdade cega de contagens em horários distintos.
5. Publicar coletor preview incluindo DOIS módulos: `cloud-collector.js` como
   main_module e `indicators.js`, ambos application/javascript+module.
   Preservar compatibility_date 2026-10-01, binding DB e Cron */5 * * * *.
6. Gerar painel com `node scripts/build-preview.mjs` e publicar
   `dist/preview-worker.js` APENAS em radar-de-mercado-preview. O artefato mantém
   o formato de Service Worker usado pelo site preview e serve /indicators.js,
   /statistics.js e /engine.js além do HTML. Não enviar ao Worker de produção.
7. Conferir /health (methodologyReady=true), /probe, /observations e scripts do
   site. Aguardar Cron real, conferir report version 5.7 e indicadores numéricos.
   Nova observação só ocorre quando há alinhamento; não fabricar registros
   para demonstrar publicação. Verificar que futuros resultados carregam versão
   da observação pai. Revalidar preservação de chaves/valores anteriores.

## Reversão sem destruição

Reimplantar o código preview v5.6, deixando a coluna opcional no D1. Essa forma
foi testada com SQL legado: seus INSERTs especificam colunas e continuam válidos.
Manter também os metadados v5.7 já gravados para retomada futura. Não remover coluna,
não apagar novas observações e não restaurar snapshot por cima de dados atuais.

- Código base v5.6: commit `118e625` (coletor implementado em `beefd95`).
- Worker version v5.6 registrada: `0067aba0-25ef-455d-b6f0-011f204604d7`.
- Snapshot de código do painel deve ser obtido antes da publicação, pois seu build
  anterior não era versionado separadamente no repositório.

A interface v5.6 não separa metodologia: ao reverter, ocultar as estatísticas remotas
no artefato de reversão do painel, conservando coleta, gráfico e diário. Não servir
comparações que somem v5.7 e legadas. Melhor reversão operacional: manter painel
v5.7 (que lê NULL/ausência de versão) e reverter só o coletor. Isso mantém isolamento
estatístico. Não atribuir retrospectivamente v5.7 aos registros criados pelo rollback.

## Validação já realizada em banco isolado

SQLite em memória com o esquema REAL v5.6, registros e resultados de exemplo:
coluna adicionada, valores e chaves antigos idênticos, integridade SQLite ok,
reexecução rejeitada sem perda, compatibilidade de INSERTs antigos, novos registros
v5.7 identificados, resultados antigos preservados e agrupamentos separados.
Antes da migração, o novo coletor se recusa a inserir observações e retorna
METHODOLOGY_MIGRATION_REQUIRED; os endpoints de leitura seguem compatíveis.
Isso é uma proteção de emergência, não autorização para publicar antes do ALTER.
