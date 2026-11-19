// Stage22 A3.1: fail-closed check before applying an asynchronous AI suggestion.
// No network, model, prompt, storage-schema, or document mutation happens here.
const AI_GUARD_EDITOR_FIELDS=[
  'meta-description','meta-operation','meta-branch','meta-date','meta-department',
  'meta-workplace','meta-executor','meta-safety','meta-tools','meta-material',
  'meta-sop-number','meta-approver-post','meta-approver-name'
];
const AI_GUARD_TWI_FIELDS=[
  'twi-trainer','twi-trainee','twi-purpose','twi-known','twi-prep','twi-interest',
  'twi-round1','twi-round2','twi-round3','twi-tryout','twi-explain','twi-check',
  'twi-correct','twi-help','twi-frequency','twi-observe','twi-close'
];
const AI_GUARD_FRV_FIELDS=[
  'frvs-studyId','frvs-processId','frvs-operationId','frvs-operator','frvs-observer',
  'frvs-workplace','frvs-takt','frvs-status','frvs-improvement','frvs-standard'
];
function aiGuardContext(options){
  const o=options||{},dm=state.documentManager||{};
  const ids=[...AI_GUARD_EDITOR_FIELDS,
    ...(o.twi?AI_GUARD_TWI_FIELDS:[]),...(o.frv?AI_GUARD_FRV_FIELDS:[])];
  const dom=typeof document==='undefined'?[]:ids.map(id=>{
    const input=document.getElementById(id);
    return input?input.value:null;
  });
  return {
    document:{currentId:dm.currentId??null,status:dm.status??'Черновик',
      version:dm.version??1,seqNo:dm.seqNo??null,versionOf:dm.versionOf??null},
    meta:state.meta,description:state.description,openQuestions:state.openQuestions,
    safetyIconIds:state.safetyIconIds,
    steps:state.steps.map(s=>{
      // Image buffers are compared by identity below; serializing photos here
      // would duplicate megabytes of base64 on every AI click.
      const {imageData,imageBuffer,_excelPhoto,...fields}=s;
      return fields;
    }),
    frv:o.frv?state.frvStudy:null,
    twi:o.twi?state.twi:null,
    review:o.review?captureSopReviewState():null,
    dom
  };
}
function aiGuardCapture(options={}){
  const o={frv:!!options.frv,twi:!!options.twi,review:!!options.review};
  return {
    options:o,steps:state.steps,stepRefs:state.steps.slice(),
    media:state.steps.map(s=>[s.imageData,s.imageBuffer]),
    frvRef:o.frv?state.frvStudy:null,twiRef:o.twi?state.twi:null,
    reviewRef:o.review?reviewIssues:null,
    signature:JSON.stringify(aiGuardContext(o))
  };
}
function aiGuardMatches(token){
  if(!token||!Array.isArray(state.steps)||state.steps!==token.steps)return false;
  if(state.steps.length!==token.stepRefs.length)return false;
  if(state.steps.some((s,i)=>s!==token.stepRefs[i]
    ||s.imageData!==token.media[i][0]||s.imageBuffer!==token.media[i][1]))return false;
  if(token.options.frv&&state.frvStudy!==token.frvRef)return false;
  if(token.options.twi&&state.twi!==token.twiRef)return false;
  if(token.options.review&&reviewIssues!==token.reviewRef)return false;
  return JSON.stringify(aiGuardContext(token.options))===token.signature;
}
function aiGuardCanApply(token){
  if(aiGuardMatches(token))return true;
  toast('Документ изменился во время запроса ИИ. Устаревший ответ не применён; повторите действие.','info');
  return false;
}
