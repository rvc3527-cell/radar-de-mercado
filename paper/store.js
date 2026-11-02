// Persistence only. No market data, execution or credentials in either adapter.
const clone=x=>x===null?null:JSON.parse(JSON.stringify(x));
function validVersion(current,expected,next) {
  return (current?.version??null)===expected && next.version===(expected===null?0:expected+1);
}
export class MemoryPaperStore {
  constructor(serialized=null) {this.documents=new Map(serialized===null?[]:JSON.parse(serialized));}
  async read(walletId) {return clone(this.documents.get(walletId)??null);}
  async compareAndSwap(walletId,expected,document) {
    if(!validVersion(this.documents.get(walletId),expected,document))return false;
    this.documents.set(walletId,clone(document));return true;
  }
  exportJSON() {return JSON.stringify([...this.documents]);}
}
export class IndexedDBPaperStore {
  constructor({name='radar-paper-trading-v1',factory=globalThis.indexedDB}={}) {this.name=name;this.factory=factory;this.connection=null;}
  async database() {
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      if(!this.factory){reject(new Error('INDEXEDDB_UNAVAILABLE'));return}
      const request=this.factory.open(this.name,1);
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
      request.onsuccess=()=>{if(validVersion(request.result,expected,document)){store.put(clone(document),walletId);changed=true}};
      tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('STORAGE_ABORT'));
    });
  }
  async close() {if(this.connection)(await this.connection).close();this.connection=null;}
}
