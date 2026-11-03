// Persistence only. No market data, execution or credentials in either adapter.
const clone=x=>x===null?null:JSON.parse(JSON.stringify(x));
function validVersion(current,expected,next) {
  return (current?.version??null)===expected && next.version===(expected===null?0:expected+1);
}
// Restoration is a separate host-only operation; normal command CAS stays strict.
function installable(current,expected,next,walletId){
  if(!next||next.walletId!==walletId||!Number.isSafeInteger(next.version)||next.version<0||!Array.isArray(next.events)||next.events.length!==next.version)return false;
  if(expected===null)return !current;
  return !!current&&current.version===expected.version&&current.checksum===expected.checksum&&JSON.stringify(current)===expected.serialized&&next.version>=current.version;
}
export class MemoryPaperStore {
  constructor(serialized=null) {this.documents=new Map(serialized===null?[]:JSON.parse(serialized));}
  async read(walletId) {return clone(this.documents.get(walletId)??null);}
  async compareAndSwap(walletId,expected,document) {
    if(!validVersion(this.documents.get(walletId),expected,document))return false;
    this.documents.set(walletId,clone(document));return true;
  }
  async installSnapshot(walletId,expected,document){
    if(!installable(this.documents.get(walletId),expected,document,walletId))return false;
    this.documents.set(walletId,clone(document));return true;
  }
  exportJSON() {return JSON.stringify([...this.documents]);}
}
export class IndexedDBPaperStore {
  constructor({name='radar-paper-trading-v1',factory}={}) {this.name=name;this.factory=factory;this.connection=null;}
  async database() {
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      const factory=this.factory??globalThis.indexedDB;
      if(!factory){reject(new Error('INDEXEDDB_UNAVAILABLE'));return}
      const request=factory.open(this.name,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('wallets'))request.result.createObjectStore('wallets')};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db)};
      request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('INDEXEDDB_BLOCKED'));
    });
    return this.connection;
  }
  async read(walletId) {
    const db=await this.database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('wallets','readonly'),request=tx.objectStore('wallets').get(walletId);let value=null;
      request.onsuccess=()=>{value=request.result??null};tx.oncomplete=()=>resolve(clone(value));
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('STORAGE_ABORT'));
    });
  }
  async compareAndSwap(walletId,expected,document) {
    const db=await this.database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('wallets','readwrite'),store=tx.objectStore('wallets'),request=store.get(walletId);let changed=false;
      request.onsuccess=()=>{try{if(validVersion(request.result,expected,document)){store.put(clone(document),walletId);changed=true}}catch(error){reject(error);tx.abort()}};
      tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('STORAGE_ABORT'));
    });
  }
  async installSnapshot(walletId,expected,document){
    const db=await this.database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('wallets','readwrite'),store=tx.objectStore('wallets'),request=store.get(walletId);let changed=false;
      request.onsuccess=()=>{try{if(installable(request.result,expected,document,walletId)){store.put(clone(document),walletId);changed=true}}catch(error){reject(error);tx.abort()}};
      tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('STORAGE_ABORT'));
    });
  }
  async close() {if(this.connection)(await this.connection).close();this.connection=null;}
}
