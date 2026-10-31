import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const engine=readFileSync(new URL('../engine.js',import.meta.url),'utf8');
test('carregamento do motor no HTML',()=>{
 assert.ok(html.includes('src="/engine.js"'));
 assert.ok(html.includes('RadarEngine.simulate(closed,signalFull,'));
});
test('motor disponivel no navegador',()=>{
 const context={};context.globalThis=context;
 runInNewContext(engine,context);
 assert.equal(typeof context.RadarEngine.simulate,'function');
});
test('sinais calculados com vela anterior',()=>{
 assert.ok(html.includes('ema9[i-1]'));
 assert.ok(html.includes('rsi14[i-1]'));
});

test('estrutura de layout e CSS sem escapes literais',()=>{
 for(const id of ['grafico','visao-geral','indicadores','laboratorio','dataFreshness'])assert.ok(html.includes('id="'+id+'"'),id);
 const css=html.split('<style>')[1]?.split('</style>')[0];
 assert.ok(css,'stylesheet ausente');
 assert.ok(!css.includes(String.fromCharCode(92)+'n'),'CSS contem barra-n literal');
});
test('idade dos dados atualizada após carregamento e eventos',()=>{
 assert.ok(html.includes('function updateFreshness()'));
 assert.ok(html.includes('candles.setData(history);updateFreshness()'));
 assert.ok(html.includes('candles.update(point);updateFreshness()'));
});
test('janelas temporais nao se sobrepoem',()=>{
 assert.ok(html.includes('start:group.from,end:group.to'));
 assert.ok(html.includes('from:start,to:middle'));
 assert.ok(html.includes('from:middle,to:closed.length'));
});

test('rotas e dependencias essenciais do dashboard',()=>{
 assert.ok(html.includes('https://data-api.binance.vision/api/v3/klines'));
 assert.ok(html.includes('wss://data-stream.binance.vision:443/ws/'));
 assert.ok(html.includes('id="runHistory"'));
 assert.ok(html.includes('id="historyDays"'));
});

test('laboratório mostra movimento bruto médio e custo de equilíbrio',()=>{
 assert.ok(html.includes('Movimento médio bruto'));
 assert.ok(html.includes('Alta mínima p/ lucro'));
 assert.ok(html.includes('grossSum+=t.grossPercent'));
 assert.ok(html.includes('avgGross'));
 assert.ok(html.includes('2*(fee+slip)'));
});
test('tabela de resultados tem rolagem horizontal no celular',()=>{
 assert.ok(html.includes('class="table-scroll"'));
 assert.ok(html.includes('overflow-x:auto'));
 assert.ok(html.includes('position:sticky;left:0'));
});

test('referência Spot sem indicadores usa mesmas janelas e custos',()=>{
 assert.ok(html.includes('id="baselineRows"'));
 assert.ok(html.includes('baselineSignals=new Array(closed.length).fill(1)'));
 assert.ok(html.includes('mode:\'spot\',fee,slippage:slip,start:g.from,end:g.to'));
 assert.ok(html.includes('strategyMean-baseMean'));
 assert.ok(html.includes('Não é uma comparação pareada'));
});

test('faixas descritivas mostram incerteza sem alegar validade temporal',()=>{
 assert.ok(html.includes('Faixa descritiva da média (estratégia)'));
 assert.ok(html.includes('Faixa descritiva da média (referência)'));
 assert.ok(html.includes('const descriptiveRange=trades=>'));
 assert.ok(html.includes('trades.length<2'));
 assert.ok(html.includes('NÃO são intervalos de confiança válidos'));
});

test('modo iniciante apresenta explicação simples e controles acessíveis',()=>{
 for(const id of ['simpleStatus','simpleExplanation','simpleHistory','whyButton','simpleWhy','advancedToggle'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('Mostrar análises avançadas'));
 assert.ok(html.includes('Nenhuma operação é recomendada'));
 assert.ok(html.includes("$('simpleHistory').textContent=n?"));
});

test('iniciante pode analisar um dia sem abrir laboratório',()=>{
 assert.ok(html.includes('id="quickStudy"'));
 assert.ok(html.includes("$('quickStudy').addEventListener('click',()=>{$('historyDays').value='1';loadStudy()})"));
 assert.ok(html.includes("$('quickStudy').disabled=true"));
 assert.ok(html.includes("$('quickStudy').disabled=false"));
});
test('resumo histórico é reiniciado ao trocar ativo e não promete previsão',()=>{
 assert.ok(html.includes('Ativo alterado. O histórico deste ativo'));
 assert.ok(html.includes('não uma previsão nem uma indicação de compra'));
});

test('resumo iniciante so mostra resultado apos estudo solicitado',()=>{
 assert.ok(html.includes('if(h===1&&studyHistory.length)'));
 assert.ok(html.includes('Análise de '));
 assert.ok(html.includes('Esse resultado não prevê o futuro'));
});
test('troca de ativo reabilita botoes de estudo',()=>{
 assert.ok(html.includes("studyToken++;studyHistory=[];$('quickStudy').disabled=false;$('runHistory').disabled=false"));
});

test('guia iniciante tem quatro licoes e controles',()=>{
 for(const id of ['aprender','lessonProgress','lessonTitle','lessonText','lessonExample','lessonTakeaway','lessonNext'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const name of ['O que é preço?','O que é tendência?','Por que existem custos?','O que é risco?'])assert.ok(html.includes(name),name);
 assert.ok(html.includes("showLesson((lessonIndex+1)%lessons.length)"));
 assert.ok(html.includes('Os exemplos são fictícios'));
});

test('explicação acessível distingue movimento favorável e lucro após custos',()=>{
 assert.ok(html.includes('id="resultExplanation"'));
 assert.ok(html.includes('grossPct'));
 assert.ok(html.includes('netPct'));
 assert.ok(html.includes('cost.toFixed(3)'));
 assert.ok(html.includes('explanation.hidden=false'));
 assert.ok(html.includes("$('resultExplanation').hidden=true"));
});

test('simulador didatico de variacao e custos',()=>{
 for(const id of ['simulador-risco','riskMove','riskCost','riskMoveLabel','riskCostLabel','riskFinal','riskNet','riskExplanation'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('function updateRiskDemo()'));
 assert.ok(html.includes('100*(move-cost)/100'));
 assert.ok(html.includes("$('riskMove').addEventListener('input',updateRiskDemo)"));
 assert.ok(html.includes("$('riskCost').addEventListener('input',updateRiskDemo)"));
});

test('conta demo usa saldo virtual e nao envia ordens',()=>{
 for(const id of ['conta-demo','demoCash','demoEquity','demoPosition','demoPnl','demoAmount','demoBuy','demoSell','demoReset'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes("const DEMO_KEY='radar-demo-v1',DEMO_FEE=.001"));
 assert.ok(html.includes('setDemoQuote(symbol,Number(k.c))'));
 assert.ok(html.includes('Date.now()-q.at<15000'));
 assert.ok(html.includes('localStorage.setItem(DEMO_KEY'));
 assert.ok(html.includes('if(!confirm('));
});

test('scanner compara tres ativos sem sinal de entrada',()=>{
 for(const id of ['scanner','scanRefresh','scanStatus','scanResults'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes("['BTCUSDT','ETHUSDT','SOLUSDT']"));
 assert.ok(html.includes('compareAssets()'));
 assert.ok(html.includes('não por lucro previsto'));
});

test('diario prospectivo aguarda candles futuros',()=>{
 for(const id of ['scanEvaluate','scanJournalStatus','scanJournal'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('radar-observations-v1'));
 assert.ok(html.includes('Date.now()-item.time<30000'));
 assert.ok(html.includes('Date.now()<item.entry.time+h*60000'));
 assert.ok(html.includes('evaluateScanJournal()'));
});

test('estatisticas de observacoes mostram custos e tamanho de amostra',()=>{
 assert.ok(html.includes('id="scanStats"'));
 assert.ok(html.includes('function renderScanStats()'));
 assert.ok(html.includes('v-0.2'));
 assert.ok(html.includes('sem observações concluídas'));
 assert.ok(html.includes('Nenhum horizonte foi validado'));
});

test('estatisticas separadas por ativo e horizonte exigem amostra preliminar',()=>{
 assert.ok(html.includes('id="scanAssetStats"'));
 assert.ok(html.includes('function renderScanAssetStats()'));
 assert.ok(html.includes('x.symbol===symbol&&Number.isFinite(x.results[horizon])'));
 assert.ok(html.includes('n<30'));
 assert.ok(html.includes('sem validação estatística'));
});

test('comparacao pareada usa mesmo instante e horizonte para compra simples',()=>{
 assert.ok(html.includes('id="scanBaseline"'));
 assert.ok(html.includes('function renderScanBaseline()'));
 assert.ok(html.includes('x.results[horizon]*x.direction-0.2'));
 assert.ok(html.includes('strategy-baseline'));
 assert.ok(html.includes('não é comparação com comprar continuamente'));
});

test('separacao cronologica de observacoes futuras',()=>{
 assert.ok(html.includes('id="scanForwardSplit"'));
 assert.ok(html.includes('function renderScanForwardSplit()'));
 assert.ok(html.includes('.sort((a,b)=>a.time-b.time)'));
 assert.ok(html.includes('rows.slice(0,20)'));
 assert.ok(html.includes('rows.slice(20,30)'));
 assert.ok(html.includes('area.append(caution);renderScanForwardSplit()'));
});

test('coleta automatica opt-in apenas com aba visivel',()=>{
 assert.ok(html.includes('id="scanAuto"'));
 assert.ok(html.includes('id="scanAutoStatus"'));
 assert.ok(html.includes("document.visibilityState==='visible'"));
 assert.ok(html.includes('setInterval('));
 assert.ok(html.includes('65000'));
 assert.ok(html.includes('clearInterval(scanAutoTimer)'));
});

test('interface moderna prioriza oportunidade e mostra momento e duracao sem prometer sinais',()=>{
 for(const id of ['scanner','scanResults','scanAuto','scanJournal'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('Oportunidades em observação'));
 assert.ok(html.includes('opportunity-card'));
 assert.ok(html.includes('Aguardar confirmação'));
 assert.ok(html.includes('Não validada'));
 assert.ok(html.includes('<details class="scanner-details">'));
 assert.ok(html.includes('#6d53f5'));
});

test('resumo principal exige dados recentes e evita sinais de entrada nao validados',()=>{
 assert.ok(html.includes('id="scanDecision"'));
 assert.ok(html.includes('Cotação desatualizada'));
 assert.ok(html.includes('Date.now()-lastClose>120000'));
 assert.ok(html.includes('Ainda sem entrada ou duração validada'));
 assert.ok(html.includes('Observar; sem entrada confirmada'));
});

test('avaliacao de entrada demo considera apenas compras spot e evita sobreposicao temporal',()=>{
 assert.ok(html.includes('id="scanDemoStudy"'));
 assert.ok(html.includes('function renderScanDemoStudy()'));
 assert.ok(html.includes('x.direction===1'));
 assert.ok(html.includes('row.time>=lastEnd'));
 assert.ok(html.includes('lastEnd=row.time+horizon*60000'));
 assert.ok(html.includes('nenhum momento de entrada ou prazo foi validado'));
});

test('acompanhamento prospectivo com marco temporal persistente',()=>{
 assert.ok(html.includes('id="scanHoldout"'));
 assert.ok(html.includes('radar-forward-holdout-v44'));
 assert.ok(html.includes('x.time>=scanHoldoutStart'));
 assert.ok(html.includes('x.direction===1'));
 assert.ok(html.includes('renderScanHoldout()'));
});

test('status da coleta na nuvem isolada da amostra local',()=>{
 assert.ok(html.includes('id="cloudCollectorStatus"'));
 assert.ok(html.includes('function refreshCloudCollector()'));
 assert.ok(html.includes('radar-cloud-collector-preview.rvc3426.workers.dev/observations'));
 assert.ok(html.includes('dados remotos não confirmados'));
});

test('painel remoto mostra estado sem observacoes e atualizacao manual',()=>{
 assert.ok(html.includes('id="cloudCollectorBoard"'));
 assert.ok(html.includes('id="cloudCollectorRefresh"'));
 assert.ok(html.includes('sem observações registradas'));
 assert.ok(html.includes('Nenhum registro até agora'));
 assert.ok(html.includes('Não foi possível confirmar os dados remotos'));
});
