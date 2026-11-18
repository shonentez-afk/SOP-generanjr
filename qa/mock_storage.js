// Minimal in-memory IndexedDB/localStorage for offline Chromium smoke ONLY.
// Not equivalent to persistent real browser storage.
(() => {
  const data = new Map();
  const memoryStorage = {
    getItem:k=>data.has(k)?data.get(k):null,
    setItem:(k,v)=>data.set(String(k),String(v)),
    removeItem:k=>data.delete(k),
    clear:()=>data.clear()
  };
  Object.defineProperty(window,'localStorage',{configurable:true,value:memoryStorage});
  window.__mockIDBData=new Map();
  class Store{
    constructor(keyPath){this.keyPath=keyPath;this.data=new Map();this.indexes=new Set();}
    get indexNames(){return {contains:k=>this.indexes.has(k)}}
    createIndex(n,k){this.indexes.add(n);return {name:n,keyPath:k}}
    _req(kind,arg,key){
      const r={onsuccess:null,onerror:null,result:null,error:null},tx=this.tx;
      if(tx)tx.pending++;
      setTimeout(()=>{
        try{
          if(kind==='get')r.result=this.data.get(arg);
          else if(kind==='getAll')r.result=Array.from(this.data.values());
          else if(kind==='put'){const id=key===undefined?arg[this.keyPath]:key;this.data.set(id,arg);r.result=id}
          else if(kind==='delete')this.data.delete(arg);
          else if(kind==='clear')this.data.clear();
          r.onsuccess?.({target:r});
        }catch(e){r.error=e;r.onerror?.({target:r});tx?.onerror?.({target:tx})}
        finally{if(tx){tx.pending--;if(!tx.pending)setTimeout(()=>tx.oncomplete?.({target:tx}),1)}}
      },0);
      return r;
    }
    get(k){return this._req('get',k)}
    getAll(){return this._req('getAll')}
    put(v,k){return this._req('put',v,k)}
    delete(k){return this._req('delete',k)}
    clear(){return this._req('clear')}
  }
  class DB{
    constructor(){this.stores=new Map()}
    get objectStoreNames(){return {contains:k=>this.stores.has(k)}}
    createObjectStore(k,opts={}){const st=new Store(opts.keyPath);this.stores.set(k,st);return st}
    transaction(){
      const tx={pending:0,oncomplete:null,onerror:null,error:null};
      tx.objectStore=k=>{const st=this.stores.get(k);if(!st)throw Error('Missing store '+k);st.tx=tx;return st};
      return tx;
    }
  }
  Object.defineProperty(window,'indexedDB',{configurable:true,value:{
    open(name,version){
      const req={result:null,onupgradeneeded:null,onsuccess:null,onerror:null,transaction:null};
      setTimeout(()=>{
        let db=window.__mockIDBData.get(name),fresh=!db;
        if(!db){db=new DB();window.__mockIDBData.set(name,db)}
        req.result=db;
        if(fresh){req.transaction=db.transaction();req.onupgradeneeded?.({target:req,oldVersion:0,newVersion:version})}
        req.onsuccess?.({target:req});
      },0);return req;
    }
  }});
})();
