// Stage23 A3.2: typed, fail-closed contract for AI review corrections.
// Does not change the Yandex proxy, prompts, user documents or stored schema.
const REVIEW_EMPTY_FIX_VALUES=new Set([
  'null','undefined','none','nil','n/a','na','not specified','not provided',
  'нет','нет данных','не указано','не задано','отсутствует',
  '-','—','–'
]);
function reviewNormalizeFixValue(raw){
  if(typeof raw!=='string')return null;
  const value=raw.trim();
  if(!value)return null;
  let sentinel=value;
  // Models sometimes return the literal strings "null", 'null' or \`null\`.
  for(let i=0;i<2;i++){
    const first=sentinel[0],last=sentinel[sentinel.length-1];
    if((first==='"'&&last==='"')||(first==="'"&&last==="'")||
       (first==='\`'&&last==='\`')||(first==='«'&&last==='»'))
      sentinel=sentinel.slice(1,-1).trim();
    else break;
  }
  if(REVIEW_EMPTY_FIX_VALUES.has(sentinel.toLowerCase()))return null;
  return value.slice(0,4000);
}
function reviewGetApplicableFix(issue){
  if(!issue||typeof issue!=='object')return null;
  if(issue.status==='applied'||issue.status==='withdrawn'||issue.status==='deferred')return null;
  if(['Опубликован','Архив'].includes(state.documentManager?.status))return null;
  const value=reviewNormalizeFixValue(issue.fixValue);
  if(!value)return null;
  if(isDeferredIssue(issue))return null;
  const n=issue.stepId;
  if(n!==null&&n!==undefined&&n!==0&&n!==''){
    const number=Number(n),index=number-1;
    if(!Number.isInteger(number)||number<1||!Array.isArray(state.steps)||index>=state.steps.length)return null;
    const step=state.steps[index];
    if(!step)return null;
    if(issue.field==='time'){
      // A request such as "increase the time" is not a concrete duration.
      if(!/^\d{1,4}:\d{2}$/.test(value))return null;
      const duration=parseDuration(value);
      if(!Number.isFinite(duration)||duration<=0||duration===Number(step.durationSeconds))return null;
      return {scope:'step',index,field:'time',value:duration};
    }
    if(issue.field==='keyMoments'){
      const points=Array.isArray(step.keyMoments)?step.keyMoments.filter(x=>String(x??'').trim()):[];
      if(points.length>=3||points.includes(value))return null;
      const checked=stage391ValidateKeyPointProposal(value,step);
      if(!checked.ok)return null;
      return {scope:'step',index,field:'keyMoments',value:checked.value};
    }
    if(['action','reason','successCriteria'].includes(issue.field)){
      if(String(step[issue.field]??'').trim()===value)return null;
      if(issue.field==='reason'){
        const checked=stage391ValidateReasonProposal(step.reason,value,step);
        if(!checked.ok)return null; // Never apply unsupported numbers or broken ordinals.
        return {scope:'step',index,field:issue.field,value:checked.value};
      }
      const checked=stage391ValidateTextProposal(value,step);
      if(!checked.ok)return null;
      return {scope:'step',index,field:issue.field,value:checked.value};
    }
    return null;
  }
  // Only known editable metadata may receive a document-level AI correction.
  if(!['safety','tools','material'].includes(issue.field))return null;
  if(String(state.meta?.[issue.field]??'').trim()===value)return null;
  return {scope:'meta',field:issue.field,value};
}
