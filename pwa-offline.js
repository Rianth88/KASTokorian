/* Buku Kas — PWA Offline Queue + Cache (IndexedDB) */
(function(){
  const DEFAULT_API = "https://script.google.com/macros/s/AKfycbz6enk_e9i3899SQ4GXtgtlN-BSDqaA5rcbnGc9fShGYn7zhP1XOwQTGb8yFTSHiesGBQ/exec";
  const API = (typeof window.API_URL === 'string' && window.API_URL) ? window.API_URL : DEFAULT_API;
  const DB_NAME = 'bk_offline_db';
  const DB_VER = 1;
  const STORE_PENDING = 'pending';
  const STORE_CACHE = 'cache';

  function openDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE_PENDING)){
          db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true });
        }
        if(!db.objectStoreNames.contains(STORE_CACHE)){
          db.createObjectStore(STORE_CACHE);
        }
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }
  function withStore(mode, storeName, fn){
    return openDB().then(db => new Promise((resolve, reject)=>{
      const tx = db.transaction(storeName, mode);
      const st = tx.objectStore(storeName);
      const out = fn(st);
      tx.oncomplete = ()=> resolve(out);
      tx.onerror = ()=> reject(tx.error);
    }));
  }
  function addPending(payload){
    payload.__ts = Date.now();
    return withStore('readwrite', STORE_PENDING, st => st.add({ payload, ts: Date.now() }));
  }
  function getAllPending(){
    return withStore('readonly', STORE_PENDING, st => st.getAll())
      .then(items => items.map(rec => ({ id: rec.id, payload: rec.payload, ts: rec.ts })));
  }
  function removePending(id){
    return withStore('readwrite', STORE_PENDING, st => st.delete(id));
  }
  function cacheSetRows(rows){
    return withStore('readwrite', STORE_CACHE, st => st.put(rows, 'rows'));
  }
  function cacheGetRows(){
    return withStore('readonly', STORE_CACHE, st => st.get('rows')).then(v => v || []);
  }

  async function flushQueue(){
    const items = await getAllPending();
    if(!items.length) return { sent: 0 };
    let sent = 0;
    for(const it of items){
      try{
        const res = await fetch(API, { method: 'POST', headers: {'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(it.payload) });
        if(res.ok){
          await removePending(it.id); sent++;
        }else{
          break;
        }
      }catch(e){
        break;
      }
    }
    return { sent };
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    const method = (init && init.method ? init.method : 'GET').toUpperCase();
    const isOurApi = url.startsWith(API);

    if(isOurApi && method === 'GET'){
      try{
        const res = await origFetch(input, init);
        try {
          const clone = res.clone();
          const data = await clone.json();
          if(data && data.data){ cacheSetRows(data.data).catch(()=>{}); }
        }catch(e){}
        return res;
      }catch(e){
        const rows = await cacheGetRows();
        const body = JSON.stringify({ status: "OK", data: rows, offline: true });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if(isOurApi && method === 'POST'){
      if(!navigator.onLine){
        try { addPending(JSON.parse(init && init.body || '{}')); } catch(e){}
        const body = JSON.stringify({ status: "OK", queued: true, offline: true });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      try{
        const res = await origFetch(input, init);
        if(!res.ok) throw new Error('net fail');
        return res;
      }catch(e){
        try { addPending(JSON.parse(init && init.body || '{}')); } catch(_) {}
        const body = JSON.stringify({ status: "OK", queued: true, offline: true });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    return origFetch(input, init);
  };

  window.addEventListener('online', ()=> { flushQueue(); });

  window.flushKasQueue = flushQueue;
  window.__KasOffline = { cacheGetRows, cacheSetRows, getAllPending };

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
})();
