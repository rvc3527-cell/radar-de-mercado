# Hipótese pré-especificada — confirmed-trend-v1

Versão da política: confirmed-trend-policy-1. Fase 7.6, somente laboratório offline, sem strategyPort ou operações. Esta especificação foi escrita antes de implementar/executar a candidata, sem consultar um período de avaliação final reservado. Não houve otimização de parâmetros.

Hipótese exploratória: exigir tendência persistente e confirmação mais longa, com filtros de volatilidade/extensão mais restritos, pode reduzir decisões em movimentos desfavoráveis. Isso também pode perder movimentos e aumentar abstenção. Não se presume melhora de retorno.

Dados: Coinbase Exchange BTC-USD Spot, USD; velas de 60s fechadas há pelo menos 5s, disponibilidade conhecida no instante, histórico contínuo >=40 velas. EMA 9/21 pela metodologia compartilhada v5.7. Nenhum preço de candle é executável.

Entrada observacional: EMA9>EMA21, ambas maiores que seus valores de três velas antes; três últimos fechamentos crescentes e acima da respectiva EMA9; maior (high-low)/close das últimas dez velas <=0,8%; extensão (último close/EMA9-1) entre 0 e 0,3%. Havendo livro, exigir livro válido/recente, spread <=20bps, lados com volume positivo, bid>EMA9 e distância ask/último close <=0,3%. Sem livro: somente condição de candle, sem confirmação de entrada/preço/quantidade.

Saída observacional de um sinal acompanhado: EMA9<=EMA21, fechamento abaixo de EMA21, ou cinco minutos desde o sinal de entrada. É acompanhamento hipotético, não posição executada. Não estima stop ou resultado financeiro com candles. Sem confirmação/continuidade/dados suficientes, abster-se e registrar motivo.

Todos os parâmetros ficam imutáveis no módulo. Candidata e referência usam a mesma visão as-of e os mesmos livros disponíveis. Comparação de decisões não é comparação de PnL. Sem trilha completa de execução/risco, nenhuma delas recebe fills/PnL. Próximas versões ou ajustes precisam de novo ID de política e novo período final independente.
