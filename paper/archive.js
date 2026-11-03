// Full snapshots only: no truncation, capital reset, strategy capability or market I/O.
import {PaperTradingEngine} from './engine.js';
import {MemoryPaperStore} from './store.js';
import {canonical,digest} from './integrity.js';
import {invariant} from './money.js';
export const ARCHIVE_FORMAT='radar-paper-archive-v1',MAX_ARCHIVE_BYTES=32*1024*1024,CHUNK_SIZE=250;
const clone=x=>JSON.parse(JSON.stringify(x));
function bounded(text){invariant(typeof text==='string'&&text.length<=MAX_ARCHIVE_BYTES,'ARCHIVE_SIZE');invariant(new TextEncoder().encode(text).byteLength<=MAX_ARCHIVE_BYTES,'ARCHIVE_SIZE');return text}
export function encodeArchive(archive){return bounded(JSON.stringify(archive,null,2))}
async function verified(journal){
  invariant(journal&&typeof journal.walletId==='string','ARCHIVE_JOURNAL');
  bounded(JSON.stringify(journal));
  const store=new MemoryPaperStore(JSON.stringify([[journal.walletId,journal]]));
  const engine=await PaperTradingEngine.open({walletId:journal.walletId,store});return engine.exportJournal();
}
async function manifest(journal){
  const segments=[];
  for(let offset=0;offset<journal.events.length;offset+=CHUNK_SIZE){const events=journal.events.slice(offset,offset+CHUNK_SIZE);segments.push({index:segments.length,startSeq:offset+1,endSeq:offset+events.length,count:events.length,sha256:await digest(events)})}
  return {schema:journal.schema,walletId:journal.walletId,eventCount:journal.version,journalChecksum:journal.checksum,journalDigest:await digest(journal),chunkSize:CHUNK_SIZE,segments};
}
export async function createArchive(journal,{now=Date.now()}={}){
  invariant(Number.isSafeInteger(now)&&now>0&&now<8640000000000000,'ARCHIVE_TIME');
  const complete=await verified(journal),head={format:ARCHIVE_FORMAT,createdAt:now,manifest:await manifest(complete)};
  const archive={...head,journal:complete,seal:await digest(head)};encodeArchive(archive);return archive;
}
export async function inspectArchive(input){
  let value=input;
  if(typeof input==='string'){try{value=JSON.parse(bounded(input))}catch(error){if(error.code)throw error;invariant(false,'ARCHIVE_JSON')}}
  else bounded(JSON.stringify(input));
  invariant(value&&typeof value==='object','ARCHIVE_FORMAT');
  if(value.format===ARCHIVE_FORMAT){
    invariant(Object.keys(value).sort().join(',')==='createdAt,format,journal,manifest,seal','ARCHIVE_SHAPE');
    invariant(Number.isSafeInteger(value.createdAt)&&value.createdAt>0&&value.createdAt<8640000000000000,'ARCHIVE_TIME');
    const j=await verified(value.journal),expected=await manifest(j);
    invariant(canonical(value.manifest)===canonical(expected),'ARCHIVE_MANIFEST');
    invariant(value.seal===await digest({format:value.format,createdAt:value.createdAt,manifest:expected}),'ARCHIVE_SEAL');
    return {journal:j,format:value.format,createdAt:value.createdAt,legacy:false,digest:expected.journalDigest,seal:value.seal};
  }
  let j;if(value.schema==='radar-paper-v1')j=value;
  else if(['radar-supervised-export-v72','radar-supervised-export-v73'].includes(value.format))j=value.journal;
  else if(value.mode==='real-prospective'&&['radar-supervised-export-v72','radar-supervised-export-v73'].includes(value.data?.format))j=value.data.journal;
  else invariant(false,'ARCHIVE_FORMAT');
  const journal=await verified(j);return {journal,format:value.format??'radar-paper-v1',createdAt:null,legacy:true,digest:await digest(journal),seal:null};
}
export async function restoreArchive(store,inspection,{confirmed=false,walletId=inspection?.journal?.walletId}={}){
  invariant(confirmed===true,'ARCHIVE_CONFIRM');invariant(store&&typeof store.installSnapshot==='function','ARCHIVE_STORE');
  // Re-verify even a previously inspected object; callers cannot bypass validation.
  const incoming=await verified(inspection?.journal);invariant(inspection.digest===await digest(incoming),'ARCHIVE_INSPECTION_CHANGED');invariant(incoming.walletId===walletId,'ARCHIVE_WALLET');
  const current=await store.read(walletId);let expected=null;
  if(current!==null){
    const old=await verified(current);invariant(canonical(old.config)===canonical(incoming.config)&&old.schema===incoming.schema,'ARCHIVE_LINEAGE');
    if(old.version===incoming.version){invariant(await digest(old)===await digest(incoming),'ARCHIVE_FORK');return {status:'unchanged',version:old.version,checksum:old.checksum}}
    invariant(incoming.version>old.version,'ARCHIVE_STALE');
    invariant(await digest(old.events)===await digest(incoming.events.slice(0,old.version)),'ARCHIVE_FORK');
    expected={version:current.version,checksum:current.checksum,serialized:JSON.stringify(current)};
  }
  let committed;try{committed=await store.installSnapshot(walletId,expected,clone(incoming))}catch(_){invariant(false,'ARCHIVE_WRITE_UNCONFIRMED')}
  invariant(committed,'ARCHIVE_CONCURRENT');
  let saved;try{saved=await verified(await store.read(walletId));invariant(await digest(saved)===await digest(incoming),'ARCHIVE_WRITE_UNCONFIRMED')}catch(_){invariant(false,'ARCHIVE_WRITE_UNCONFIRMED')}
  return {status:current===null?'restored':'extended',version:saved.version,checksum:saved.checksum};
}
