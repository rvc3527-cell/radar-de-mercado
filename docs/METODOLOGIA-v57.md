# Metodologia v5.7 — indicadores e amostras

## Implementação única

`indicators.js` é carregado como script clássico no navegador e importado como
módulo de efeito lateral pelo coletor. A mesma implementação atende indicadores
numéricos, linhas do gráfico, scanner e séries do laboratório. Não há pacote npm
em produção. `RadarIndicators` é imutável; não contém dados de requisições.

EMA de período N:

- Primeiro resultado após N preços: média aritmética dos primeiros N fechamentos.
- Depois: EMA anterior + 2/(N+1) × (fechamento − EMA anterior).
- Antes da semente: null. A média inicial é acumulada incrementalmente para
  evitar overflow da soma. Preços constantes preservam exatamente a constante.

RSI de Wilder, período 14:

- Precisa de 15 fechamentos, correspondentes a 14 variações.
- Sementes: médias aritméticas de ganhos e de perdas das primeiras 14 variações.
- Suavização: nova média = média anterior × 13/14 + variação positiva/negativa ÷ 14.
- RSI = 100 × ganho médio / (ganho médio + perda média).
- Só ganhos: 100; só perdas: 0; ambos zero, inclusive mercado constante: 50.
- Resultado no intervalo [0,100]; sem arredondamento antes de classificar.

Preços precisam ser números positivos finitos; não se convertem strings dentro
do motor. Histórico insuficiente retorna null; preço inválido lança erro mesmo
em histórico curto. A API de preços recebe arrays já fechados: wrappers de candles
validam ordem e continuidade e descartam candles em formação, com margem de 5 s.
Datas de abertura em segundos (Binance/painel) e de fechamento em milissegundos
(Coinbase/D1) são tratadas explicitamente. Cálculos não incorporam valores futuros.
O laboratório usa o indicador do candle anterior à entrada, como antes.

## Classificação: diferenças encontradas ANTES da alteração

As condições existentes não foram unificadas como estratégia nesta versão:

| Componente | Direção | Faixa RSI elegível |
| --- | --- | --- |
| Scanner / cenários | EMA9 > EMA21 alta; < baixa; empate neutro | Alta: 50 ≤ RSI < 70; baixa: 30 < RSI ≤ 50 |
| Coletor | EMA9 > EMA21 alta; senão baixa, inclusive empate | Mesmas faixas do scanner |
| Laboratório | EMA9 > EMA21 alta; < baixa; empate neutro | 30 < RSI < 70 para ambas as direções |

O helper `classify` recebe `tieDirection=-1` apenas no coletor, preservando sua
regra histórica. Scanner usa 0. O laboratório conserva sua regra exploratória.
No mercado totalmente constante, o RSI correto 50 pode agora permitir uma
observação de baixa no coletor por sua regra de empate preexistente. Isso não
representa ordem ou recomendação. Mudar essa regra requer uma decisão metodológica
posterior, com outra versão e sem relabeling de dados anteriores.

Paridade matemática significa mesmos candles, mesma janela e parâmetros. Não
significa que Coinbase USD e Binance USDT tenham os mesmos preços ou leituras.
O coletor usa janela de 180 minutos; scanner 120; gráfico até 1.000; estudo pode
usar dias. A semente de EMA/RSI depende do histórico, por isso janelas diferentes
podem gerar valores diferentes mesmo com implementação idêntica.

## Rastreabilidade e integridade estatística

Nova observação possui `methodology_version='v5.7'`. Registros antigos mantêm NULL,
exibido como “Anterior — versão não comprovada”. Não se atribui v5.6 a todos os
antigos: eles podem ter sido criados em versões anteriores.

Resultados herdam a metodologia da observação por JOIN (symbol,time); não precisam
de coluna redundante na tabela results. Resultados existentes continuam imutáveis
por INSERT OR IGNORE. A conclusão futura de um horizonte legado permanece vinculada
à observação legada; não aplica os indicadores novos para recriar o sinal antigo.
Se o mesmo minuto já tem observação antiga, ela é preservada, sem reclassificação.

Estatísticas remotas são agrupadas por metodologia, ativo e horizonte antes de
excluir sobreposições. Custos hipotéticos de 0,2%, média e mediana são descritivos.
Amostras menores que 30 são rotuladas insuficientes; 30 não prova validade.
A API limita 180 observações ANTES do JOIN, preservando seus três horizontes,
e informa que o recorte é recente, não toda a população do banco.

O diário local conserva o mesmo storage e os registros válidos antigos, sem lhes
atribuir versão. Novos itens recebem v5.7. Estatísticas locais e acompanhamento
prospectivo filtram somente v5.7; diário identifica os anteriores. Foi removido o
corte silencioso dos últimos 60 itens, evitando apagar registros ao atualizar.
Crescimento do localStorage pode atingir a cota do navegador; a mensagem de falha
de armazenamento existente foi preservada. Não há sincronização financeira real.

A v5.6 continua validando HTTP, janela Coinbase explícita, candles fechados,
OHLC, volume, timestamps, lacunas, duplicatas e atraso ≤120 s. Falhas por ativo
continuam isoladas. Não há troca de fonte, pares, Cron ou execução financeira.
