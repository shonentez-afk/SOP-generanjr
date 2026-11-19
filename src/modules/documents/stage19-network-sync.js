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
