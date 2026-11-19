function frvStudyStandardMap(d){const map=new Map((d.analysis?.standardCandidates||[]).map(x=>[String(x.observationId),x]));return map}
function frvStudyMakeSok(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),analysisMap=frvStudyStandardMap(d);
  let obs=d.cycles.flatMap(c=>c.observations.filter(o=>o.standardCandidate&&String(o.actionNormalized||o.actionRaw||'').trim()));
  if(!obs.length)return toast('Сначала отметьте подтверждённые кандидаты в стандарт','info');
  if(!d.analysis?.standardCandidates?.length)return toast('Сначала нажмите «Анализировать ФРВ» — СОК строится из результата анализа','info');
  const selected=obs.map(o=>({o,a:analysisMap.get(String(o.id))})).filter(x=>x.a);
  if(!selected.length)return toast('Для отмеченных строк нет результатов анализа. Повторите анализ ФРВ.','info');
  const steps=selected.map((x,i)=>{const o=x.o,a=x.a;return {sourceObservationId:o.id,sourceCycleNo:a.sourceCycleNo??null,action:a.action||o.actionNormalized||o.actionRaw,standardTimeSec:Number.isFinite(Number(a.standardTimeSec))?Number(a.standardTimeSec):frvStudyDuration(o),keyMoment:a.keyMoment||o.keyMoment||'',reason:a.reason||o.reason||'',quality:a.quality||o.qualityKey||'',safety:a.safety||o.safetyKey||'',tool:a.tool||o.tool||'',material:a.material||o.material||''}});
  d.standardCandidate={...(d.standardCandidate||{}),text:steps.map((x,i)=>`Шаг ${i+1}: ${x.action}. Время: ${x.standardTimeSec} сек. ${x.keyMoment?'Ключевой момент: '+x.keyMoment+'. ':''}${x.reason?'Причина: '+x.reason+'. ':''}${x.quality?'Качество: '+x.quality+'. ':''}${x.safety?'Безопасность: '+x.safety+'. ':''}`).join('\n'),sourceObservationIds:steps.map(x=>x.sourceObservationId),approved:false,steps};
  saveDraft();renderFrvStudy();toast(`СОК-кандидат сформирован: ${steps.length} шагов`,'success');
}
function frvStudySendSop(){
  frvStudySyncFields();
  const d=ensureFrvStudy();
  const steps=Array.isArray(d.standardCandidate?.steps)?d.standardCandidate.steps:[];
  if(!steps.length)return toast('Сначала сформируйте СОК-кандидат из подтверждённых строк','info');
  state.steps=[];
  steps.forEach(x=>{const s=createEmptyStep();s.action=x.action||'';s.durationSeconds=Number.isFinite(Number(x.standardTimeSec))?Number(x.standardTimeSec):0;s.keyMoments=x.keyMoment?[x.keyMoment]:[];s.reason=x.reason||'';s.successCriteria=x.quality||'';s.decisionPoints=[];s.commonPitfalls=[];s.visualMarkers=[];s.photoHint='';s.frv={vdc:false,m2:'',m1:'',move:'',comment:''};s.frvSource={studyId:d.studyId||'',observationId:x.sourceObservationId||'',cycleNo:x.sourceCycleNo??null};if(x.safety)s.keyMoments.push(`Безопасность: ${x.safety}`);state.steps.push(s)});
  d.status='Approved';d.standardCandidate={...d.standardCandidate,approved:true};
  stateChanged();document.querySelector('[data-tab="editor"]')?.click();toast(`В СОП передано шагов: ${state.steps.length}. Ключевые моменты и причины перенесены.`,'success');
}
(function bindFrvStudy(){['frvs-studyId','frvs-processId','frvs-operationId','frvs-operator','frvs-observer','frvs-workplace','frvs-takt','frvs-status'].forEach(id=>$(id)?.addEventListener('change',frvStudySyncFields));$('frvs-improvement')?.addEventListener('input',saveDraftDebounced);$('frvs-standard')?.addEventListener('input',saveDraftDebounced);$('frvStudyAddCycleBtn')?.addEventListener('click',()=>{const d=ensureFrvStudy();d.cycles.push(frvStudyEmptyCycle(d.cycles.length+1));saveDraft();renderFrvStudy()});$('frvStudyBuildBtn')?.addEventListener('click',frvStudyBuild);$('frvStudyAnalyzeBtn')?.addEventListener('click',frvStudyAnalyze);$('frvStudyValidateBtn')?.addEventListener('click',frvStudyValidate);$('frvStudyMakeSokBtn')?.addEventListener('click',frvStudyMakeSok);$('frvStudySendSopBtn')?.addEventListener('click',frvStudySendSop)})();

