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
