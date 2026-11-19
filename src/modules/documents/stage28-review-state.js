// Stage28: persist source-grounded review evidence, incremental baseline and dialogue state.
function sopReviewIssueForStorage(issue){
  if(!issue||typeof issue!=='object'||Array.isArray(issue))return null;
  const str=(v,n=4000)=>String(v??'').slice(0,n);
  const step=Number(issue.stepId);
  const thread=Array.isArray(issue.thread)?issue.thread.slice(-120).filter(m=>m&&typeof m==='object').map(m=>({
    role:['user','mentor','system'].includes(m.role)?m.role:'system',
    text:str(m.text,4000)
  })):[];
  const saved={
    severity:str(issue.severity,60),type:str(issue.type,60),
    stepId:Number.isInteger(step)&&step>0?step:null,
    field:issue.field==null?null:str(issue.field,80),
    description:str(issue.description,1500),why:str(issue.why,1500),
    suggestion:str(issue.suggestion,1500),
    fixValue:reviewNormalizeFixValue(issue.fixValue),
    status:['open','applied','withdrawn','deferred'].includes(issue.status)?issue.status:'open',
    thread,pendingDraft:str(issue.pendingDraft,4000),disputeOpen:!!issue.disputeOpen,
    evidenceKind:['observed','hypothesis','question'].includes(issue.evidenceKind)?
      issue.evidenceKind:'question',
    evidenceSource:str(issue.evidenceSource,150),evidence:str(issue.evidence,350),
    evidenceVerified:!!issue.evidenceVerified,
    evidenceNote:str(issue.evidenceNote,200),
    reviewOrigin:['ai','rule'].includes(issue.reviewOrigin)?issue.reviewOrigin:'rule'
  };
  if(Number.isFinite(Number(issue.deferredAt))&&Number(issue.deferredAt)>0)
    saved.deferredAt=Number(issue.deferredAt);
  return saved;
}
function sopReviewSummaryForStorage(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  return {
    summary:String(value.summary??'').slice(0,2000),
    overall_quality:['excellent','good','needs_improvement','poor'].includes(value.overall_quality)?value.overall_quality:''
  };
}
function captureSopReviewState(){
  return {
    schemaVersion:1,
    issues:reviewIssues.slice(0,250).map(sopReviewIssueForStorage).filter(Boolean),
    summary:sopReviewSummaryForStorage(reviewSummary),
    deferredIssueKeys:[...deferredIssueKeys].filter(k=>typeof k==='string').slice(0,500),
    reviewMeta:stage28NormalizeMeta(stage28ReviewMeta)
  };
}
function restoreSopReviewState(snapshot){
  const source=snapshot&&typeof snapshot==='object'?snapshot:{};
  // Also accept older drafts with only deferredIssueKeys at the root.
  const payload=source.reviewState&&typeof source.reviewState==='object'&&!Array.isArray(source.reviewState)
    ?source.reviewState:source;
  reviewIssues=Array.isArray(payload.issues)?payload.issues.slice(0,250).map(sopReviewIssueForStorage).filter(Boolean):[];
  reviewSummary=sopReviewSummaryForStorage(payload.summary||payload.reviewSummary);
  const keys=Array.isArray(payload.deferredIssueKeys)?payload.deferredIssueKeys:[];
  deferredIssueKeys=new Set(keys.filter(k=>typeof k==='string').slice(0,500));
  showDeferredReviewIssues=false;
  stage28ReviewMeta=stage28NormalizeMeta(payload.reviewMeta);
}
function renderRestoredSopReviewState(){
  const box=$('sopReviewContainer');
  if(!box)return;
  if(reviewIssues.length||reviewSummary){renderReviewResults(reviewSummary||{});return;}
  box.classList.add('hidden');
  const issues=$('sopReviewIssues'),summary=$('sopReviewSummary');
  if(issues)issues.textContent='';
  if(summary)summary.textContent='';
}
