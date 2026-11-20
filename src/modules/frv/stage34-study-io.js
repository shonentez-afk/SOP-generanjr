// Stage33: preserve actual observations in exports. Missing time is NULL,
// never a fabricated 0-second measurement or an invented standard.
function frvStudyValidate(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),errors=[],warnings=[];
  for(const c of d.cycles)for(const o of c.observations||[]){
    const tag='Цикл '+c.cycleNo+', № '+o.seqNo+': ';
    const duration=frvStudyMeasuredDuration(o);
    if(!String(o.actionRaw||'').trim())errors.push(tag+'отсутствует фактическое действие');
    if(duration===null)errors.push(tag+'укажите измеренную длительность');
    else if(duration<=0)errors.push(tag+'длительность должна быть больше 0');
    if(o.valueType==='OTHER')warnings.push(tag+'категория времени не определена');
    if(o.distanceM!==null&&o.distanceM!==undefined&&String(o.distanceM)!==''&&
       (!Number.isFinite(Number(o.distanceM))||Number(o.distanceM)<0))
      errors.push(tag+'некорректное расстояние');
    if(o.standardCandidate&&!String(o.actionNormalized||o.actionRaw||'').trim())
      errors.push(tag+'нельзя включить пустое действие в проект СОП');
  }
  const times=d.cycles.filter(frvStudyCycleComplete).map(frvStudyTotal);
  if(times.length>1){
    const mean=times.reduce((a,b)=>a+b,0)/times.length;
    const cv=mean?Math.sqrt(times.reduce((a,b)=>a+(b-mean)**2,0)/times.length)/mean:0;
    if(cv>.1)warnings.push('Разброс полных циклов высокий: '+(cv*100).toFixed(1)+'%');
  }
  if(d.taktSec&&times.some(t=>t>Number(d.taktSec)))
    warnings.push('Есть цикл дольше указанного такта');
  d.validation={errors,warnings,checkedAt:new Date().toISOString()};
  d.status=errors.length?'Observed':'Validated';
  saveDraft();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
  const c=$('frvStudyValidation');
  if(c)c.innerHTML='<div class="p-3 text-sm rounded-lg border '+
    (errors.length?'border-red-200 bg-red-50':'border-green-200 bg-green-50')+'">'+
    '<b>'+(errors.length?'Исправьте данные перед приёмкой':'Проверка измерений пройдена')+'</b>'+
    '<div class="text-xs mt-1">'+[...errors,...warnings].map(x=>
      '<div>• '+frvStudyEsc(x)+'</div>').join('')+'</div></div>';
  toast(errors.length?'Найдено ошибок: '+errors.length:'Фактические измерения проверены.',
    errors.length?'warning':'success');
  return !errors.length;
}
function frvStudyExport(){
  const d=ensureFrvStudy();
  const complete=d.cycles.filter(frvStudyCycleComplete),times=complete.map(frvStudyTotal);
  const mean=times.length?times.reduce((a,b)=>a+b,0)/times.length:null;
  const sorted=[...times].sort((a,b)=>a-b);
  const median=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:
    (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):null;
  return {
    schemaVersion:'FRV-1.3',
    study:{libraryId:frvStudyInternalId(d),studyId:d.studyId,
      processId:d.processId,operationId:d.operationId,
      processDescription:d.processDescription||'',operator:d.operator,
      observer:d.observer,workplace:d.workplace,taktSec:d.taktSec,
      status:d.status,version:d.version},
    cycles:d.cycles.map(c=>({
      id:c.id,cycleNo:c.cycleNo,phase:c.phase||'unassigned',
      observations:c.observations.map(o=>({...o,durationSec:frvStudyMeasuredDuration(o)})),
      cycleDurationSec:frvStudyCycleComplete(c)?frvStudyTotal(c):null,
      measuredDurationSec:frvStudyTotal(c)
    })),
    analysis:{...(d.analysis||{}),analysisNeedsReview:!!d.analysisNeedsReview,
      statistics:{completeCycles:times.length,meanSec:mean,medianSec:median,
        minSec:times.length?Math.min(...times):null,
        maxSec:times.length?Math.max(...times):null}},
    improvements:d.improvements,standard:d.standardCandidate,
    suggestions:d.suggestedActions,validation:d.validation,
    aiClassifications:d.aiClassifications||[],
    actionAliases:d.actionAliases||{},
    comparisonApproved:!!d.comparisonApproved
  };
}
function frvStudySchema(){
  return {$schema:'https://json-schema.org/draft/2020-12/schema',
    title:'Исследование фотографии рабочего времени',
    type:'object',required:['schemaVersion','study','cycles'],
    properties:{
      schemaVersion:{type:'string'},study:{type:'object'},
      cycles:{type:'array',items:{type:'object',required:['cycleNo','observations'],
        properties:{cycleNo:{type:'integer'},cycleDurationSec:{type:['number','null']},
          observations:{type:'array',items:{type:'object',
            required:['id','seqNo','actionRaw','durationSec'],
            properties:{id:{type:'string'},seqNo:{type:'integer'},
              durationSec:{type:['number','null']},actionRaw:{type:'string'},
              actionNormalized:{type:'string'},activityMode:{enum:FRV_ACTIVITY_MODES},
              valueType:{enum:FRV_VALUE_TYPES},lossCode:{type:'string'},
              causeCode:{type:'string'},keyMoment:{type:'string'},reason:{type:'string'},
              qualityKey:{type:'string'},safetyKey:{type:'string'},tool:{type:'string'},
              material:{type:'string'},distanceM:{type:['number','null']},
              evidenceId:{type:'string'},comment:{type:'string'},
              standardCandidate:{type:'boolean'}}}}}}},
      analysis:{type:'object'},improvements:{type:'array'},
      standard:{type:['object','null']},validation:{type:['object','null']}
    }};
}
function frvStudyDownloadJson(){
  const blob=new Blob([JSON.stringify(frvStudyExport(),null,2)],{
    type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=(ensureFrvStudy().studyId||'frv-study')+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function frvStudySyncFields(){
  const d=ensureFrvStudy();
  const fields={studyId:'frvs-studyId',processId:'frvs-processId',
    operationId:'frvs-operationId',operator:'frvs-operator',observer:'frvs-observer',
    workplace:'frvs-workplace',taktSec:'frvs-takt',status:'frvs-status',
    processDescription:'frvs-processDescription'};
  for(const [k,id] of Object.entries(fields)){
    const el=$(id);
    if(el)d[k]=el.type==='number'?(el.value===''?null:Number(el.value)):el.value;
  }
  const imp=$('frvs-improvement'),std=$('frvs-standard');
  if(imp){
    const prev=d.improvements?.[0]||{id:'IMP1',problem:'',owner:'',
      status:'Open',expectedReductionSec:null,actualReductionSec:null};
    d.improvements=[{...prev,countermeasure:imp.value}];
  }
  if(std&&d.standardCandidate)d.standardCandidate.text=std.value;
  saveDraftDebounced();frvStudyQueuePersist();
}
