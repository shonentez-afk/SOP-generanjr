function collectDraft(){
  return{schemaVersion:DRAFT_VERSION,savedAt:Date.now(),meta:state.meta,description:state.description,openQuestions:state.openQuestions||[],totalTimeSeconds:state.totalTimeSeconds,responsibles:state.responsibles,agreedList:state.agreedList,safetyIconIds:state.safetyIconIds,frvMeta:state.frvMeta,steps:state.steps.map(s=>({id:s.id,action:s.action,keyMoments:s.keyMoments,reason:s.reason,durationSeconds:s.durationSeconds,successCriteria:s.successCriteria,decisionPoints:s.decisionPoints,commonPitfalls:s.commonPitfalls,visualMarkers:s.visualMarkers,photoHint:s.photoHint,hasPhoto:!!(s.hasPhoto||s.imageData),imageExt:s.imageExt||'jpeg',photoEdited:!!s.photoEdited,photoAnnotations:sanitizeIllustrationAnnotations(s.photoAnnotations),frv:s.frv})),checklist:state.checklist,deferredIssueKeys:[...deferredIssueKeys],twi:state.twi,frvStudy:state.frvStudy,documentManager:state.documentManager};
}
function saveDraft(){
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify(collectDraft()));}
  catch(e){console.warn('draft save failed',e);toast('Черновик не сохранился в localStorage — возможно, браузер ограничил хранилище','warning')}
}
function saveDraftDebounced(){clearTimeout(_draftTimer);_draftTimer=setTimeout(saveDraft,500)}
function stateChanged(render=true){recalcTotalTime();renderOpenQuestions();if(render){renderSteps();renderFrv();renderResponsibles();renderAgreed();renderIconPicker();renderChecklist();renderTwi()}saveDraftDebounced()}
async function tryLegacyPhoto(stepId){
  for(const name of LEGACY_IDB_NAMES){
    try{
      const rec=await new Promise((res,rej)=>{const req=indexedDB.open(name,1);req.onerror=()=>rej(req.error);req.onsuccess=()=>{const db=req.result;try{const tx=db.transaction(IDB_STORE,'readonly');const q=tx.objectStore(IDB_STORE).get(stepId);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)}catch(e){res(null)}}});
      if(rec?.blob)return rec;
    }catch(e){}
  }
  return null;
}
async function applyDraft(d){
  if(!d)throw new Error('Пустой черновик');
  if(Number(d.schemaVersion)>DRAFT_VERSION)throw new Error('Черновик создан более новой версией конструктора');
  let legacyFields=null;
  if(d.fields){legacyFields=d.fields;}
  if(d.meta){state.meta={...state.meta,...d.meta};}
  else if(legacyFields){
    state.meta={...state.meta,branch:legacyFields['meta-branch']||'',date:legacyFields['meta-date']||'',department:legacyFields['meta-department']||'',workplace:legacyFields['meta-workplace']||'',executor:legacyFields['meta-executor']||'',operation:legacyFields['meta-operation']||'',sopNumber:legacyFields['meta-sop-number']||'',safety:legacyFields['meta-safety']||'',tools:legacyFields['meta-tools']||'',material:legacyFields['meta-material']||'',approverPost:legacyFields['meta-approver-post']||'',approverName:legacyFields['meta-approver-name']||''};
  }
  state.description=d.description||legacyFields?.['meta-description']||'';
  state.openQuestions=Array.isArray(d.openQuestions)?d.openQuestions.map(String).filter(Boolean).slice(0,10):[];
  state.responsibles=Array.isArray(d.responsibles)&&d.responsibles.length?d.responsibles:[''];
  state.agreedList=Array.isArray(d.agreedList)&&d.agreedList.length?d.agreedList:[{post:'',name:''}];
  state.safetyIconIds=Array.isArray(d.safetyIconIds)?d.safetyIconIds.filter(id=>ICON_LIB.some(x=>x.id===id)):[];
  if(d.frvMeta)state.frvMeta={...state.frvMeta,...d.frvMeta};
  else if(legacyFields)Object.keys(state.frvMeta).forEach(k=>{const id='frv-'+k.replace(/^tOp$/,'t-op').replace(/^tVdc$/,'t-vdc').replace(/^tM2$/,'t-m2').replace(/^tM1$/,'t-m1').replace(/^tMove$/,'t-move').replace(/^tArea$/,'t-area').replace(/^tIn$/,'t-in').replace(/^tOut$/,'t-out');if(id in legacyFields)state.frvMeta[k]=legacyFields[id]});
  state.checklist=Array.isArray(d.checklist)?d.checklist:JSON.parse(JSON.stringify(CHECKLIST_DEFAULT));
  state.twi={...state.twi,...(d.twi||{})};if(d.frvStudy)state.frvStudy=d.frvStudy;if(d.documentManager)state.documentManager={...state.documentManager,...d.documentManager};ensureFrvStudy();
  deferredIssueKeys=new Set(Array.isArray(d.deferredIssueKeys)?d.deferredIssueKeys:[]);
  reviewIssues=[];reviewSummary=null;showDeferredReviewIssues=false;
  state.steps=(d.steps||[]).map(normalizeStepShape);
  stepIdCounter=Math.max(stepIdCounter,...state.steps.map(s=>s.id||0),Number(d.stepIdCounter)||0);
  stateToHtml();
  const {restored,lost}=await restoreStepPhotos(state.steps);
  renderSteps();toast(`Черновик восстановлен${restored?` (фото: ${restored})`:''}${lost?`; не восстановлено фото: ${lost}`:''}`,lost?'info':'success');
}
function findDraftRaw(){
  const keys=[DRAFT_KEY,...LEGACY_DRAFT_KEYS];
  for(const key of keys){try{const raw=localStorage.getItem(key);if(raw)return{key,raw}}catch(e){}}
  return null;
}
function initDraft(){
  const found=findDraftRaw();if(!found)return;let d;try{d=JSON.parse(found.raw)}catch(e){return}if(!d?.savedAt)return;
  $('draftBannerTime').textContent=new Date(d.savedAt).toLocaleString('ru-RU');$('draftBanner').classList.remove('hidden');
  $('draftRestoreBtn').onclick=async()=>{try{await applyDraft(d);$('draftBanner').classList.add('hidden');if(found.key!==DRAFT_KEY)saveDraft()}catch(e){toast(e.message,'error')}};
  $('draftDismissBtn').onclick=async()=>{for(const key of [DRAFT_KEY,...LEGACY_DRAFT_KEYS])try{localStorage.removeItem(key)}catch(e){};/* Photo records also belong to saved SOP versions and must not be cleared here. */$('draftBanner').classList.add('hidden')};
}
