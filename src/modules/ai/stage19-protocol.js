function extractJson(text){
  let s=String(text||'').trim();
  const fm=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if(fm)s=fm[1].trim();
  const first=s.indexOf('{');
  if(first<0) return s;
  let depth=0,inString=false,escaped=false;
  for(let i=first;i<s.length;i++){
    const ch=s[i];
    if(inString){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){depth--;if(depth===0)return s.slice(first,i+1);}
  }
  return s.slice(first);
}
function validateGeneratedSop(x){
  if(!x||typeof x!=='object'||!Array.isArray(x.steps))throw new Error('AI: отсутствует массив steps');
  const cleanText=v=>String(v??'').trim();
  const cleanArray=v=>Array.isArray(v)?v.map(cleanText).filter(Boolean):[];
  const validIcons=new Set(ICON_LIB.map(x=>x.id));
  const rawSteps=x.steps.filter(s=>s&&typeof s==='object');
  const normalized=rawSteps.map(s=>({
    action:cleanText(s.action),
    keyMoments:cleanArray(s.keyMoments).slice(0,3),
    reason:cleanText(s.reason),
    time:cleanText(s.time) && /^\d{1,4}:\d{2}$/.test(cleanText(s.time)) ? normalizeTimeString(s.time) : null,
    success_criteria:cleanText(s.success_criteria),
    decision_points:cleanArray(s.decision_points),
    common_pitfalls:cleanArray(s.common_pitfalls),
    visual_markers:cleanArray(s.visual_markers).slice(0,1)
  }));
  // Не принимаем формально валидный, но пустой ответ: это важно для генерации из карты процесса.
  const emptyActions=normalized.filter(s=>!s.action);
  if(rawSteps.length<1)throw new Error('AI не создал ни одного шага');
  if(emptyActions.length===normalized.length)throw new Error('AI вернул шаги без действий');
  // Если часть шагов пустая, выбрасываем только пустые, но если потеряно более 25% — считаем ответ плохим.
  const cleanSteps=normalized.filter(s=>s.action);
  if(cleanSteps.length<Math.max(1,Math.ceil(normalized.length*0.75)))throw new Error('AI вернул слишком много пустых шагов');
  x.steps=cleanSteps;
  x.openQuestions=cleanArray(x.openQuestions).slice(0,10);
  x.isoIconIds=Array.isArray(x.isoIconIds)?x.isoIconIds.filter(id=>validIcons.has(id)):[];
  return x;
}
function validateReviewResponse(x){
  if(!x||typeof x!=='object')throw new Error('AI review: некорректный JSON');
  const allowedSeverity=new Set(['safety_gap','improvement','question']);
  const allowedType=new Set(['missing','contradiction','duplicate','unrealistic','incomplete','wrong_reference']);
  const allowedFields=new Set(['action','keyMoments','reason','time','safety','tools','material']);
  const issues=Array.isArray(x.issues)?x.issues:[];
  return {issues:issues.filter(Boolean).slice(0,15).map(i=>({
    severity:allowedSeverity.has(i.severity)?i.severity:'question',
    type:allowedType.has(i.type)?i.type:'incomplete',
    stepId:Number.isInteger(i.stepId)?i.stepId:null,
    field:allowedFields.has(i.field)?i.field:null,
    description:String(i.description||'').trim().slice(0,500),
    why:String(i.why||'').trim().slice(0,800),
    suggestion:String(i.suggestion||'').trim().slice(0,800),
    fixValue:i.fixValue==null?null:String(i.fixValue).trim()
  })),summary:String(x.summary||'').trim().slice(0,1000),overall_quality:['excellent','good','needs_improvement','poor'].includes(x.overall_quality)?x.overall_quality:''};
}
function validateDisputeResponse(x){
  if(!x||typeof x!=='object')throw new Error('AI dispute: некорректный JSON');
  return {reply:String(x.reply||'').trim().slice(0,1200),verdict:x.verdict==='withdraw'?'withdraw':'keep',new_fix:x.new_fix==null?null:String(x.new_fix).trim()||null};
}
function pingAI(){setAIStatus('idle','AI: не проверен')}
