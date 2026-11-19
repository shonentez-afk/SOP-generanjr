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
