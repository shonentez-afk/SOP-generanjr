function sanitizeIllustrationShape(src){
  if(!src||typeof src!=='object')return null;
  const s=JSON.parse(JSON.stringify(src));
  delete s._box;delete s._handle;delete s._radius;delete s._join;
  const allowed=new Set(['type','x','y','w','h','x1','y1','x2','y2','n','text','maxW','labelX','labelY','iconKind','color','dash','widthScale']);
  Object.keys(s).forEach(k=>{if(!allowed.has(k))delete s[k]});
  s.type=String(s.type||'');
  if(!['rect','arrow','badge','label','callout','icon'].includes(s.type))return null;
  ['x','y','w','h','x1','y1','x2','y2','n','maxW','labelX','labelY','widthScale'].forEach(k=>{if(k in s){const v=Number(s[k]);if(Number.isFinite(v))s[k]=v;else delete s[k]}});
  if('text' in s)s.text=String(s.text||'').slice(0,400);
  if('iconKind' in s)s.iconKind=String(s.iconKind||'');
  s.color=String(s.color||'#e30613');
  s.dash=!!s.dash;
  s.widthScale=Number.isFinite(Number(s.widthScale))?Number(s.widthScale):1;
  return s;
}
function sanitizeIllustrationAnnotations(items){return (Array.isArray(items)?items:[]).map(sanitizeIllustrationShape).filter(Boolean)}
function photoDocumentRecordKey(documentId,stepId){return 'sop-doc-photo:'+String(documentId)+':'+String(stepId)}
async function photoCopyRecordToKey(fromRecord,key){
  if(!fromRecord?.blob)return false;
  const extra={annotations:sanitizeIllustrationAnnotations(fromRecord.annotations||[]),updatedAt:Date.now()};
  if(fromRecord.renderedBlob){extra.renderedBlob=fromRecord.renderedBlob;extra.renderedExt=fromRecord.renderedExt||'jpeg'}
  return !!(await idbPutPhoto(key,fromRecord.blob,fromRecord.ext||photoExtFromBlob(fromRecord.blob),extra));
}
async function photoSaveDocumentCopies(documentId,steps){
  if(!documentId)return true;
  for(const st of steps){
    if(!st.hasPhoto&&!st.imageData)continue;
    const rec=await idbGetPhoto(st.id);
    if(!rec?.blob || !(await photoCopyRecordToKey(rec,photoDocumentRecordKey(documentId,st.id)))){
      toast('Не удалось сохранить отдельную копию фотографии для версии СОП','error');
      return false;
    }
  }
  return true;
}
async function photoCloneDocumentRecords(oldDocumentId,newDocumentId,steps){
  for(const st of steps){
    if(!st.hasPhoto)continue;
    const rec=(await idbGetPhoto(photoDocumentRecordKey(oldDocumentId,st.id))) || (await idbGetPhoto(st.id));
    if(!rec?.blob || !(await photoCopyRecordToKey(rec,photoDocumentRecordKey(newDocumentId,st.id))))return false;
  }
  return true;
}
async function updateStepPhotoFromRecord(step,rec){
  if(!step||!rec)return false;
  const displayBlob=rec.renderedBlob||rec.blob;
  if(!displayBlob)return false;
  step.imageData=await blobToDataUrl(displayBlob);
  step.imageBuffer=await displayBlob.arrayBuffer();
  step.imageExt=rec.renderedExt||rec.ext||photoExtFromBlob(displayBlob);
  step.hasPhoto=true;
  step.photoAnnotations=sanitizeIllustrationAnnotations(rec.annotations||[]);
  step.photoEdited=!!step.photoAnnotations.length;
  return true;
}
async function restoreStepPhotos(steps,documentId=null){
  let restored=0,lost=0;
  for(const s of (Array.isArray(steps)?steps:[])){
    if(!s?.hasPhoto)continue;
    const scoped=documentId?await idbGetPhoto(photoDocumentRecordKey(documentId,s.id)):null;
    let rec=scoped || (await idbGetPhoto(s.id));
    if(!rec)rec=await tryLegacyPhoto(s.id);
    if(scoped && !(await photoCopyRecordToKey(scoped,s.id))){lost++;continue;}
    if(await updateStepPhotoFromRecord(s,rec))restored++;else lost++;
  }
  return {restored,lost};
}
async function handlePhoto(id,file){
  if(!file.type.startsWith('image/'))return toast('Неверный формат файла','error');
  const s=state.steps.find(x=>x.id===id);if(!s)return;
  try{
    const r=await downscaleToJpeg(file);
    s.imageData=r.dataUrl;
    s.imageExt='jpeg';
    s.imageBuffer=await r.blob.arrayBuffer();
    s.hasPhoto=true;
    s.photoEdited=false;
    s.photoAnnotations=[];
    if(!(await idbPutPhoto(id,r.blob,'jpeg',{annotations:[],updatedAt:Date.now()})))throw new Error('IndexedDB недоступен');
    renderSteps();stateChanged();toast('Фото загружено');
  }catch(e){toast('Не удалось обработать фото','error')}
}

// Photo annotation editor imported from portable SOP project, now with non-destructive layered storage.
