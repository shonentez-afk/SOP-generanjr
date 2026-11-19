// ============================================================
// 12. Библиотека СОП — этап 1: локальная библиотека JSON
// ============================================================
function docDbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DOC_DB_NAME,DOC_DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(DOC_STORE)){const st=db.createObjectStore(DOC_STORE,{keyPath:'id'});st.createIndex('status','status');st.createIndex('seqNo','seqNo');st.createIndex('versionOf','versionOf')}else{const st=r.transaction.objectStore(DOC_STORE);if(!st.indexNames.contains('versionOf'))st.createIndex('versionOf','versionOf')}if(!db.objectStoreNames.contains(DOC_META_STORE))db.createObjectStore(DOC_META_STORE,{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function docMetaGet(key){const db=await docDbOpen();return new Promise((resolve,reject)=>{const r=db.transaction(DOC_META_STORE,'readonly').objectStore(DOC_META_STORE).get(key);r.onsuccess=()=>resolve(r.result?.value??null);r.onerror=()=>reject(r.error)})}
async function docMetaPut(key,value){const db=await docDbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_META_STORE,'readwrite');tx.objectStore(DOC_META_STORE).put({key,value});tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error)})}
async function docDbPut(doc){const db=await docDbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,'readwrite');tx.objectStore(DOC_STORE).put(doc);tx.oncomplete=()=>resolve(doc);tx.onerror=()=>reject(tx.error)})}
async function docDbGetAll(){const db=await docDbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,'readonly');const r=tx.objectStore(DOC_STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
async function docDbGet(id){const db=await docDbOpen();return new Promise((resolve,reject)=>{const r=db.transaction(DOC_STORE,'readonly').objectStore(DOC_STORE).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
function docMakeId(){return 'SOP-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function docParseNumber(s){const m=String(s||'').trim().match(/^(\d+)\.(\d+)\.(\d{4})\s+(\d+)$/);return m?{dept:m[1],seq:Number(m[2]),year:Number(m[3]),version:Number(m[4])}:null}
async function docNextSeq(){const docs=await docDbGetAll();return docs.reduce((max,d)=>Math.max(max,Number(d.seqNo)||0),0)+1}
function docSnapshot(){htmlFieldToState();return JSON.parse(JSON.stringify({schemaVersion:DRAFT_VERSION,meta:state.meta,description:state.description,openQuestions:state.openQuestions,totalTimeSeconds:state.totalTimeSeconds,responsibles:state.responsibles,agreedList:state.agreedList,safetyIconIds:state.safetyIconIds,frvMeta:state.frvMeta,steps:state.steps.map(s=>({id:s.id,action:s.action,keyMoments:s.keyMoments,reason:s.reason,durationSeconds:s.durationSeconds,successCriteria:s.successCriteria,decisionPoints:s.decisionPoints,commonPitfalls:s.commonPitfalls,visualMarkers:s.visualMarkers,photoHint:s.photoHint,hasPhoto:!!(s.hasPhoto||s.imageData),imageExt:s.imageExt||'jpeg',photoEdited:!!s.photoEdited,photoAnnotations:sanitizeIllustrationAnnotations(s.photoAnnotations),frv:s.frv,frvSource:s.frvSource||null})),checklist:state.checklist,twi:state.twi,frvStudy:state.frvStudy}))}
function docTitle(doc){return doc.meta?.operation||'Без названия'}
function docFormatNumber(dm){return (dm?.status==='Опубликован'||dm?.status==='Архив')&&dm?.seqNo?`${dm.deptCode}.${dm.seqNo}.${dm.year} ${dm.version}`:'Черновик'}
async function docGetFolderHandle(){try{return await docMetaGet('networkFolderHandle')}catch(e){return null}}
async function docHasFolderAccess(){const h=await docGetFolderHandle();if(!h)return false;try{const p=await h.queryPermission?.({mode:'readwrite'});return p==='granted'}catch(e){return false}}
async function docChooseFolder(){if(!window.showDirectoryPicker)return toast('Прямой выбор папки недоступен в этом режиме браузера. Откройте конструктор через HTTPS/локальный сервер Chrome или Edge.','error');try{const h=await window.showDirectoryPicker({id:'sop-network-folder',mode:'readwrite'});await docMetaPut('networkFolderHandle',h);await docMetaPut('networkFolderName',h.name);await docMetaPut('networkLastFolderChangeAt',Date.now());renderDocumentFolderStatus();renderNetworkSyncInfo();toast(`Папка хранения выбрана: ${h.name}`,'success')}catch(e){if(e.name!=='AbortError')toast('Не удалось выбрать папку: '+e.message,'error')}}
async function docEnsureFolderPermission(){const h=await docGetFolderHandle();if(!h)return null;try{let p=await h.queryPermission?.({mode:'readwrite'});if(p!=='granted'&&h.requestPermission)p=await h.requestPermission({mode:'readwrite'});return p==='granted'?h:null}catch(e){return null}}
async function docWriteNetworkFile(filename,data,mime){const h=await docEnsureFolderPermission();if(!h)return false;const fh=await h.getFileHandle(filename,{create:true});const w=await fh.createWritable();await w.write(data);await w.close();return true}
async function docRemoveNetworkFile(filename){try{const h=await docEnsureFolderPermission();if(!h)return false;await h.removeEntry(filename);return true}catch(e){return false}}
function docSafeFileBase(dm){const n=docFormatNumber(dm);return (n==='Черновик'?`Черновик_${dm.currentId||'new'}`:n).replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()}
async function docSha256(text){try{const data=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){return null}}
async function docEnsureSubdir(name){const h=await docEnsureFolderPermission();if(!h)return null;try{return await h.getDirectoryHandle(name,{create:true})}catch(e){return null}}
async function docBackupNetworkFile(filename,reason='overwrite'){
 try{const h=await docEnsureFolderPermission();if(!h)return false;const src=await h.getFileHandle(filename);const file=await src.getFile();const dir=await h.getDirectoryHandle('.sop-backups',{create:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const safe=filename.replace(/[^\wА-Яа-я0-9.-]+/g,'_');const out=await dir.getFileHandle(`${stamp}__${safe}`,{create:true});const w=await out.createWritable();await w.write(await file.arrayBuffer());await w.close();return true}catch(e){return false}}
async function docAppendJournal(event){
 try{const h=await docEnsureFolderPermission();if(!h)return false;let rows=[];try{const fh=await h.getFileHandle('.sop-sync-log.json');rows=JSON.parse(await (await fh.getFile()).text())||[]}catch(e){};rows.push({...event,documentId:event.documentId||state?.documentManager?.currentId||null,at:Date.now()});if(rows.length>500)rows=rows.slice(-500);const fh=await h.getFileHandle('.sop-sync-log.json',{create:true});const w=await fh.createWritable();await w.write(JSON.stringify(rows,null,2));await w.close();return true}catch(e){console.warn('Журнал библиотеки',e);return false}}
async function docCheckUniquePublished(doc){
 const docs=await docDbGetAll();
 const same=docs.find(d=>d.status==='Опубликован'&&Number(d.seqNo)===Number(doc.seqNo)&&String(d.deptCode)===String(doc.deptCode)&&Number(d.year)===Number(doc.year)&&Number(d.version)===Number(doc.version)&&String(d.id)!==String(doc.id));
 if(same)return {ok:false,source:'local',doc:same};
 try{const remote=await docCollectNetworkDocuments();const rs=remote.find(d=>d.status==='Опубликован'&&Number(d.seqNo)===Number(doc.seqNo)&&String(d.deptCode)===String(doc.deptCode)&&Number(d.year)===Number(doc.year)&&Number(d.version)===Number(doc.version)&&String(d.id)!==String(doc.id));if(rs)return {ok:false,source:'network',doc:rs}}catch(e){}
 return {ok:true};
}
async function docListBackups(){
 const dir=await docEnsureSubdir('.sop-backups'); if(!dir)return [];
 const out=[]; for await(const [name,entry] of dir.entries()){if(entry.kind==='file'&&name.endsWith('.json')){const f=await entry.getFile();out.push({name,size:f.size,modified:f.lastModified})}}
 return out.sort((a,b)=>b.modified-a.modified).slice(0,100);
}
async function docRestoreBackup(backupName){
 if(!confirm('Восстановить выбранную резервную копию? Текущий JSON будет предварительно сохранён в новую резервную копию.'))return;
 try{const h=await docEnsureFolderPermission();if(!h)throw new Error('Нет доступа к папке');const dir=await h.getDirectoryHandle('.sop-backups');const src=await dir.getFileHandle(backupName);const file=await src.getFile();const sep=backupName.indexOf('__');if(sep<0)throw new Error('Неизвестный формат резервной копии');const targetName=backupName.slice(sep+2);await docBackupNetworkFile(targetName,'restore-before');const data=await file.arrayBuffer();const target=await h.getFileHandle(targetName,{create:true});const w=await target.createWritable();await w.write(data);await w.close();await docAppendJournal({action:'restore_backup',file:targetName,backup:backupName});await docSyncFolder({manual:false});await renderBackupList();toast('Резервная копия восстановлена и библиотека синхронизирована','success');}catch(e){toast('Восстановление не выполнено: '+e.message,'error')}
}
async function docReadJournal(){
 try{const h=await docEnsureFolderPermission();if(!h)return [];const fh=await h.getFileHandle('.sop-sync-log.json');const rows=JSON.parse(await (await fh.getFile()).text());return Array.isArray(rows)?rows:[]}catch(e){return []}
}
async function docRunSelfTest(){
  const box=$('docSelfTestResult'); if(!box)return;
  const checks=[]; const ok=(name,detail)=>checks.push({name,ok:true,detail}); const bad=(name,detail)=>checks.push({name,ok:false,detail});
  try{await docDbOpen();ok('Локальная библиотека','локальное хранилище доступно');}catch(e){bad('Локальная библиотека','не удалось открыть локальное хранилище: '+e.message)}
  const dm=state.documentManager||{};
  const statusOk=['Черновик','Опубликован','Архив'].includes(dm.status); statusOk?ok('Статусы','используются только Черновик / Опубликован / Архив'):bad('Статусы',`Неизвестный статус: ${dm.status||'—'}`);
  const numberOk=dm.status==='Черновик'?docFormatNumber(dm)==='Черновик':!!(dm.seqNo&&dm.deptCode&&dm.year&&dm.version&&docFormatNumber(dm)); numberOk?ok('Нумерация','формат проверен'):bad('Нумерация','не хватает данных для номера');
  try{const docs=await docDbGetAll(); const pubs=docs.filter(d=>d.status==='Опубликован'); const keys=new Set(); let dup=0; for(const d of pubs){const k=`${d.deptCode}.${d.seqNo}.${d.year} ${d.version}`;if(keys.has(k))dup++;keys.add(k)} dup?bad('Уникальность публикаций',`найдено дублей: ${dup}`):ok('Уникальность публикаций',`проверено опубликованных: ${pubs.length}`);}catch(e){bad('Уникальность публикаций',e.message)}
  try{const h=await docGetFolderHandle(); if(!h) ok('Сетевая папка','не настроена — это допустимо'); else {const has=await docHasFolderAccess(); has?ok('Сетевая папка','доступ подтверждён'):bad('Сетевая папка','сохранённая папка недоступна');}}catch(e){bad('Сетевая папка',e.message)}
  // Image persistence contract: temporary photo must survive readback and document scoping.
  const qaId='sop-photo-qa-'+Date.now();const qaScoped=photoDocumentRecordKey('QA-DOC',qaId);
  try{
    const blob=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'});
    if(!(await idbPutPhoto(qaId,blob,'png',{annotations:[{type:'badge',x:12,y:13,n:1}]})))throw new Error('запись IndexedDB');
    const rec=await idbGetPhoto(qaId);
    if(!rec?.blob||rec.blob.size!==blob.size||rec.annotations?.[0]?.n!==1)throw new Error('чтение фото и JSON-разметки');
    if(!(await photoCopyRecordToKey(rec,qaScoped)))throw new Error('копирование фото в версию');
    const copy=await idbGetPhoto(qaScoped);
    if(!copy?.blob||copy.annotations?.[0]?.n!==1)throw new Error('чтение версии');
    ok('Хранение фото/разметки','IndexedDB: оригинал, JSON и ключ документа');
  }catch(e){bad('Хранение фото/разметки',String(e.message||e))}
  finally{await idbDeletePhoto(qaId);await idbDeletePhoto(qaScoped)}
  const required=['docSaveDraftBtn','docPublishBtn','docNewBtn','docNewVersionCurrentBtn','docDownloadJsonBtn','docDownloadXlsxBtn','docChooseFolderBtn','docSyncFolderBtn','docTestFolderBtn','docIntegrityBtn','docBackupsBtn','docHistoryBtn']; const missing=required.filter(id=>!$(id)); missing.length?bad('Кнопки Document Manager',`не найдены: ${missing.join(', ')}`):ok('Кнопки Document Manager','все основные кнопки присутствуют');
  try{const schema=frvStudySchema(); schema&&schema.properties?ok('ФРВ','структура данных доступна'):bad('ФРВ','структура данных не найдена');}catch(e){bad('ФРВ',e.message)}
  try{const probe={status:'Опубликован',deptCode:'15',seqNo:144,year:2026,version:2}; docFormatNumber(probe)==='15.144.2026 2'?ok('Формат номера','номер и версия формируются корректно'):bad('Формат номера','ошибка формирования номера');}catch(e){bad('Формат номера',e.message)}
  try{const before=JSON.stringify(state.steps.map(s=>({action:s.action,durationSeconds:s.durationSeconds}))); const exported=frvStudyExport(); const after=JSON.stringify(state.steps.map(s=>({action:s.action,durationSeconds:s.durationSeconds}))); before===after&&exported&&exported.cycles?ok('Экспорт данных','подготовка выгрузки не меняет исходные шаги'):bad('Экспорт данных','экспорт изменил исходные данные');}catch(e){bad('Экспорт данных',e.message)}
  box.classList.remove('hidden'); box.innerHTML=`<div class="font-semibold mb-2">Результат: ${checks.filter(x=>x.ok).length}/${checks.length} проверок пройдено</div>`+checks.map(x=>`<div class="py-1 border-t border-slate-100 ${x.ok?'text-green-700':'text-red-700'}">${x.ok?'✓':'✕'} <b>${escapeHtml(x.name)}</b> — ${escapeHtml(x.detail)}</div>`).join('');
  return checks;
}

async function renderDocumentHistory(){
 const box=$('docHistoryList'); if(!box)return;
 const dm=state.documentManager||{}; const id=dm.currentId; if(!id){box.classList.remove('hidden');box.innerHTML='<div class="text-slate-500">Сначала выберите или сохраните документ.</div>';return;}
 const rows=(await docReadJournal()).filter(x=>String(x.documentId||x.id||x.fileId||'')===String(id)).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,100);
 box.classList.remove('hidden');
 if(!rows.length){box.innerHTML='<div class="text-slate-500">Записей по этому документу пока нет. Новые действия будут фиксироваться автоматически.</div>';return;}
 const fmt=t=>t?new Date(t).toLocaleString('ru-RU'):'—';
 box.innerHTML=rows.map(r=>`<div class="py-1.5 border-b border-slate-100 last:border-0"><b>${escapeHtml(String(r.action||'операция'))}</b> · ${fmt(r.at)}${r.file?` · ${escapeHtml(r.file)}`:''}${r.reason?` · ${escapeHtml(r.reason)}`:''}</div>`).join('');
}
async function renderBackupList(){const box=$('docBackupsList');if(!box)return;try{const rows=await docListBackups();if(!rows.length){box.innerHTML='Резервных копий пока нет.';box.classList.remove('hidden');return}box.innerHTML='<div class="font-semibold mb-2">Последние резервные копии</div>'+rows.slice(0,20).map(x=>`<div class="flex items-center justify-between gap-2 py-1 border-t border-slate-200"><span class="truncate" title="${escapeHtml(x.name)}">${escapeHtml(x.name)}</span><button data-restore-backup="${escapeHtml(x.name)}" class="text-blue-700 font-semibold">Восстановить</button></div>`).join('');box.classList.remove('hidden');box.querySelectorAll('[data-restore-backup]').forEach(b=>b.addEventListener('click',()=>docRestoreBackup(b.getAttribute('data-restore-backup'))));}catch(e){box.innerHTML='Не удалось прочитать резервные копии.';box.classList.remove('hidden')}}
async function docVerifyNetworkIntegrity(){
 const h=await docEnsureFolderPermission();if(!h)return {ok:false,count:0,bad:[]};const bad=[];let count=0;
 async function walk(dir,prefix=''){for await(const [name,entry] of dir.entries()){if(entry.kind==='directory'&&name!=='.sop-backups'){await walk(entry,prefix+name+'/');continue}if(entry.kind!=='file'||!name.toLowerCase().endsWith('.json')||name==='.sop-library-index.json'||name==='.sop-sync-log.json')continue;try{const p=JSON.parse(await (await entry.getFile()).text());if(!p.integrity?.sha256)continue;const basis=JSON.stringify((p.schemaVersion||1)>=2?{schemaVersion:p.schemaVersion,document:p.document,constructor:p.constructor,photoAssets:p.photoAssets}:{schemaVersion:p.schemaVersion||1,document:p.document,constructor:p.constructor});const hash=await docSha256(basis);count++;if(hash!==p.integrity.sha256)bad.push(prefix+name)}catch(e){bad.push(prefix+name)}}}
 await walk(h);const result={ok:bad.length===0,count,bad};const el=$('docIntegrityStatus');if(el)el.innerHTML=bad.length?`<span class="text-red-700 font-semibold">⚠ Нарушена целостность: ${bad.length} JSON</span>`:`<span class="text-green-700">✓ Целостность JSON проверена: ${count} файлов</span>`;return result;
}
async function docWriteJsonToNetwork(doc){
 try{
  const dm={...state.documentManager,status:doc.status,seqNo:doc.seqNo,deptCode:doc.deptCode,year:doc.year,version:doc.version,currentId:doc.id};
  // Skip binary packaging if the user has not configured a folder.
  if(!(await docEnsureFolderPermission()))return false;
  const payload=await docBuildPortableJson(doc);
  const filename=docSafeFileBase(dm)+'.json'; await docBackupNetworkFile(filename,doc.status==='Опубликован'?'publish':'save');
  const ok=await docWriteNetworkFile(filename,JSON.stringify(payload,null,2),'application/json');
  if(ok)await docAppendJournal({action:'write',documentId:doc.id,status:doc.status,number:payloadBase.document.number,file:filename});
  if(ok){await docMetaPut('networkLastWriteAt',Date.now());await docMetaPut('networkLastWriteId',doc.id);await docUpdateNetworkIndex();renderDocumentFolderStatus()}
  return ok
 }catch(e){console.warn('Запись JSON на сетевой диск',e);return false}
}
// Portable document backup format v2: standalone JSON, with image data embedded for transfer between PCs.
function docPortablePhotoKey(docId,stepId){return photoDocumentRecordKey(docId,stepId)}
async function docGatherPortablePhotos(snapshot,documentId,{preferActive=false}={}){
  const assets={};
  for(const st of (snapshot?.steps||[])){
    if(!st.hasPhoto)continue;
    let rec=preferActive?await idbGetPhoto(st.id):null;
    if(!rec?.blob && documentId)rec=await idbGetPhoto(docPortablePhotoKey(documentId,st.id));
    if(!rec?.blob && (!documentId||preferActive||String(state.documentManager?.currentId||'')===String(documentId)))rec=await idbGetPhoto(st.id);
    if(!rec?.blob)throw new Error(`Нет исходной фотографии для шага ${st.id}. Экспорт без изображения отменён.`);
    assets[String(st.id)]={
      original:await blobToDataUrl(rec.blob),
      rendered:rec.renderedBlob?await blobToDataUrl(rec.renderedBlob):null,
      ext:rec.ext||photoExtFromBlob(rec.blob),
      renderedExt:rec.renderedExt||'jpeg',
      annotations:sanitizeIllustrationAnnotations(rec.annotations||[])
    };
  }
  return assets;
}
async function docRestorePortablePhotos(documentId,snapshot,assets){
  const steps=(snapshot?.steps||[]).filter(st=>st.hasPhoto);
  if(steps.length && (!assets||typeof assets!=='object'))throw new Error('Архив не содержит фотографии. Восстановление остановлено, чтобы не потерять изображения.');
  const completed=[];
  try{
    for(const step of steps){
      const asset=assets[String(step.id)];
      if(!asset?.original?.startsWith('data:image/'))throw new Error(`В архиве нет фотографии для шага ${step.id}`);
      const base=await dataUrlToBlob(asset.original);
      if(!base?.size)throw new Error(`Повреждено фото шага ${step.id}`);
      const rendered=asset.rendered?.startsWith('data:image/')?await dataUrlToBlob(asset.rendered):null;
      const extra={annotations:sanitizeIllustrationAnnotations(asset.annotations||[]),updatedAt:Date.now()};
      if(rendered?.size){extra.renderedBlob=rendered;extra.renderedExt=asset.renderedExt||photoExtFromBlob(rendered)}
      const key=docPortablePhotoKey(documentId,step.id);
      if(!(await idbPutPhoto(key,base,asset.ext||photoExtFromBlob(base),extra)))throw new Error(`Не удалось записать фото шага ${step.id}`);
      completed.push(key);
    }
  }catch(e){for(const key of completed)await idbDeletePhoto(key);throw e}
  return completed.length;
}
async function docBuildPortableJson(doc,{preferActive=false}={}){
  const d=doc||{};
  const dm={...state.documentManager,status:d.status||'Черновик',seqNo:d.seqNo,deptCode:d.deptCode,year:d.year,version:d.version,currentId:d.id};
  const payloadBase={schemaVersion:2,
    document:{id:d.id||null,status:d.status||'Черновик',number:d.number||docFormatNumber(dm),seqNo:d.seqNo||null,deptCode:d.deptCode||'',year:d.year||new Date().getFullYear(),version:d.version||1,createdAt:d.createdAt||Date.now(),updatedAt:d.updatedAt||Date.now(),createdBy:d.createdBy||'',publishedBy:d.publishedBy||'',versionOf:d.versionOf||null},
    constructor:d.snapshot,
    photoAssets:await docGatherPortablePhotos(d.snapshot,d.id,{preferActive})};
  const hash=await docSha256(JSON.stringify(payloadBase));
  return {...payloadBase,integrity:{algorithm:'SHA-256',sha256:hash}};
}
async function docImportPortableBackup(file){
  try{
    const raw=await file.text();
    if(raw.length>120*1024*1024)throw new Error('JSON слишком велик для безопасного импорта');
    const pack=JSON.parse(raw);
    if(!pack?.constructor||!Array.isArray(pack.constructor.steps))throw new Error('Файл не содержит документа СОП');
    const d=pack.document||{};
    let docId=String(d.id||docMakeId());
    const existing=await docDbGet(docId);
    if(existing){
      if(!confirm('Документ с таким ID уже есть в библиотеке. Импортировать как новый черновик, не заменяя существующий?'))return;
      docId=docMakeId();
    }
    const status=existing?'Черновик':(['Черновик','Опубликован','Архив'].includes(d.status)?d.status:'Черновик');
    const now=Date.now();
    const snapshot=JSON.parse(JSON.stringify(pack.constructor));
    const doc={id:docId,status,number:status==='Черновик'?'Черновик':String(d.number||'Черновик'),seqNo:status==='Черновик'&&existing?null:d.seqNo||null,deptCode:String(d.deptCode||''),year:Number(d.year)||new Date().getFullYear(),version:existing?1:Number(d.version)||1,createdAt:now,updatedAt:now,createdBy:String(d.createdBy||''),publishedBy:status==='Черновик'?'':String(d.publishedBy||''),versionOf:existing?null:d.versionOf||null,title:snapshot.meta?.operation||'Без названия',snapshot};
    // Restore images first; never replace an existing SOP merely to recover photos.
    const count=await docRestorePortablePhotos(doc.id,snapshot,pack.photoAssets);
    await docDbPut(doc);
    docLoadToState(doc);
    const check=await restoreStepPhotos(state.steps,doc.id);
    if(check.lost)throw new Error('Фото восстановлены частично: '+check.lost);
    renderSteps();saveDraft();await renderDocumentManager();
    document.querySelector('[data-tab="editor"]')?.click();
    toast(`Резервная копия восстановлена: ${snapshot.steps.length} шагов, ${count} фото`,'success');
  }catch(e){console.error('Импорт резервной копии',e);toast('Ошибка импорта JSON: '+e.message,'error')}
}
async function docReadNetworkJson(entry){
 const raw=await (await entry.getFile()).text();
 const p=JSON.parse(raw); const d=p.document, snap=p.constructor;
 if(!d?.id||!snap) throw new Error('JSON не содержит document.id или constructor');
 return {id:String(d.id),status:d.status||'Черновик',seqNo:d.seqNo||null,deptCode:String(d.deptCode||''),year:Number(d.year)||new Date().getFullYear(),version:Number(d.version)||1,number:d.number||'Черновик',title:snap.meta?.operation||'Без названия',createdAt:d.createdAt||Date.now(),updatedAt:d.updatedAt||Date.now(),createdBy:d.createdBy||'',publishedBy:d.publishedBy||'',versionOf:d.versionOf||null,snapshot:snap,_portablePhotoAssets:p.photoAssets||null,_networkFileName:entry.name};
}
async function docUpdateNetworkIndex(){
 const h=await docEnsureFolderPermission(); if(!h)return false;
 try{
  const docs=await docDbGetAll();
  const index={schemaVersion:1,updatedAt:Date.now(),documents:docs.map(d=>({id:d.id,status:d.status,number:d.number||'Черновик',title:d.title||'Без названия',seqNo:d.seqNo||null,deptCode:d.deptCode||'',year:d.year||null,version:d.version||1,versionOf:d.versionOf||null,updatedAt:d.updatedAt||0}))};
  await docWriteNetworkFile('.sop-library-index.json',JSON.stringify(index,null,2),'application/json');
  await docMetaPut('networkLastIndexAt',Date.now()); return true;
 }catch(e){console.warn('Индекс библиотеки',e);return false}
}
async function docCollectNetworkDocuments(){
 const h=await docEnsureFolderPermission(); if(!h)throw new Error('Нет доступа к папке');
 const out=[];
 async function walk(dir,prefix=''){
  for await(const [name,entry] of dir.entries()){
   if(entry.kind==='directory'){if(name==='.sop-backups')continue;await walk(entry,prefix+name+'/');continue}
   if(name==='.sop-library-index.json'||name==='.sop-sync-log.json'||!name.toLowerCase().endsWith('.json'))continue;
   try{const d=await docReadNetworkJson(entry);d._networkPath=prefix+name;out.push(d)}catch(e){console.warn('Пропущен JSON',prefix+name,e)}
  }
 }
 await walk(h); return out;
}
async function docSyncFolder(opts={manual:true}){
 const manual=opts?.manual!==false;
 const h=await docEnsureFolderPermission();
 if(!h)return toast('Нет доступа к папке. Сначала выберите папку и подтвердите доступ.','error');
 let imported=0,updated=0,conflicts=0,unchanged=0,errors=0; const conflictList=[];
 try{
  const remoteDocs=await docCollectNetworkDocuments();
  const localDocs=await docDbGetAll(); const localById=new Map(localDocs.map(d=>[String(d.id),d])); const remoteById=new Map(remoteDocs.map(d=>[String(d.id),d]));
  for(const remote of remoteDocs){
   const existing=localById.get(String(remote.id));
   if(!existing){if(remote._portablePhotoAssets)await docRestorePortablePhotos(remote.id,remote.snapshot,remote._portablePhotoAssets);delete remote._portablePhotoAssets;await docDbPut(remote);imported++;continue}
   const lt=Number(existing.updatedAt||0), rt=Number(remote.updatedAt||0);
   if(rt>lt){if(remote._portablePhotoAssets)await docRestorePortablePhotos(remote.id,remote.snapshot,remote._portablePhotoAssets);delete remote._portablePhotoAssets;await docDbPut(remote);updated++;continue}
   if(lt>rt){await docWriteJsonToNetwork(existing);updated++;continue}
   const localJson=JSON.stringify(existing.snapshot||{}), remoteJson=JSON.stringify(remote.snapshot||{});
   if(localJson!==remoteJson){
    conflicts++; conflictList.push({id:remote.id,number:remote.number||existing.number,title:remote.title||existing.title,localUpdatedAt:lt,remoteUpdatedAt:rt,file:remote._networkPath||remote._networkFileName});
   } else {if(remote._portablePhotoAssets){for(const st of remote.snapshot?.steps||[]){if(st.hasPhoto && !(await idbGetPhoto(photoDocumentRecordKey(remote.id,st.id)))){await docRestorePortablePhotos(remote.id,remote.snapshot,remote._portablePhotoAssets);break}}}unchanged++;}
  }
  // Локальные документы, которых нет в папке, также выгружаются в сетевую библиотеку.
  for(const local of localDocs){
   if(!remoteById.has(String(local.id))){await docWriteJsonToNetwork(local);updated++;}
  }
  await docMetaPut('networkLastSyncAt',Date.now());
  await docMetaPut('networkConflicts',conflictList);
  await docUpdateNetworkIndex();
  renderDocumentManager(); renderDocumentFolderStatus();
  await docVerifyNetworkIntegrity();
  renderNetworkSyncInfo(conflictList);
  if(manual)toast(`Синхронизация: добавлено ${imported}, обновлено ${updated}, конфликтов ${conflicts}`,'success');
  return {imported,updated,conflicts,unchanged,errors,conflictList};
 }catch(e){if(manual)toast('Ошибка синхронизации: '+e.message,'error');throw e}
}
function renderDocumentFolderStatus(){
 const badge=$('docFolderStatus'); if(!badge)return;
 Promise.all([docMetaGet('networkFolderName'),docGetFolderHandle(),docMetaGet('networkLastSyncAt'),docMetaGet('networkLastWriteAt'),docMetaGet('networkLastIndexAt')]).then(([name,h,sync,write,index])=>{
   const pathEl=$('docFolderCurrentPath'), avail=$('docFolderAvailability');
   const fmt=x=>x?new Date(x).toLocaleString('ru-RU'):'—';
   if(!name){badge.textContent='Не настроена'; badge.className='storage-status'; if(pathEl)pathEl.textContent='Папка не выбрана'; if(avail)avail.classList.add('hidden');}
   else {badge.textContent='✓ SOP'; badge.className='storage-status'; if(pathEl)pathEl.textContent=name; if(avail)avail.classList.remove('hidden');}
   const a=$('docLastSyncText'),b=$('docLastWriteText'),c=$('docLastIndexText'); if(a)a.textContent=fmt(sync); if(b)b.textContent=fmt(write); if(c)c.textContent=fmt(index);
 }).catch(()=>{badge.textContent='⚠ Нет доступа'; badge.className='storage-status'; const avail=$('docFolderAvailability'); if(avail)avail.classList.add('hidden');});
}
function renderNetworkSyncInfo(conflicts=[]){
 const el=$('docNetworkSyncInfo'); if(!el)return;
 Promise.all([docMetaGet('networkLastSyncAt'),docMetaGet('networkLastWriteAt'),docMetaGet('networkLastIndexAt')]).then(([sync,write,index])=>{
  const fmt=x=>x?new Date(x).toLocaleString('ru-RU'):'—';
  el.innerHTML=`<div class="metric-card rounded-lg p-2"><b>Последняя синхронизация:</b><br>${fmt(sync)}</div><div class="metric-card rounded-lg p-2"><b>Последняя запись:</b><br>${fmt(write)}</div><div class="metric-card rounded-lg p-2"><b>Индекс библиотеки:</b><br>${fmt(index)}</div>`;
  const box=$('docNetworkConflicts'); if(!box)return;
  if(conflicts.length){box.classList.remove('hidden');box.innerHTML='<div class="font-semibold text-red-800 mb-1">⚠ Обнаружены конфликты</div><div class="text-xs text-red-700 mb-2">Одинаковый ID документа имеет разные данные с одинаковым временем изменения. Автоматически ничего не перезаписываем.</div>'+conflicts.map(c=>`<div class="py-1 border-t border-red-200"><b>${escapeHtml(c.number||'Черновик')}</b> — ${escapeHtml(c.title||'Без названия')}<br><span class="text-[11px]">Локально: ${fmt(c.localUpdatedAt)} · В папке: ${fmt(c.remoteUpdatedAt)}</span></div>`).join('');}
  else {box.classList.add('hidden');box.innerHTML=''}
 }).catch(()=>{});
}
async function docAutoSyncOnStart(){
 try{const h=await docEnsureFolderPermission();if(!h)return;await docSyncFolder({manual:false});toast('Библиотека СОП обновлена из выбранной папки','info')}catch(e){console.warn('Автосинхронизация библиотеки',e)}
}
async function docTestFolder(){const h=await docEnsureFolderPermission();if(!h)return toast('Нет доступа к сохранённой папке. Выберите папку заново.','error');try{const f=await h.getFileHandle('.sop-manager-test',{create:true});const w=await f.createWritable();await w.write('ok');await w.close();await h.removeEntry('.sop-manager-test');await docMetaPut('networkLastTestAt',Date.now());toast('Доступ к папке подтверждён','success');renderDocumentFolderStatus();renderNetworkSyncInfo()}catch(e){toast('Проверка папки не выполнена: '+e.message,'error')}}
async function docSaveCurrent(status='Черновик'){
 const now=Date.now(); const dm=state.documentManager||{};
 if(dm.status==='Опубликован'||dm.status==='Архив') return toast('Опубликованный или архивный документ нельзя изменять. Создайте новую версию.','info');
 if(!dm.currentId)dm.currentId=docMakeId();
 dm.status='Черновик'; dm.year=Number(dm.year)||new Date().getFullYear(); dm.version=Math.max(1,Number(dm.version)||1);
 const snap=docSnapshot();
 const doc={id:dm.currentId,status:'Черновик',seqNo:dm.seqNo||null,deptCode:String(dm.deptCode||''),year:dm.year,version:dm.version,number:'Черновик',title:docTitle(snap),updatedAt:now,createdAt:dm.createdAt||now,createdBy:String(dm.createdBy||''),publishedBy:String(dm.publishedBy||''),versionOf:dm.versionOf||null,snapshot:snap};
 if(!(await photoSaveDocumentCopies(doc.id,state.steps)))return;
 await docDbPut(doc); dm.createdAt=doc.createdAt; state.documentManager=dm; await docWriteJsonToNetwork(doc); saveDraft(); renderDocumentManager(); toast('Черновик сохранён','success'); return doc;
}
async function docPublishCurrent(){
 htmlFieldToState(); const dm=state.documentManager||{};
 const code=String($('docDeptCode')?.value||dm.deptCode||'').trim();
 const year=Number($('docYear')?.value||dm.year||new Date().getFullYear());
 let version=Math.max(1,Number($('docVersion')?.value||dm.version||1));
 if(!/^\d+$/.test(code))return toast('Укажите числовой код подразделения','error');
 if(!Number.isInteger(year)||year<2000||year>2100)return toast('Укажите корректный год','error');
 if(!state.meta.operation.trim())return toast('Укажите название операции','error');
 if(dm.status==='Опубликован')return toast('Эта версия уже опубликована и зафиксирована. Создайте новую версию.','info');
 if(dm.status==='Архив')return toast('Архивный документ нельзя публиковать напрямую. Создайте новую версию.','info');
 if(!dm.seqNo) dm.seqNo=await docNextSeq();
 // Если это новая версия, не допускаем повторную публикацию той же версии.
 const docs=await docDbGetAll();
 const same=docs.find(d=>d.status==='Опубликован'&&Number(d.seqNo)===Number(dm.seqNo)&&String(d.deptCode)===code&&Number(d.year)===year);
 if(same) version=Math.max(version,Number(same.version||1)+1);
 const uniqueCheck=await docCheckUniquePublished({id:dm.currentId||'',seqNo:dm.seqNo,deptCode:code,year,version});
 if(!uniqueCheck.ok){return toast(`Публикация остановлена: номер ${code}.${dm.seqNo}.${year} ${version} уже существует.`, 'error');}
 dm.deptCode=code; dm.year=year; dm.version=version; dm.status='Опубликован'; dm.publishedBy=String($('docPublishedBy')?.value||dm.publishedBy||'').trim();
 state.documentManager=dm; state.meta.sopNumber=`${code}.${dm.seqNo}.${year} ${version}`; setVal('meta-sop-number',state.meta.sopNumber);
 const now=Date.now(), snap=docSnapshot();
 const doc={id:dm.currentId||docMakeId(),status:'Опубликован',seqNo:dm.seqNo,deptCode:code,year,version,number:state.meta.sopNumber,title:docTitle(snap),updatedAt:now,createdAt:dm.createdAt||now,createdBy:String(dm.createdBy||''),publishedBy:String(dm.publishedBy||''),versionOf:dm.versionOf||null,snapshot:snap};
 dm.currentId=doc.id; dm.createdAt=doc.createdAt; if(!(await photoSaveDocumentCopies(doc.id,state.steps)))return; await docDbPut(doc); await docAppendJournal({action:'publish',documentId:doc.id,number:doc.number,status:doc.status,versionOf:doc.versionOf||null}); state.documentManager=dm; const oldDraftFile=(`Черновик_${doc.id}`).replace(/[\/:*?"<>|]+/g,'_')+'.json'; await docWriteJsonToNetwork(doc); await docRemoveNetworkFile(oldDraftFile); saveDraft(); renderDocumentManager(); toast(`СОП опубликован: ${doc.number}`,'success'); return doc;
}
async function docArchiveCurrent(){const dm=state.documentManager||{};if(!dm.currentId)return toast('Сначала сохраните документ в библиотеку','info');if(dm.status!=='Опубликован')return toast('В архив переводятся только опубликованные документы','info');const doc=await docDbGet(dm.currentId);if(!doc)return toast('Документ не найден','error');doc.status='Архив';doc.updatedAt=Date.now();await docDbPut(doc);dm.status='Архив';state.documentManager=dm;await docWriteJsonToNetwork(doc);await docAppendJournal({action:'archive',documentId:doc.id,number:doc.number,status:'Архив'});renderDocumentManager();saveDraft();toast('Документ перемещён в архив','success')}
async function docNewVersion(id){
 const old=await docDbGet(id||state.documentManager?.currentId);
 if(!old||old.status!=='Опубликован')return toast('Новую версию можно создать только из опубликованного СОП','info');
 const docs=await docDbGetAll();
 const versions=docs.filter(d=>Number(d.seqNo)===Number(old.seqNo)&&String(d.deptCode)===String(old.deptCode)&&Number(d.year)===Number(old.year));
 const nextVersion=Math.max(0,...versions.map(d=>Number(d.version)||0))+1;
 const d=JSON.parse(JSON.stringify(old)); d.id=docMakeId(); d.status='Черновик'; d.number='Черновик'; d.version=nextVersion; d.versionOf=old.id; d.createdAt=Date.now(); d.updatedAt=Date.now();
 if(!(await photoCloneDocumentRecords(old.id,d.id,d.snapshot?.steps||[])))return toast('Не удалось скопировать фото в новую версию СОП','error');
 docs.push(d); await docDbPut(d); await docWriteJsonToNetwork(d); await docAppendJournal({action:'new_version',documentId:d.id,versionOf:old.id,version:nextVersion}); docLoadToState(d); await restoreStepPhotos(state.steps,d.id);renderSteps();state.documentManager={...state.documentManager,currentId:d.id,status:'Черновик',seqNo:old.seqNo,deptCode:old.deptCode,year:old.year,version:nextVersion,createdAt:d.createdAt,updatedAt:d.updatedAt,createdBy:old.createdBy||'',publishedBy:'',versionOf:old.id}; state.meta.sopNumber=''; setVal('meta-sop-number',''); setVal('docVersion',nextVersion); saveDraft(); renderDocumentManager(); document.querySelector('[data-tab="editor"]')?.click(); toast(`Создан черновик новой версии. Версия ${nextVersion} будет зафиксирована только при публикации.`,'success'); return d;
}
function docLoadToState(doc){if(!doc?.snapshot)return;const s=doc.snapshot;state.meta={...state.meta,...(s.meta||{})};state.description=s.description||'';state.openQuestions=Array.isArray(s.openQuestions)?s.openQuestions:[];state.responsibles=Array.isArray(s.responsibles)&&s.responsibles.length?s.responsibles:[''];state.agreedList=Array.isArray(s.agreedList)&&s.agreedList.length?s.agreedList:[{post:'',name:''}];state.safetyIconIds=Array.isArray(s.safetyIconIds)?s.safetyIconIds:[];state.frvMeta={...state.frvMeta,...(s.frvMeta||{})};state.steps=(s.steps||[]).map(normalizeStepShape);stepIdCounter=Math.max(stepIdCounter,...state.steps.map(st=>st.id||0));state.checklist=Array.isArray(s.checklist)?s.checklist:state.checklist;state.twi={...state.twi,...(s.twi||{})};state.frvStudy=s.frvStudy||null;state.documentManager={currentId:doc.id,status:doc.status,deptCode:doc.deptCode||'',year:doc.year||new Date().getFullYear(),version:doc.version||1,seqNo:doc.seqNo||null,createdAt:doc.createdAt||Date.now(),updatedAt:doc.updatedAt||Date.now(),createdBy:doc.createdBy||'',publishedBy:doc.publishedBy||'',versionOf:doc.versionOf||null};stateToHtml()}
let _docOpenInProgress=false;
async function docOpen(id){
  if(_docOpenInProgress)return;
  _docOpenInProgress=true;
  try{
    const doc=await docDbGet(id);
    if(!doc)return toast('Документ не найден','error');
    docLoadToState(doc);
    const restoredPhotos=await restoreStepPhotos(state.steps,doc.id);
    renderSteps();
    await renderDocumentManager();
    applyDocumentLock();
    toast(`Открыт: ${doc.number||'Черновик'} — ${doc.title}${restoredPhotos.restored?` · фото: ${restoredPhotos.restored}`:''}${restoredPhotos.lost?` · не восстановлено: ${restoredPhotos.lost}`:''}`,'success');
  }catch(e){console.error('Открытие СОП',e);toast('Не удалось открыть СОП: '+e.message,'error')}
  finally{_docOpenInProgress=false}
}
async function docNew(){
  const readOnly=['Опубликован','Архив'].includes(state.documentManager?.status);
  if(!readOnly&&(state.steps.length||state.description)&&!confirm('Создать новый документ? Сначала сохраните текущий черновик при необходимости.'))return;
  state.documentManager={currentId:null,status:'Черновик',deptCode:'',year:new Date().getFullYear(),version:1,seqNo:null,createdBy:'',publishedBy:'',versionOf:null};
  state.meta=Object.fromEntries(Object.keys(state.meta).map(key=>[key,'']));
  state.description='';state.openQuestions=[];state.steps=[];state.frvStudy=null;
  state.responsibles=[''];state.agreedList=[{post:'',name:''}];state.safetyIconIds=[];
  state.frvMeta={observers:'',quality:'',other:'',purpose:'зафиксировать текущее исполнение операции',tOp:'',tVdc:'',tM2:'',tM1:'',tMove:'',tArea:'',tIn:'',tOut:''};
  state.checklist=JSON.parse(JSON.stringify(CHECKLIST_DEFAULT));
  state.twi={enabled:false,trainer:'',trainee:'',prepare:{purpose:'',known:'',prep:'',interest:''},present:{round1:'',round2:'',round3:''},tryOut:{perform:'',explain:'',check:'',correct:''},followUp:{help:'',control:'',observe:'',close:''}};
  stateToHtml();renderDocumentManager();saveDraft();toast('Создан новый чистый черновик','info');
}
async function docDownloadJson(){
  try{
    const dm=state.documentManager||{},snapshot=docSnapshot();
    const payload=await docBuildPortableJson({id:dm.currentId||null,status:dm.status,number:docFormatNumber(dm),seqNo:dm.seqNo||null,deptCode:dm.deptCode||'',year:dm.year,version:dm.version,snapshot},{preferActive:true});
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${(docFormatNumber(dm)==='Черновик'?'Черновик':docFormatNumber(dm)).replace(/[^\wА-Яа-я0-9.-]+/g,'_')}_с_фотографиями.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Сохранён переносимый JSON с фотографиями и разметкой','success');
  }catch(e){toast('Не удалось создать полную копию: '+e.message,'error')}
}
let _renderDocumentManagerBusy=false;
async function renderDocumentManager(){
 if(_renderDocumentManagerBusy)return;
 _renderDocumentManagerBusy=true;
 try{
 const list=$('docLibraryList'),badge=$('docCountBadge'),info=$('docCurrentInfo');
 if(!list||!badge||!info)return;
 let docs=await docDbGetAll();
 const q=String($('docLibrarySearch')?.value||'').trim().toLowerCase();
 const sf=$('docLibraryStatusFilter')?.value||'all';
 const df=$('docLibraryDeptFilter')?.value||'all';
 const yf=$('docLibraryYearFilter')?.value||'all';
 const sort=$('docLibrarySort')?.value||'updated';
 const deptSel=$('docLibraryDeptFilter'),yearSel=$('docLibraryYearFilter');
 if(deptSel){const cur=deptSel.value;const vals=[...new Set(docs.map(d=>String(d.deptCode||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));deptSel.innerHTML='<option value="all">Все подразделения</option>'+vals.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join('');deptSel.value=vals.includes(cur)?cur:'all'}
 if(yearSel){const cur=yearSel.value;const vals=[...new Set(docs.map(d=>String(d.year||'')).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));yearSel.innerHTML='<option value="all">Все годы</option>'+vals.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join('');yearSel.value=vals.includes(cur)?cur:'all'}
 if(q)docs=docs.filter(d=>[d.title,d.number,d.deptCode,String(d.seqNo||''),String(d.year||'')].some(v=>String(v||'').toLowerCase().includes(q)));
 if(sf!=='all')docs=docs.filter(d=>d.status===sf);
 if(df!=='all')docs=docs.filter(d=>String(d.deptCode||'')===df);
 if(yf!=='all')docs=docs.filter(d=>String(d.year||'')===yf);
 docs.sort((a,b)=>sort==='number'?String(a.number||'Черновик').localeCompare(String(b.number||'Черновик'),'ru',{numeric:true}):sort==='title'?String(a.title||'').localeCompare(String(b.title||''),'ru'):((b.updatedAt||0)-(a.updatedAt||0)));
 badge.textContent=String(docs.length);
 const statusClass={Черновик:'bg-amber-100 text-amber-800',Опубликован:'bg-green-100 text-green-800',Архив:'bg-slate-200 text-slate-700'};
 if(!docs.length){list.innerHTML='<div class="text-sm text-slate-400">По заданным условиям документы не найдены.</div>'}
 else{
   list.innerHTML=docs.map(d=>{
     const versionBtn=d.status==='Опубликован'?'<button data-doc-version="'+escapeHtml(d.id)+'" class="btn-review px-2 py-1 rounded text-xs">＋ Версия</button>':'';
     return '<div class="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-xl"><div class="min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-semibold text-sm truncate">'+escapeHtml(d.title)+'</span><span class="chip '+(statusClass[d.status]||'')+'">'+escapeHtml(d.status)+'</span><span class="text-xs text-slate-500">'+escapeHtml(d.number||'Черновик')+'</span></div><div class="text-xs text-slate-500 mt-1">Подразделение: '+escapeHtml(d.deptCode||'—')+' · Создан: '+new Date(d.createdAt||d.updatedAt).toLocaleDateString('ru-RU')+' · Изменён: '+new Date(d.updatedAt).toLocaleString('ru-RU')+'</div></div><div class="flex gap-2 flex-shrink-0"><button data-doc-open="'+escapeHtml(d.id)+'" class="btn-ghost px-2 py-1 rounded border text-xs">Открыть</button><button data-doc-xlsx="'+escapeHtml(d.id)+'" class="btn-primary px-2 py-1 rounded text-xs">XLSX</button>'+versionBtn+'</div></div>';
   }).join('');
 }
 list.querySelectorAll('[data-doc-open]').forEach(b=>b.addEventListener('click',()=>docOpen(b.dataset.docOpen)));
 list.querySelectorAll('[data-doc-version]').forEach(b=>b.addEventListener('click',()=>docNewVersion(b.dataset.docVersion)));
 list.querySelectorAll('[data-doc-xlsx]').forEach(b=>b.addEventListener('click',async()=>{await docOpen(b.dataset.docXlsx);await generateExcel()}));
 const dm=state.documentManager||{};
 setVal('docDeptCode',dm.deptCode||'');setVal('docYear',dm.year||new Date().getFullYear());setVal('docVersion',dm.version||1);setVal('docCreatedBy',dm.createdBy||'');setVal('docPublishedBy',dm.publishedBy||'');
 info.innerHTML='<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2"><div><b>Название:</b> '+escapeHtml(state.meta.operation||'—')+'</div><div><b>Статус:</b> '+escapeHtml(dm.status||'Черновик')+'</div><div><b>Номер:</b> '+escapeHtml(docFormatNumber(dm))+'</div><div><b>Подразделение:</b> '+escapeHtml(dm.deptCode||'—')+'</div><div><b>Год:</b> '+escapeHtml(String(dm.year||'—'))+'</div><div><b>Версия:</b> '+escapeHtml(String(dm.version||'—'))+'</div><div><b>Создан:</b> '+(dm.createdAt?new Date(dm.createdAt).toLocaleString('ru-RU'):'—')+'</div><div><b>Изменён:</b> '+(dm.updatedAt?new Date(dm.updatedAt).toLocaleString('ru-RU'):'—')+'</div><div><b>Создал:</b> '+escapeHtml(dm.createdBy||'—')+'</div><div><b>Опубликовал:</b> '+escapeHtml(dm.publishedBy||'—')+'</div><div><b>Предыдущая версия:</b> '+escapeHtml(dm.versionOf||'—')+'</div></div>';
 const tree=$('docVersionTree');
 if(tree){tree.innerHTML='';if(dm.currentId){const all=await docDbGetAll();const current=all.find(d=>d.id===dm.currentId);const root=current?.versionOf?all.find(d=>d.id===current.versionOf):current;const seq=root?.seqNo||current?.seqNo;if(seq){const chain=all.filter(d=>Number(d.seqNo)===Number(seq)&&String(d.deptCode)===String(root?.deptCode||current?.deptCode)&&Number(d.year)===Number(root?.year||current?.year)).sort((a,b)=>Number(a.version||0)-Number(b.version||0));tree.innerHTML='<div class="text-xs font-semibold text-slate-600 mb-2">История версий</div><div class="flex flex-wrap gap-2">'+chain.map(d=>'<button data-doc-chain="'+escapeHtml(d.id)+'" class="px-2 py-1 rounded-lg border text-xs '+(d.id===dm.currentId?'bg-blue-50 border-blue-300 text-blue-700':'bg-white border-slate-200 text-slate-600')+'">v'+escapeHtml(String(d.version||'—'))+' · '+escapeHtml(d.status)+' · '+escapeHtml(d.number||'Черновик')+'</button>').join('')+'</div>';tree.querySelectorAll('[data-doc-chain]').forEach(b=>b.addEventListener('click',()=>docOpen(b.dataset.docChain)))}}}
 renderDocumentFolderStatus();
 applyDocumentLock();
 }finally{_renderDocumentManagerBusy=false}
}
async function initDocumentManager(){try{await docDbOpen();renderDocumentManager();renderDocumentFolderStatus();renderNetworkSyncInfo();setTimeout(docAutoSyncOnStart,300)}catch(e){console.warn('Библиотека СОП init',e)}}

