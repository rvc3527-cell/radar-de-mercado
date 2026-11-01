import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createContext,runInContext} from 'node:vm';
export const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
export const collectorSource=read('cloud-collector.js');
export const collector=await import('data:text/javascript;base64,'+Buffer.from(collectorSource.replace("'./indicators.js'",JSON.stringify(new URL('../../indicators.js',import.meta.url).href))+'\nconst collectForTest=env=>collect(env,{pause:async()=>{}}); export {collectForTest as collect,validateCandles,methodologyReady};').toString('base64'));
export function database({legacy=false}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(read(legacy?'tests/fixtures/schema-v56.sql':'cloud-schema.sql'));
 if(legacy)sqlite.exec(read('migrations/0002_collector_control_v572.sql'));
 return {sqlite,async batch(stmts){sqlite.exec('BEGIN');try{const result=[];for(const stmt of stmts)result.push(await stmt.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}},prepare(sql){let args=[];return {bind(...values){args=values;return this},async run(){return sqlite.prepare(sql).run(...args)},async all(){return {results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)}}}};
}
class Element{
 constructor(){this.children=[];this.value='';this.style={};this.classList={toggle(){}};this.hidden=false;this.checked=false;this.disabled=false;this.dataset={};this._text=''}
 set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(c=>c.textContent??c).join(' ')}
 set innerHTML(v){this._text=v;this.children=[]}get innerHTML(){return this._text}
 append(...items){this.children.push(...items)}prepend(...items){this.children.unshift(...items)}replaceChildren(...items){this._text='';this.children=items}
 addEventListener(){}setAttribute(){}removeAttribute(){}closest(){return this}scrollIntoView(){}
}
export async function panel({now=1800000010000,stored=[],fetch=async()=>new Response('',{status:503})}={}){
 const elements=new Map(),storage=new Map([['radar-observations-v1',JSON.stringify(stored)]]),errors=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 for(const [id,value] of Object.entries({symbol:'BTCUSDT',payout:'80',feeBps:'0.1',slipBps:'0.02',historyDays:'1',riskMove:'1',riskCost:'0.2',demoAmount:'100'}))get(id).value=value;
 class Clock extends Date{static now(){return now}}
 const series=()=>({setData(){},update(){}});
 const context=createContext({Date:Clock,Response,Request,URL,AbortSignal,console:{log(){},error(e){errors.push(e)}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},fetch,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){},visibilityState:'visible'},ResizeObserver:class{observe(){}},WebSocket:class{close(){}},LightweightCharts:{createChart:()=>({addCandlestickSeries:series,addLineSeries:series,applyOptions(){},timeScale:()=>({fitContent(){}})})}});
 for(const f of ['indicators.js','statistics.js','engine.js'])runInContext(read(f),context,{filename:f});
 for(const match of read('index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())runInContext(match[1],context,{filename:'index.html'});
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 return {context,get,storage,errors,run:source=>runInContext(source,context)};
}
