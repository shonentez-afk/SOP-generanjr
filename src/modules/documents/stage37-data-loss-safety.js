// Stage37: desktop data-loss guards. Runs after all existing SOP/document
// functions are declared and before stage19-bootstrap binds UI actions.
// Accepted Stage36.1 generation, FRV storage, Excel and photo code stay intact.
const stage37InitialDraft=findDraftRaw();
let stage37DraftDecisionPending=!!stage37InitialDraft?.raw;
const stage37PreviousSaveDraft=saveDraft;
saveDraft=function stage37SafeDraftSave(){
  // If a draft recovery decision is still on screen, do not overwrite the
  // previous record with an empty initial state on tab switch or beforeunload.
  if(stage37DraftDecisionPending)return false;
  return stage37PreviousSaveDraft();
};
function stage37DownloadUnreadableDraft(){
  const original=stage37InitialDraft?.raw;
  if(!original)return;
  const url=URL.createObjectURL(new Blob([original],
    {type:'text/plain;charset=utf-8'}));
  try{
    const a=document.createElement('a');
    a.href=url;a.download='SOP_draft_original_text.txt';
    document.body.appendChild(a);a.click();a.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
}
const stage37PreviousInitDraft=initDraft;
initDraft=function stage37SafeDraftInit(){
  stage37PreviousInitDraft();
  const banner=$('draftBanner'),restore=$('draftRestoreBtn'),dismiss=$('draftDismissBtn');
  if(!banner||!restore||!dismiss)return;
  if(!stage37InitialDraft?.raw){
    stage37DraftDecisionPending=false;
    return;
  }
  if(banner.classList.contains('hidden')){
    // Even a malformed prior record is user data. Preserve it until the
    // user explicitly downloads the raw text or chooses to discard it.
    banner.classList.remove('hidden');
    const msg=banner.querySelector('span');
    if(msg)msg.textContent='Найден черновик, который не удаётся прочитать. Скачайте исходный текст перед очисткой.';
    restore.textContent='Скачать исходный текст';
    restore.onclick=stage37DownloadUnreadableDraft;
    dismiss.textContent='Удалить повреждённый черновик';
    dismiss.onclick=()=>{
      if(!confirm('Удалить предыдущий черновик? Это действие нельзя отменить. Сначала скачайте его исходный текст.'))return;
      for(const key of [DRAFT_KEY,...LEGACY_DRAFT_KEYS]){
        try{localStorage.removeItem(key)}catch(e){}
      }
      stage37DraftDecisionPending=false;
      banner.classList.add('hidden');
    };
    return;
  }
  const oldRestore=restore.onclick,oldDismiss=dismiss.onclick;
  restore.onclick=async()=>{
    await oldRestore();
    if(banner.classList.contains('hidden')){
      stage37DraftDecisionPending=false;
      saveDraft(); // migrate legacy draft only after successful recovery
    }
  };
  dismiss.onclick=async()=>{
    if(!confirm('Начать новый пустой СОП и отказаться от найденного черновика? Чтобы сохранить старые данные, нажмите «Восстановить».'))return;
    await oldDismiss();
    if(banner.classList.contains('hidden'))stage37DraftDecisionPending=false;
  };
};
function stage37SopComparable(s){
  const d=s||{};
  // Independent FRV research is stored in its own IndexedDB and must never
  // cause a false SOP warning. All SOP text/steps/TWI/review is still checked.
  return JSON.stringify({
    meta:d.meta||{},description:d.description||'',
    openQuestions:d.openQuestions||[],responsibles:d.responsibles||[],
    agreedList:d.agreedList||[],safetyIconIds:d.safetyIconIds||[],
    frvMeta:d.frvMeta||{},steps:d.steps||[],
    checklist:d.checklist||[],reviewState:d.reviewState||null,
    twi:d.twi||{},stage27:d.stage27||{}
  });
}
function stage37HasUnsavedContents(s){
  const d=s||{};
  if((d.steps||[]).length||String(d.description||'').trim())return true;
  if(twiHasAnyContent(d.twi))return true;
  const meta=d.meta||{};
  if(Object.entries(meta).some(([key,value])=>
    key!=='date'&&String(value??'').trim()))return true;
  if(meta.date&&meta.date!==new Date().toISOString().slice(0,10))return true;
  const frv=d.frvMeta||{};
  if(Object.entries(frv).some(([key,value])=>
    key!=='purpose'&&String(value??'').trim()))return true;
  if((d.stage27?.questions||[]).length||
    (d.stage27?.mentor||[]).length||
    (d.stage27?.suggestions||[]).length)return true;
  return false;
}
async function stage37ConfirmLeaveSop(){
  if(stage37DraftDecisionPending){
    toast('Сначала решите, восстановить ли найденный черновик. До этого он защищён от перезаписи.','warning');
    return false;
  }
  const dm=state.documentManager||{};
  if(['Опубликован','Архив'].includes(dm.status))return true;
  let snapshot;
  try{
    snapshot=docSnapshot();
    let dirty=false;
    if(dm.currentId){
      const saved=await docDbGet(dm.currentId);
      dirty=saved?
        stage37SopComparable(snapshot)!==stage37SopComparable(saved.snapshot):
        stage37HasUnsavedContents(snapshot);
    }else dirty=stage37HasUnsavedContents(snapshot);
    if(!dirty)return true;
  }catch(e){
    console.warn('[Stage37] Cannot compare unsaved document',e);
    toast('Не удалось проверить сохранность текущего СОП. Сохраните копию перед переключением.','error');
    return false;
  }
  return confirm(
    'Есть несохранённые изменения текущего СОП / TWI.\n'+
    'Переход к другому документу их заменит.\n\n'+
    'ОК — продолжить без сохранения.\n'+
    'Отмена — вернуться и сохранить текущий СОП в библиотеку.'
  );
}
const stage37OriginalDocOpen=docOpen;
docOpen=async function stage37GuardedDocOpen(id){
  if(!await stage37ConfirmLeaveSop())return;
  return stage37OriginalDocOpen(id);
};
const stage37OriginalDocNew=docNew;
docNew=async function stage37GuardedDocNew(){
  if(stage37DraftDecisionPending){
    toast('Сначала восстановите или отклоните предыдущий черновик.','warning');
    return;
  }
  // The accepted New SOP command already confirms when there are steps or
  // process description; additionally protect meta-only and TWI-only drafts.
  if(!state.steps?.length&&!String(state.description||'').trim()){
    if(!await stage37ConfirmLeaveSop())return;
  }
  return stage37OriginalDocNew();
};
const stage37OriginalDocNewVersion=docNewVersion;
docNewVersion=async function stage37GuardedDocNewVersion(id){
  if(!await stage37ConfirmLeaveSop())return;
  return stage37OriginalDocNewVersion(id);
};
