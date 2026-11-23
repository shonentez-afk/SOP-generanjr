// Stage34: independent, offline library of measured FRV studies.
// The SOP draft is NOT the single source of truth. A study is saved only after
// IndexedDB's transaction completes; file:// browser storage is not a backup.
const FRV34_DB='SOP_FRV_Research_v1',FRV34_STORE='studies';
const FRV35_ACTIVE_ID_KEY='sop-frv-active-study-id-v1';
let frv35SelectedStudyId='';
try{frv35SelectedStudyId=localStorage.getItem(FRV35_ACTIVE_ID_KEY)||''}
catch(e){console.warn('[FRV] Active study preference unavailable',e)}
function frv35RememberActive(id){
  if(!id)return;
  frv35SelectedStudyId=String(id);
  try{localStorage.setItem(FRV35_ACTIVE_ID_KEY,frv35SelectedStudyId)}
  catch(e){console.warn('[FRV] Active study ID not persisted',e)}
}
function frv35ClearActiveId(){
  frv35SelectedStudyId='';
  try{localStorage.removeItem(FRV35_ACTIVE_ID_KEY)}catch(e){}
}

let frv34Pending=null,frv34Timer=null,frv34SaveSeq=0,frv34Chain=Promise.resolve();
// Disable editable controls while switching studies. Otherwise a fast first
// keystroke can land in the previous study before the awaited IndexedDB save
// and the new state assignment completes.
let frv34SwitchBusy=false;
function frv34SetSwitchBusy(busy){
  frv34SwitchBusy=!!busy;
  const root=$('tab-frvstudy');
  if(!root)return;
  root.setAttribute('aria-busy',busy?'true':'false');
  for(const el of root.querySelectorAll('button,input,select,textarea')){
    if(busy){
      if(el.dataset.frv34PrevDisabled===undefined)
        el.dataset.frv34PrevDisabled=el.disabled?'1':'0';
      el.disabled=true;
    }else if(el.dataset.frv34PrevDisabled!==undefined){
      el.disabled=el.dataset.frv34PrevDisabled==='1';
      delete el.dataset.frv34PrevDisabled;
    }
  }
  if(busy)frvStudySaveIndicator('Открываю исследование…','pending');
}
function frvStudyNewId(){
  return 'frv-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,11);
}
function frv34DbOpen(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB недоступна'));
    const req=indexedDB.open(FRV34_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(FRV34_STORE)){
        const st=db.createObjectStore(FRV34_STORE,{keyPath:'id'});
        st.createIndex('updatedAt','updatedAt');
      }
    };
    req.onerror=()=>reject(req.error||new Error('Ошибка базы ФРВ'));
    req.onsuccess=()=>resolve(req.result);
  });
}
async function frv34StoreOperation(mode,work){
  const db=await frv34DbOpen();
  try{
    return await new Promise((resolve,reject)=>{
      let result;
      const tx=db.transaction(FRV34_STORE,mode);
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||new Error('Не удалось записать ФРВ'));
      tx.onabort=()=>reject(tx.error||new Error('Запись ФРВ отменена'));
      try{
        const r=work(tx.objectStore(FRV34_STORE));
        if(r&&typeof r==='object'&&'onsuccess' in r){
          r.onsuccess=()=>{result=r.result};
          r.onerror=()=>{}; // transaction.onerror carries the failure
        }else result=r;
      }catch(e){try{tx.abort()}catch(_){}reject(e)}
    });
  }finally{db.close()}
}
function frv34StorePut(record){return frv34StoreOperation('readwrite',st=>st.put(record))}
function frv34StoreGet(id){return frv34StoreOperation('readonly',st=>st.get(id))}
function frv34StoreAll(){return frv34StoreOperation('readonly',st=>st.getAll())}
function frv34StoreRemove(id){return frv34StoreOperation('readwrite',st=>st.delete(id))}
function frvStudySaveIndicator(message,kind='neutral'){
  const el=$('frvStudySaveStatus');if(!el)return;
  el.textContent=message;
  el.dataset.status=kind;
  el.className='text-xs px-3 py-2 rounded-lg border '+
    (kind==='saved'?'bg-emerald-50 text-emerald-800 border-emerald-200':
    kind==='error'?'bg-red-50 text-red-700 border-red-200':
    'bg-slate-50 text-slate-700 border-slate-200');
}
function frvStudyInternalId(d=ensureFrvStudy()){
  if(!d.libraryId)d.libraryId=frvStudyNewId();
  return d.libraryId;
}
function frvStudyMakeRecord(d){
  const snapshot=JSON.parse(JSON.stringify(d));
  const id=frvStudyInternalId(d);
  snapshot.libraryId=id;
  return {id,operation:String(d.operationId||d.processDescription||'Новое исследование').trim().slice(0,150),
    workplace:String(d.workplace||''),studyNumber:String(d.studyId||''),
    status:String(d.status||'Draft'),cycleCount:(d.cycles||[]).length,
    updatedAt:new Date().toISOString(),archived:!!d.archived,
    payload:snapshot};
}
function frvStudyQueuePersist(){
  const d=ensureFrvStudy(),record=frvStudyMakeRecord(d);
  frv34Pending={record,seq:++frv34SaveSeq};
  frvStudySaveIndicator('Изменения не сохранены','pending');
  if(frv34Timer)clearTimeout(frv34Timer);
  frv34Timer=setTimeout(()=>{frvStudyCommitPending().catch(e=>
    console.error('[FRV autosave]',e))},550);
}
function frvStudyCommitPending(){
  if(frv34Timer){clearTimeout(frv34Timer);frv34Timer=null}
  const job=frv34Pending;
  if(!job)return frv34Chain;
  frv34Pending=null;
  frvStudySaveIndicator('Сохранение…','pending');
  const next=frv34Chain.then(async()=>{
    await frv34StorePut(job.record);
    // A prior study's completed transaction must not update the current
    // study's indicator or mask later unsaved revisions.
    if(job.seq===frv34SaveSeq&&!frv34Pending){
      // docNew()/docOpen() may replace state.frvStudy while the prior
      // observation is being written. Remember the successfully committed
      // independent study even when the SOP has already switched.
      frv35RememberActive(job.record.id);
      if(state.frvStudy?.libraryId===job.record.id)
        frvStudySaveIndicator('Сохранено локально · '+
          new Date().toLocaleTimeString('ru-RU'),'saved');
    }
  }).catch(e=>{
    if(ensureFrvStudy().libraryId===job.record.id){
      if(!frv34Pending||frv34Pending.seq<job.seq)frv34Pending=job;
      frvStudySaveIndicator('Ошибка сохранения — сохраните копию JSON','error');
    }
    throw e;
  });
  // Keep the queue usable after errors. Errors still propagate to callers.
  frv34Chain=next.catch(()=>{});
  return next;
}
async function frvStudyFlush(){
  if(frv34Timer){clearTimeout(frv34Timer);frv34Timer=null}
  await frvStudyCommitPending();
  await frv34Chain;
  if(frv34Pending)throw new Error('Исследование ФРВ не удалось сохранить');
}
function frv34ValidateStudy(d){
  if(!d||typeof d!=='object'||!Array.isArray(d.cycles)||
     d.cycles.length>1000)throw new Error('Некорректное исследование ФРВ');
  const known=new Set(),allowed=new Set(FRV_VALUE_TYPES);
  let count=0;
  for(const c of d.cycles){
    if(!c||!Array.isArray(c.observations)||c.observations.length>1000)
      throw new Error('Некорректный цикл ФРВ');
    for(const o of c.observations){
      count++;if(count>50000)throw new Error('Слишком много наблюдений');
      if(!o||typeof o.actionRaw!=='string'||!String(o.id||'').trim()||
          known.has(o.id))throw new Error('Повторяющиеся или повреждённые наблюдения');
      known.add(o.id);
      if(o.durationSec!==null&&o.durationSec!==undefined&&o.durationSec!==''&&
         (!Number.isFinite(Number(o.durationSec))||Number(o.durationSec)<0))
         throw new Error('Некорректное измеренное время');
      if(o.valueType&&!allowed.has(o.valueType))
         throw new Error('Неизвестная категория времени');
    }
  }
  return true;
}
function frv34RestoreExport(source){
  if(!source||typeof source!=='object'||!Array.isArray(source.cycles)||
     !source.study||typeof source.study!=='object')throw new Error('Ожидалась копия исследования ФРВ');
  if(!['FRV-1.2','FRV-1.3'].includes(source.schemaVersion))
    throw new Error('Неподдерживаемая версия резервной копии ФРВ');
  const meta=source.study,records=source.cycles;
  const d=frvStudyEmptyData();
  for(const k of ['studyId','processId','operationId','processDescription','operator',
    'observer','workplace','status','version']){
    if(typeof meta[k]==='string')d[k]=meta[k].slice(0,20000);
  }
  d.taktSec=meta.taktSec??null;
  d.cycles=records.map((c,ci)=>({
    id:String(c.id||frvStudyNewId()),cycleNo:ci+1,
    phase:['baseline','improved','unassigned'].includes(c.phase)?c.phase:'unassigned',
    observations:(c.observations||[]).map((o,oi)=>({
      ...frvStudyEmptyObservation(oi+1),...o,id:String(o.id||frvStudyNewId()),
      seqNo:oi+1,durationSec:o.durationSec===null||o.durationSec===''?null:Number(o.durationSec),
      actionRaw:String(o.actionRaw||'').slice(0,20000)
    }))
  }));
  if(!d.cycles.length)d.cycles=[frvStudyEmptyCycle(1)];
  d.analysis=source.analysis||{};d.analysisNeedsReview=!!source.analysis?.analysisNeedsReview;
  d.improvements=Array.isArray(source.improvements)?source.improvements:[];
  d.standardCandidate=source.standard||null;
  d.suggestedActions=Array.isArray(source.suggestions)?source.suggestions:[];
  d.validation=source.validation||null;
  d.actionAliases=source.actionAliases&&typeof source.actionAliases==='object'?
    source.actionAliases:{};
  d.comparisonApproved=!!source.comparisonApproved;
  frv34ValidateStudy(d);
  d.libraryId=frvStudyNewId();d.restoredFrom=String(meta.libraryId||meta.studyId||'');
  return d;
}
async function frvStudySwitchTo(d,{persist=true}={}){
  frv34ValidateStudy(d);
  await frvStudyFlush();
  const previous=state.frvStudy;
  state.frvStudy=d;
  frvStudyInternalId(d);
  try{
    if(persist){
      frvStudyQueuePersist();
      await frvStudyFlush();
    }
    frv35RememberActive(d.libraryId);
    frvStudySaveIndicator('Сохранено локально','saved');
    saveDraft();renderFrvStudy();
  }catch(e){
    // A failed initial write must not replace an existing live study.
    // Its failed queued snapshot must not be retried over the next study.
    if(frv34Pending?.record.id===d.libraryId){
      frv34Pending=null;frv34SaveSeq++;
    }
    state.frvStudy=previous;
    renderFrvStudy();
    frvStudySaveIndicator('Не удалось переключить исследование — предыдущие данные сохранены','error');
    throw e;
  }
}
async function frv35RestoreActiveStudy(){
  if(frv34SwitchBusy)return;
  if(!frv35SelectedStudyId&&!frv34Pending)return;
  if(!frv34Pending&&state.frvStudy?.libraryId===frv35SelectedStudyId)return;
  frv34SetSwitchBusy(true);
  try{
    // Flush a pending study first; its successful commit can establish the
    // very first selected ID after a rapid switch to another SOP.
    await frvStudyFlush();
    const id=frv35SelectedStudyId;
    if(!id||state.frvStudy?.libraryId===id)return;
    const rec=await frv34StoreGet(id);
    if(!rec?.payload){
      frv35ClearActiveId();
      toast('Последнее исследование не найдено. Откройте копию из библиотеки или восстановите JSON.','warning');
      return;
    }
    frv34ValidateStudy(rec.payload);
    await frvStudySwitchTo(rec.payload,{persist:false});
  }catch(e){
    frvStudySaveIndicator('Ошибка открытия исследования: '+e.message,'error');
    toast('Исследование не удалось открыть: '+e.message,'error');
  }finally{
    frv34SetSwitchBusy(false);
  }
}
async function frvStudyCreateNew(){
  if(frv34SwitchBusy)return;
  frv34SetSwitchBusy(true);
  try{
    await frvStudyFlush();
    const current=ensureFrvStudy();
    if((current.cycles||[]).some(c=>(c.observations||[]).some(o=>
      String(o.actionRaw||'').trim()))&&!confirm(
      'Создать отдельное исследование ФРВ? Текущее исследование сохранится в библиотеке.'))
      return;
    const data=frvStudyEmptyData();
    await frvStudySwitchTo(data);
    frvStudyShowLibrary(false);
    toast('Создано новое самостоятельное исследование ФРВ','success');
  }catch(e){toast('Не удалось создать исследование: '+e.message,'error')}
  finally{frv34SetSwitchBusy(false)}
}
async function frvStudyOpenById(id){
  if(frv34SwitchBusy)return;
  frv34SetSwitchBusy(true);
  try{
    await frvStudyFlush();
    const rec=await frv34StoreGet(id);
    if(!rec||!rec.payload)throw new Error('Исследование не найдено');
    const d=rec.payload;frv34ValidateStudy(d);
    await frvStudySwitchTo(d,{persist:false});
    frvStudyShowLibrary(false);
    toast('Исследование открыто','success');
  }catch(e){toast('Не удалось открыть: '+e.message,'error')}
  finally{frv34SetSwitchBusy(false)}
}
async function frvStudyCopyById(id){
  if(frv34SwitchBusy)return;
  frv34SetSwitchBusy(true);
  try{
    await frvStudyFlush();
    const rec=await frv34StoreGet(id);
    if(!rec||!rec.payload)throw new Error('Исследование не найдено');
    const d=JSON.parse(JSON.stringify(rec.payload));
    d.libraryId=frvStudyNewId();
    d.operationId=String(d.operationId||'Исследование')+' (копия)';
    d.archived=false;d.restoredFrom=id;
    await frvStudySwitchTo(d);
    frvStudyShowLibrary(false);
  }catch(e){toast('Не удалось создать копию: '+e.message,'error')}
  finally{frv34SetSwitchBusy(false)}
}
async function frvStudyArchiveById(id){
  if(frv34SwitchBusy)return;
  try{
    await frvStudyFlush();
    const rec=await frv34StoreGet(id);if(!rec)throw new Error('Исследование не найдено');
    if(!confirm(rec.archived?'Вернуть исследование из архива?':
      'Перенести исследование в архив? Оно останется доступным.'))return;
    rec.archived=!rec.archived;
    rec.payload.archived=rec.archived;
    await frv34StorePut(rec);
    if(state.frvStudy?.libraryId===id)state.frvStudy.archived=rec.archived;
    await frvStudyRefreshLibrary();
  }catch(e){toast('Не удалось изменить архив: '+e.message,'error')}
}
function frvStudyShowLibrary(open){
  const box=$('frvStudyLibraryPanel');if(!box)return;
  box.classList.toggle('hidden',!open);
  if(open)frvStudyRefreshLibrary().catch(e=>toast(e.message,'error'));
}
async function frvStudyRefreshLibrary(){
  const box=$('frvStudyLibraryItems');if(!box)return;
  const all=(await frv34StoreAll()||[]).sort((a,b)=>
    String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const search=String($('frvStudyLibrarySearch')?.value||'').toLocaleLowerCase('ru-RU').trim();
  const showArchived=!!$('frvStudyShowArchived')?.checked;
  const visible=all.filter(x=>(showArchived||!x.archived)&&
    (!search||[x.operation,x.workplace,x.studyNumber].some(y=>
      String(y||'').toLocaleLowerCase('ru-RU').includes(search))));
  const counter=$('frvStudyLibraryCount');
  if(counter)counter.textContent='Показано '+visible.length+' из '+all.length+
    ' исследований'+(all.filter(x=>x.archived).length?
      ' · в архиве '+all.filter(x=>x.archived).length:'');
  box.innerHTML=visible.length?visible.map(x=>'<div class="flex items-center justify-between flex-wrap gap-2 border-b py-2">'+
    '<div><b class="text-sm">'+frvStudyEsc(x.operation||'Без названия')+'</b>'+
    (x.id===state.frvStudy?.libraryId?
       '<span class="ml-2 text-xs text-emerald-700">Открыто</span>':'')+
    '<div class="text-xs text-slate-500">'+frvStudyEsc(x.workplace||'')+' · '+
      frvStudyEsc(x.status||'')+' · '+frvStudyEsc(x.updatedAt?.slice(0,16).replace('T',' ')||'')+
      (x.archived?' · архив':'')+'</div></div>'+
    '<div class="flex gap-2"><button data-frv-open="'+frvStudyEsc(x.id)+
      '" class="px-2 py-1 border rounded text-xs">Открыть</button>'+
    '<button data-frv-copy="'+frvStudyEsc(x.id)+
      '" class="px-2 py-1 border rounded text-xs">Копия</button>'+
    '<button data-frv-archive="'+frvStudyEsc(x.id)+
      '" class="px-2 py-1 border rounded text-xs">'+(x.archived?'Разархивировать':'В архив')+
      '</button></div></div>').join(''):
    '<p class="text-sm text-slate-500">'+
      (all.length?'Ничего не найдено. Измените поиск или включите архив.':
        'Пока нет сохранённых исследований.')+'</p>';
  box.querySelectorAll('[data-frv-open]').forEach(b=>b.onclick=()=>frvStudyOpenById(b.dataset.frvOpen));
  box.querySelectorAll('[data-frv-copy]').forEach(b=>b.onclick=()=>frvStudyCopyById(b.dataset.frvCopy));
  box.querySelectorAll('[data-frv-archive]').forEach(b=>b.onclick=()=>frvStudyArchiveById(b.dataset.frvArchive));
}
async function frvStudyRestoreFromFile(file){
  if(!file||frv34SwitchBusy)return;
  frv34SetSwitchBusy(true);
  try{
    if(file.size>8*1024*1024)throw new Error('Резервная копия слишком большая');
    const d=frv34RestoreExport(JSON.parse(await file.text()));
    const count=d.cycles.reduce((sum,c)=>sum+(c.observations||[]).length,0);
    if(!confirm('Восстановить '+count+' наблюдений как НОВОЕ исследование? Текущее не заменяется.'))return;
    await frvStudySwitchTo(d);
    toast('Копия восстановлена отдельным исследованием','success');
  }catch(e){toast('Не удалось восстановить JSON: '+e.message,'error')}
  finally{frv34SetSwitchBusy(false)}
}
(function bindFrv34Library(){
  $('frvStudyNewBtn')?.addEventListener('click',frvStudyCreateNew);
  $('frvStudyOpenBtn')?.addEventListener('click',()=>{
    const el=$('frvStudyLibraryPanel');frvStudyShowLibrary(el?.classList.contains('hidden'));
  });
  $('frvStudyRestoreJsonBtn')?.addEventListener('click',()=>$('frvStudyRestoreJsonInput')?.click());
  $('frvStudyRestoreJsonInput')?.addEventListener('change',async e=>{
    await frvStudyRestoreFromFile(e.target.files?.[0]);e.target.value='';
  });
  $('frvStudyLibrarySearch')?.addEventListener('input',()=>frvStudyRefreshLibrary().catch(e=>
    toast('Ошибка поиска исследований: '+e.message,'error')));
  $('frvStudyShowArchived')?.addEventListener('change',()=>frvStudyRefreshLibrary().catch(e=>
    toast('Ошибка загрузки архива: '+e.message,'error')));
  // The SOP document manager can reset state.frvStudy during New/Open.
  // An independently selected research study must be recovered from its
  // own IndexedDB record when the research tab is entered again.
  document.querySelector('[data-tab="frvstudy"]')?.addEventListener('click',()=>{
    queueMicrotask(()=>{frv35RestoreActiveStudy().catch(e=>
      console.error('[FRV] Active study recovery',e))});
  });
})();
