// Stage33: research -> independently verified draft SOP, with a recoverable
// backup of the currently open SOP. No automatic FRV->SOP->TWI pipeline.
const STAGE33_SOP_BACKUPS='sop-stage33-frv-transfer-backups-v1';
function frvStudyReadBackups(){
  try{
    const value=JSON.parse(localStorage.getItem(STAGE33_SOP_BACKUPS)||'[]');
    return Array.isArray(value)?value.filter(x=>x&&x.draft):[];
  }catch(e){return []}
}
function frvStudyHasBackup(){return frvStudyReadBackups().length>0}
function frvStudyWriteBackups(items){
  // Safety invariant: failure to persist a backup blocks project replacement.
  localStorage.setItem(STAGE33_SOP_BACKUPS,JSON.stringify(items));
}
function frvStudyMedian(values){
  if(!values.length)return null;
  const x=[...values].sort((a,b)=>a-b),mid=x.length>>1;
  return x.length%2?x[mid]:(x[mid-1]+x[mid])/2;
}
function frvStudyStandardMap(d){
  return new Map((d.analysis?.standardCandidates||[]).map(x=>[String(x.observationId),x]));
}
function frvStudyMakeSok(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),aMap=frvStudyStandardMap(d);
  const groups=new Map();
  for(const cycle of d.cycles)for(const o of cycle.observations||[]){
    if(!o.standardCandidate||!String(o.actionRaw||'').trim())continue;
    const secs=frvStudyMeasuredDuration(o);
    if(secs===null||secs<=0)continue;
    // Sequence index differentiates repeated identical actions within a
    // single cycle; matching indices/text join repeats across measured cycles.
    const name=String(o.actionNormalized||o.actionRaw).trim();
    const key=o.seqNo+'|'+frv34CanonicalKey(o,d);
    if(!groups.has(key))groups.set(key,{action:name,seqNo:o.seqNo,
      observed:[],sourceObservationIds:[],sourceCycleNos:[],sample:o,ai:null});
    const g=groups.get(key);
    g.observed.push(secs);
    g.sourceObservationIds.push(String(o.id));
    g.sourceCycleNos.push(cycle.cycleNo);
    if(!g.ai&&aMap.has(String(o.id)))g.ai=aMap.get(String(o.id));
  }
  if(!groups.size)return toast(
    'Отметьте действия «В СОП» и укажите их фактически измеренную длительность. ИИ не обязателен.','warning');
  const steps=[...groups.values()].map(g=>{
    const a=g.ai||{},o=g.sample;
    const measured=frvStudyMedian(g.observed);
    return {action:String(a.action||o.actionNormalized||o.actionRaw).trim(),
      observedTimeSec:measured,plannedTimeSec:measured,
      measuredSamples:[...g.observed],sourceObservationIds:g.sourceObservationIds,
      sourceObservationId:g.sourceObservationIds[0],
      sourceCycleNos:g.sourceCycleNos,sourceCycleNo:g.sourceCycleNos[0],
      keyMoment:String(o.keyMoment||a.keyMoment||''),
      reason:String(o.reason||a.reason||''),
      quality:String(o.qualityKey||a.quality||''),
      safety:String(o.safetyKey||a.safety||''),
      tool:String(o.tool||a.tool||''),material:String(o.material||a.material||''),
      valueType:o.valueType,distanceM:o.distanceM,
      evidenceId:o.evidenceId,comment:o.comment||''};
  });
  d.standardCandidate={...(d.standardCandidate||{}),
    steps,sourceObservationIds:steps.flatMap(x=>x.sourceObservationIds),
    text:steps.map((x,i)=>(i+1)+'. '+x.action+' ('+x.observedTimeSec+' сек)').join('\n'),
    generatedAt:new Date().toISOString(),approved:false,outdated:false};
  saveDraft();frvStudyQueuePersist();renderFrvStudy();
  $('frvStudyDraftSteps')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  toast('Подготовлено '+steps.length+' шагов СОП. Проверьте действия и проектное время.','success');
}
function frvStudyProposedSteps(d){
  if(!Array.isArray(d.standardCandidate?.steps)||d.standardCandidate.outdated)return null;
  const steps=d.standardCandidate.steps;
  if(!steps.length)return null;
  for(const step of steps){
    if(!String(step.action||'').trim()||step.plannedTimeSec===null||
       step.plannedTimeSec===undefined||step.plannedTimeSec===''||
       !Number.isFinite(Number(step.plannedTimeSec))||Number(step.plannedTimeSec)<=0){
      return null;
    }
  }
  return steps;
}
function frvStudySourceStep(x,d){
  const s=createEmptyStep();
  s.action=String(x.action||'').trim();
  // The current SOP form stores integer seconds. Keep the observed fractions
  // and edited project duration separately for traceability.
  s.durationSeconds=Math.max(1,Math.round(Number(x.plannedTimeSec)));
  s.keyMoments=x.keyMoment?[String(x.keyMoment)]:[''];
  if(x.safety)s.keyMoments.push('Безопасность: '+String(x.safety));
  s.keyMoments=s.keyMoments.slice(0,3);
  s.reason=stage38ReasonText(String(x.reason||''));
  s.successCriteria=String(x.quality||'');
  s.decisionPoints=[];s.commonPitfalls=[];s.visualMarkers=[];s.photoHint='';
  s.frv={vdc:x.valueType==='VA',
    m2:x.valueType==='NVA_Necessary'?s.durationSeconds:'',
    m1:x.valueType==='NVA_Waste'?s.durationSeconds:'',
    move:x.distanceM??'',comment:String(x.comment||''),
    // Derived *project* allocation, not a new measured fact. The source
    // measured seconds stay immutable in s.frvSource.
    autoFullStep:['NVA_Necessary','NVA_Waste'].includes(x.valueType)};
  s.frvSource={studyId:d.studyId||'',libraryId:frvStudyInternalId(d),
    observationId:x.sourceObservationId||'',
    observationIds:[...x.sourceObservationIds],cycleNo:x.sourceCycleNo??null,
    cycleNos:[...x.sourceCycleNos],observedTimeSec:x.observedTimeSec,
    projectTimeSec:Number(x.plannedTimeSec),
    evidenceId:String(x.evidenceId||'')};
  return s;
}
function frvStudyNewSopPreview(d,steps,previous){
  const original=previous.steps.length;
  return '<div class="space-y-2 text-sm">'+
    '<div class="border rounded-lg p-3 bg-blue-50"><b>Будет создан новый проект СОП</b>'+
      '<p>Подтверждённых шагов: '+steps.length+
      '. Предыдущий открытый СОП ('+original+' шагов) сохраняется в локальной резервной копии'+
      ' вместе со ссылками на фотографии и может быть восстановлен кнопкой «Вернуть предыдущий СОП».</p></div>'+
    '<ol class="list-decimal ml-5 space-y-1">'+steps.map(x=>
      '<li>'+escapeHtml(x.action)+' — '+escapeHtml(String(x.plannedTimeSec))+
      ' сек (измерено '+escapeHtml(String(x.observedTimeSec))+' сек)</li>').join('')+
    '</ol><p class="text-xs text-slate-600">Данные исследования и реальные замеры сохраняются. '+
      'Неизвестные нормативы и СИЗ не придумываются. TWI не генерируется автоматически.</p></div>';
}
async function frvStudySendSop(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),steps=frvStudyProposedSteps(d);
  if(!steps)return toast('Сначала подготовьте шаги СОП и проверьте ненулевое проектное время каждого.','warning');
  for(const [index,step] of steps.entries()){
    const checked=stage391ReasonShape(step.reason||'');
    if(!checked.ok){
      toast('Шаг '+(index+1)+': '+checked.message+' Исправьте причины в проекте СОП.','warning');
      return;
    }
  }
  htmlFieldToState();
  const current=collectDraft();
  const fingerprint=JSON.stringify({steps,cycles:d.cycles,current:current.steps,meta:current.meta});
  const choice=await aiReviewChoiceModal({
    id:'frvSafeSopTransferPreview',
    title:'Создать новый проект СОП из анализа ФРВ?',
    intro:'Это отдельный проект: действующий СОП не будет бесследно перезаписан. Перед созданием проверьте замеры и будущие шаги.',
    details:frvStudyNewSopPreview(d,steps,current),
    choices:[
      {action:'cancel',label:'Отмена'},
      {action:'create',label:'Создать новый проект СОП',primary:true}
    ]
  });
  if(choice!=='create')return;
  // The study is preserved independently before any SOP mutation.
  try{await frvStudyFlush()}
  catch(e){
    toast('Передача отменена: замеры не удалось надёжно сохранить. '+e.message,'error');
    return;
  }
  if(JSON.stringify({steps:frvStudyProposedSteps(d),cycles:d.cycles,
      current:collectDraft().steps,meta:collectDraft().meta})!==fingerprint){
    toast('Данные изменились во время предпросмотра. Проверьте проект и повторите.','warning');
    return;
  }
  const previous=frvStudyReadBackups();
  if(previous.length>=8){
    toast('Хранилище резервных копий заполнено. Восстановите прежний проект перед новым переносом.','error');
    return;
  }
  try{
    // Never replace a live document until its serialised copy is safe.
    frvStudyWriteBackups([...previous,{
      savedAt:new Date().toISOString(),
      label:String(current.meta?.operation||'СОП до переноса из ФРВ'),
      draft:current
    }]);
  }catch(e){
    console.error('FRV SOP backup failed',e);
    toast('Создание отменено: предыдущий СОП не удалось сохранить в резервную копию.','error');
    return;
  }
  const generated=steps.map(x=>frvStudySourceStep(x,d));
  state.steps=generated;
  state.meta={branch:'',date:'',department:'',workplace:d.workplace||'',
    executor:d.operator||'',operation:d.operationId||d.processDescription.split('\n')[0].slice(0,120)||'Проект СОП по анализу ФРВ',
    sopNumber:'',safety:'',tools:'',material:'',approverPost:'',approverName:''};
  state.description=d.processDescription||'';
  state.openQuestions=[];state.totalTimeSeconds=0;
  // A new SOP cannot inherit the prior document's targets, AI suggestions or
  // review results. The complete previous state is retained in its backup.
  state.frvMeta={observers:'',quality:'',other:'',
    purpose:'зафиксировать текущее исполнение операции',
    tOp:'',tVdc:'',tM2:'',tM1:'',tMove:'',tArea:'',tIn:'',tOut:''};
  state.stage27=stage27Empty();
  reviewIssues=[];reviewSummary=null;deferredIssueKeys=new Set();
  state.responsibles=[''];state.agreedList=[{post:'',name:''}];state.safetyIconIds=[];
  state.checklist=JSON.parse(JSON.stringify(CHECKLIST_DEFAULT));
  state.twi={enabled:false,trainer:'',trainee:'',
    prepare:{purpose:'',known:'',prep:'',interest:''},
    present:{round1:'',round2:'',round3:''},
    tryOut:{perform:'',explain:'',check:'',correct:''},
    followUp:{help:'',control:'',observe:'',close:''}};
  state.documentManager={currentId:null,status:'Черновик',deptCode:'',
    year:new Date().getFullYear(),version:1,seqNo:null};
  d.status='Approved';d.standardCandidate.approved=true;
  frvStudyQueuePersist();
  stateToHtml();stateChanged();
  stage27ResetTransient();stage27Render();
  document.querySelector('[data-tab="editor"]')?.click();
  toast('Новый проект СОП создан: '+generated.length+
    ' шагов. Предыдущий документ сохранён, возврат доступен из «Анализа ФРВ».','success');
}
async function frvStudyRestoreBackup(){
  const items=frvStudyReadBackups();
  if(!items.length)return toast('Резервных копий СОП нет.','info');
  const last=items[items.length-1];
  const choice=await aiReviewChoiceModal({
    id:'frvRestoreSopPreview',title:'Вернуть предыдущий СОП?',
    intro:'Текущий проект тоже будет сохранён в резервной копии, чтобы можно было вернуться к нему.',
    details:'<p class="text-sm">Возврат: <b>'+escapeHtml(last.label||'Предыдущий СОП')+
      '</b> · '+escapeHtml(last.savedAt||'')+'</p>',
    choices:[{action:'cancel',label:'Отмена'},
      {action:'restore',label:'Вернуть СОП',primary:true}]
  });
  if(choice!=='restore')return;
  htmlFieldToState();
  const current=collectDraft();
  const remaining=items.slice(0,-1);
  remaining.push({savedAt:new Date().toISOString(),
    label:String(current.meta?.operation||'Проект после анализа ФРВ'),draft:current});
  try{frvStudyWriteBackups(remaining)}
  catch(e){toast('Не удалось зарезервировать текущий проект. Восстановление отменено.','error');return}
  try{
    await applyDraft(last.draft);
    stateChanged();
    renderFrvStudy();
    document.querySelector('[data-tab="editor"]')?.click();
    toast('Предыдущий СОП восстановлен.','success');
  }catch(e){console.error('FRV backup restore failed',e);toast('Ошибка восстановления: '+e.message,'error')}
}
(function bindFrvStudy(){
  const fields=['frvs-studyId','frvs-processId','frvs-operationId','frvs-operator',
    'frvs-observer','frvs-workplace','frvs-takt','frvs-status','frvs-processDescription'];
  fields.forEach(id=>{
    $(id)?.addEventListener('input',()=>{
      frvStudySyncFields();
      const d=ensureFrvStudy();
      if(d.analysis&&Object.keys(d.analysis).length)d.analysisNeedsReview=true;
      saveDraftDebounced();frvStudyQueuePersist();
    });
  });
  $('frvs-improvement')?.addEventListener('input',()=>{
    frvStudySyncFields();frvStudyQueuePersist();
  });
  $('frvs-standard')?.addEventListener('input',()=>{
    frvStudySyncFields();frvStudyQueuePersist();
  });
  $('frvStudyAddCycleBtn')?.addEventListener('click',()=>{
    const d=ensureFrvStudy();d.cycles.push(frvStudyEmptyCycle(d.cycles.length+1));
    d.analysisNeedsReview=true;saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  $('frvStudyAddRowBtn')?.addEventListener('click',()=>{
    const d=ensureFrvStudy(),cycle=d.cycles[d.cycles.length-1];
    cycle.observations.push(frvStudyEmptyObservation(cycle.observations.length+1));
    d.analysisNeedsReview=true;saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  $('frvStudyBuildBtn')?.addEventListener('click',frvStudyBuild);
  $('frvStudyAnalyzeBtn')?.addEventListener('click',frvStudyAnalyze);
  $('frvStudyValidateBtn')?.addEventListener('click',frvStudyValidate);
  $('frvStudyMakeSokBtn')?.addEventListener('click',frvStudyMakeSok);
  $('frvStudySendSopBtn')?.addEventListener('click',frvStudySendSop);
  $('frvStudyRestoreBtn')?.addEventListener('click',frvStudyRestoreBackup);
  $('frvStudyDownloadBtn')?.addEventListener('click',frvStudyDownloadJson);
})();
