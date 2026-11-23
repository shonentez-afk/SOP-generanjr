// Stage36: one portable, checked backup for saved SOP documents (with
// original/rendered photos and annotations) AND independent FRV studies.
// Import never writes over an existing document or study ID. No external
// Excel imports, background sync, or changes to the AI provider.
const STAGE36_BACKUP_SCHEMA='SOP-FRV-LIBRARY-1';
let stage36BackupBusy=false;

async function stage36Hash(value){
  const hash=await docSha256(JSON.stringify(value));
  if(!hash||!/^[a-f0-9]{64}$/.test(hash))
    throw new Error('Проверка SHA-256 недоступна. Откройте файл в актуальном Chrome/Edge.');
  return hash;
}
function stage36Clone(value){return JSON.parse(JSON.stringify(value))}
function stage36Base(pack){
  return {schemaVersion:pack.schemaVersion,exportedAt:pack.exportedAt,
    documents:pack.documents,studies:pack.studies};
}
function stage36SetStatus(message,kind='neutral'){
  const el=$('doc36FullLibraryStatus');if(!el)return;
  el.textContent=message;
  el.className='text-xs '+(kind==='error'?'text-red-700':
    kind==='success'?'text-emerald-700':'text-slate-600');
}
function stage36SetBusy(busy){
  stage36BackupBusy=!!busy;
  for(const id of ['doc36ExportAllBtn','doc36ImportAllBtn']){
    const el=$(id);if(el)el.disabled=!!busy;
  }
}
async function stage36BuildAllBackup(){
  // The research draft is only guaranteed durable after the transaction.
  await frvStudyFlush();
  const docs=(await docDbGetAll()||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const studies=(await frv34StoreAll()||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const documents=[];
  for(const d of docs){
    if(!d?.id||!d.snapshot)throw new Error('Повреждён документ в библиотеке: '+String(d?.id));
    const portable=await docBuildPortableJson(d);
    if(!portable.integrity?.sha256)throw new Error('Нет контрольной суммы фото/СОП '+d.id);
    documents.push(portable);
  }
  for(const s of studies)frv34ValidateStudy(s.payload);
  const base={schemaVersion:STAGE36_BACKUP_SCHEMA,
    exportedAt:new Date().toISOString(),documents,studies};
  return {...base,integrity:{algorithm:'SHA-256',sha256:await stage36Hash(base)}};
}
async function stage36DownloadAll(){
  if(stage36BackupBusy)return;
  stage36SetBusy(true);stage36SetStatus('Собираю сохранённые СОП, фото и исследования ФРВ…');
  try{
    const pack=await stage36BuildAllBackup();
    const content=JSON.stringify(pack);
    const blob=new Blob([content],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;
    a.download='SOP_FRV_library_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    const report='Скачана копия: СОП '+pack.documents.length+
      ', исследований ФРВ '+pack.studies.length+'; с оригиналами фото';
    stage36SetStatus(report,'success');toast(report,'success');
  }catch(e){
    stage36SetStatus('Копия не создана: '+e.message,'error');
    toast('Ошибка резервной копии: '+e.message,'error');
  }finally{stage36SetBusy(false)}
}
async function stage36ValidateBackup(pack){
  if(!pack||pack.schemaVersion!==STAGE36_BACKUP_SCHEMA||
    !Array.isArray(pack.documents)||!Array.isArray(pack.studies)||
    !pack.integrity||pack.integrity.algorithm!=='SHA-256')
    throw new Error('Ожидался архив всей библиотеки Stage36');
  if(pack.documents.length>3000||pack.studies.length>3000)
    throw new Error('Слишком много записей в архиве');
  if(await stage36Hash(stage36Base(pack))!==pack.integrity.sha256)
    throw new Error('Контрольная сумма архива не совпадает: файл повреждён');
  const dIds=new Set(),sIds=new Set();
  for(const d of pack.documents){
    const id=String(d?.document?.id||'');
    if(!id||id.length>160||dIds.has(id)||!Array.isArray(d?.constructor?.steps))
      throw new Error('Повторяющийся или некорректный ID СОП');
    dIds.add(id);
    if(d.schemaVersion!==2||d.integrity?.algorithm!=='SHA-256')
      throw new Error('Неподдерживаемая копия СОП: '+id);
    const inner={schemaVersion:d.schemaVersion,document:d.document,
      constructor:d.constructor,photoAssets:d.photoAssets};
    if(await stage36Hash(inner)!==d.integrity.sha256)
      throw new Error('Повреждена фотография или содержимое СОП: '+id);
    for(const step of d.constructor.steps){
      if(step?.hasPhoto&&!String(d.photoAssets?.[String(step.id)]?.original||'').startsWith('data:image/'))
        throw new Error('Отсутствует оригинал фото шага '+String(step?.id)+' в СОП '+id);
    }
  }
  for(const r of pack.studies){
    const id=String(r?.id||'');
    if(!id||id.length>160||sIds.has(id)||!r.payload||
      String(r.payload.libraryId||'')!==id)
      throw new Error('Повторяющийся или некорректный ID исследования');
    sIds.add(id);
    frv34ValidateStudy(r.payload);
  }
  return true;
}
function stage36SameStudy(a,b){
  return JSON.stringify(a?.payload||null)===JSON.stringify(b?.payload||null) &&
    !!a?.archived===!!b?.archived;
}
function stage36SopNumber(d){
  return String(d?.deptCode||'')+'|'+String(d?.seqNo||'')+'|'+
    String(d?.year||'')+'|'+String(d?.version||'');
}
function stage36FreshId(makeId,reserved){
  let id='';
  for(let i=0;i<12;i++){id=makeId();if(!reserved.has(id)){reserved.add(id);return id}}
  throw new Error('Не удалось выделить уникальный ID для безопасной копии');
}
async function stage36MakePlan(pack){
  await stage36ValidateBackup(pack); // no writes before ALL checks pass
  const localDocs=await docDbGetAll(),localStudies=await frv34StoreAll();
  const docsById=new Map(localDocs.map(x=>[String(x.id),x]));
  const studiesById=new Map(localStudies.map(x=>[String(x.id),x]));
  const docIds=new Set(docsById.keys()),studyIds=new Set(studiesById.keys());
  const studies=[],documents=[],frvIdMap=new Map(),docIdMap=new Map();
  const stats={sopNew:0,sopCopied:0,sopSkipped:0,
    frvNew:0,frvCopied:0,frvSkipped:0,downgraded:0};
  for(const r of pack.studies){
    const id=String(r.id),existing=studiesById.get(id);
    if(existing&&stage36SameStudy(existing,r)){
      stats.frvSkipped++;frvIdMap.set(id,id);continue;
    }
    const digest=await stage36Hash({payload:r.payload,archived:!!r.archived});
    const prior=localStudies.find(s=>s.frv36OriginalId===id&&
      s.frv36SourceDigest===digest);
    if(prior){stats.frvSkipped++;frvIdMap.set(id,prior.id);continue}
    const copy=!!existing;
    const targetId=copy?stage36FreshId(frvStudyNewId,studyIds):id;
    studyIds.add(targetId);frvIdMap.set(id,targetId);
    studies.push({source:r,targetId,copy,digest});
    if(copy)stats.frvCopied++;else stats.frvNew++;
  }
  const pubKeys=new Set(localDocs.filter(d=>d.status==='Опубликован')
    .map(stage36SopNumber));
  for(const p of pack.documents){
    const id=String(p.document.id),existing=docsById.get(id);
    if(existing){
      let same=false;
      try{
        const current=await docBuildPortableJson(existing);
        same=JSON.stringify(current.constructor)===JSON.stringify(p.constructor) &&
          JSON.stringify(current.photoAssets)===JSON.stringify(p.photoAssets) &&
          String(existing.status)===String(p.document.status) &&
          String(existing.number)===String(p.document.number);
      }catch(_){same=false}
      if(same){stats.sopSkipped++;docIdMap.set(id,id);continue}
    }
    const prior=localDocs.find(d=>d.frv36OriginalId===id&&
      d.frv36SourceDigest===p.integrity.sha256);
    if(prior){stats.sopSkipped++;docIdMap.set(id,prior.id);continue}
    const copy=!!existing;
    const targetId=copy?stage36FreshId(docMakeId,docIds):id;
    docIds.add(targetId);docIdMap.set(id,targetId);
    let downgrade=copy;
    const src=p.document;
    if(src.status==='Опубликован'&&pubKeys.has(stage36SopNumber(src)))
      downgrade=true;
    if(src.status==='Опубликован'&&!downgrade)pubKeys.add(stage36SopNumber(src));
    documents.push({source:p,targetId,copy,downgrade});
    if(copy)stats.sopCopied++;else stats.sopNew++;
    if(downgrade)stats.downgraded++;
  }
  return {documents,studies,frvIdMap,docIdMap,stats};
}
function stage36MakeImportedStudy(item){
  const r=stage36Clone(item.source);
  r.id=item.targetId;
  r.payload.libraryId=item.targetId;
  if(item.copy){
    r.payload.restoredFrom=item.source.id;
    r.frv36OriginalId=item.source.id;
    r.frv36SourceDigest=item.digest;
  }
  r.updatedAt=new Date().toISOString();
  delete r._revision;
  return r;
}
function stage36MakeImportedDoc(item,plan){
  const p=item.source,d=p.document,now=Date.now();
  const snapshot=stage36Clone(p.constructor);
  for(const st of snapshot.steps||[]){
    const old=st?.frvSource?.libraryId;
    if(old&&plan.frvIdMap.has(old))st.frvSource.libraryId=plan.frvIdMap.get(old);
  }
  const status=item.downgrade?'Черновик':
    (['Черновик','Опубликован','Архив'].includes(d.status)?d.status:'Черновик');
  if(item.downgrade&&snapshot.meta)snapshot.meta.sopNumber='';
  const sourceVersion=String(d.versionOf||'');
  const doc={id:item.targetId,status,
    number:item.downgrade?'Черновик':String(d.number||'Черновик'),
    seqNo:item.downgrade?null:(d.seqNo||null),
    deptCode:String(d.deptCode||''),
    year:Number(d.year)||new Date().getFullYear(),
    version:item.downgrade?1:(Number(d.version)||1),
    createdAt:item.copy?now:(Number(d.createdAt)||now),
    updatedAt:now,createdBy:String(d.createdBy||''),
    publishedBy:item.downgrade?'':String(d.publishedBy||''),
    versionOf:item.downgrade?null:
      (plan.docIdMap.get(sourceVersion)||sourceVersion||null),
    title:String(snapshot.meta?.operation||'Без названия'),
    snapshot};
  if(item.copy){
    doc.frv36OriginalId=String(d.id);
    doc.frv36SourceDigest=p.integrity.sha256;
  }
  return doc;
}
async function stage36PutDocIfNew(doc){
  const db=await docDbOpen();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(DOC_STORE,'readwrite');
      const store=tx.objectStore(DOC_STORE);
      let rejected=false;
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>{if(!rejected)reject(tx.error||new Error('Ошибка записи СОП'))};
      tx.onabort=()=>{if(!rejected)reject(tx.error||new Error('Запись СОП отменена'))};
      const req=store.get(doc.id);
      req.onerror=()=>{rejected=true;reject(req.error||new Error('Ошибка чтения СОП'))};
      req.onsuccess=()=>{
        if(req.result){
          rejected=true;reject(new Error('В другой вкладке появился СОП с ID '+doc.id));
          try{tx.abort()}catch(_){}
        }else store.add(doc);
      };
    });
  }finally{db.close()}
}
async function stage36DeleteImportedDoc(id){
  const db=await docDbOpen();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DOC_STORE,'readwrite');
      tx.objectStore(DOC_STORE).delete(id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }finally{db.close()}
}
async function stage36CommitPlan(plan){
  const insertedStudies=[],insertedDocs=[],photoKeys=[];
  try{
    for(const item of plan.studies){
      const r=stage36MakeImportedStudy(item);
      await frv34StorePut(r,null); // CAS: do not replace a record created in another tab
      insertedStudies.push(r.id);
    }
    for(const item of plan.documents){
      const d=stage36MakeImportedDoc(item,plan);
      await stage36PutDocIfNew(d);
      insertedDocs.push(d.id);
      await docRestorePortablePhotos(d.id,d.snapshot,item.source.photoAssets);
      for(const st of d.snapshot.steps||[]){
        if(st.hasPhoto)photoKeys.push(photoDocumentRecordKey(d.id,st.id));
      }
    }
    return plan.stats;
  }catch(e){
    const rollbackErrors=[];
    for(const id of insertedDocs.reverse()){
      try{await stage36DeleteImportedDoc(id)}catch(x){rollbackErrors.push('СОП '+id)}
    }
    for(const key of photoKeys.reverse()){
      try{await idbDeletePhoto(key)}catch(_){rollbackErrors.push('фото '+key)}
    }
    for(const id of insertedStudies.reverse()){
      try{await frv34StoreRemove(id)}catch(_){rollbackErrors.push('ФРВ '+id)}
    }
    throw new Error('Восстановление остановлено: '+e.message+
      (rollbackErrors.length?'. Не удалось откатить: '+rollbackErrors.join(', '):
        '. Новые записи отменены; существующие не изменялись.'));
  }
}
async function stage36RestoreAll(file){
  if(!file||stage36BackupBusy)return;
  stage36SetBusy(true);stage36SetStatus('Проверяю архив до внесения изменений…');
  try{
    if(file.size>256*1024*1024)throw new Error('Архив больше 256 МБ. Разделите библиотеку на переносимые копии.');
    const pack=JSON.parse(await file.text());
    const plan=await stage36MakePlan(pack);
    const st=plan.stats;
    const count=st.sopNew+st.sopCopied+st.frvNew+st.frvCopied;
    if(!count){
      stage36SetStatus('Все документы и исследования из архива уже есть; дубликатов не создано.','success');
      toast('Восстанавливать нечего: все записи найдены','info');
      return;
    }
    const message='Проверка SHA-256 пройдена.\nНовых СОП: '+st.sopNew+
      ', конфликтных копий СОП: '+st.sopCopied+
      ', новых ФРВ: '+st.frvNew+', конфликтных копий ФРВ: '+st.frvCopied+
      '.\nСовпадающие записи пропущены: '+(st.sopSkipped+st.frvSkipped)+
      '.\nПубликации, которые конфликтуют по номеру, возвращаются черновиками: '+st.downgraded+
      '.\nНикакие существующие записи не перезаписываются. Восстановить?';
    if(!confirm(message)){stage36SetStatus('Восстановление отменено. Данные не менялись.');return}
    await stage36CommitPlan(plan);
    await renderDocumentManager();
    if(!$('frvStudyLibraryPanel')?.classList.contains('hidden'))
      await frvStudyRefreshLibrary();
    const result='Восстановлено: СОП '+(st.sopNew+st.sopCopied)+
      ', ФРВ '+(st.frvNew+st.frvCopied)+
      '. Пропущено совпадений: '+(st.sopSkipped+st.frvSkipped);
    stage36SetStatus(result,'success');toast(result,'success');
  }catch(e){
    stage36SetStatus('Ошибка восстановления: '+e.message,'error');
    toast('Восстановление не завершено: '+e.message,'error');
  }finally{stage36SetBusy(false)}
}
(function stage36BindFullLibraryBackup(){
  $('doc36ExportAllBtn')?.addEventListener('click',stage36DownloadAll);
  $('doc36ImportAllBtn')?.addEventListener('click',()=>$('doc36ImportAllInput')?.click());
  $('doc36ImportAllInput')?.addEventListener('change',async e=>{
    try{await stage36RestoreAll(e.target.files?.[0])}
    finally{e.target.value=''}
  });
})();
