// ============================================================
// 6. Photos / IndexedDB — binary in IDB, no images in localStorage
// ============================================================
function idbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(IDB_NAME,IDB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE,{keyPath:'stepId'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idbPutPhoto(stepId,blob,ext='jpeg',extra={}){try{const db=await idbOpen();const record={stepId,blob,ext,...(extra||{})};await new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(record);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});return true}catch(e){console.warn('photo store failed',e);return false}}
async function idbGetPhoto(stepId){try{const db=await idbOpen();return await new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readonly');const q=tx.objectStore(IDB_STORE).get(stepId);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)})}catch(e){return null}}
async function idbDeletePhoto(stepId){try{const db=await idbOpen();await new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(stepId);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){}}
async function idbClearAllPhotos(){try{const db=await idbOpen();await new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){}}
function downscaleToJpeg(file,maxDim=900,quality=.72){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{const sc=Math.min(1,maxDim/Math.max(img.width,img.height));const w=Math.max(1,Math.round(img.width*sc)),h=Math.max(1,Math.round(img.height*sc));const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(blob=>{if(!blob)return rej(new Error('JPEG encode failed'));const u=URL.createObjectURL(blob);const rr=new FileReader();rr.onload=()=>{URL.revokeObjectURL(u);res({blob,dataUrl:rr.result})};rr.onerror=rej;rr.readAsDataURL(blob)},'image/jpeg',quality)};img.onerror=rej;img.src=e.target.result};r.onerror=rej;r.readAsDataURL(file)})}
function photoExtFromBlob(blob){const t=String(blob?.type||'').toLowerCase();if(t.includes('png'))return 'png';if(t.includes('webp'))return 'webp';return 'jpeg'}
async function dataUrlToBlob(dataUrl){const resp=await fetch(dataUrl);return await resp.blob()}
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
