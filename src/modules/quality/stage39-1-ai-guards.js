// Stage39.1: one conservative AI proposal gate for Stage38 Reasons and Key Points.
// Never rewrite the corporate SOP schema or silently repair an AI answer.
// This module intentionally does not run for ordinary manual text edits.
function stage391FactCorpus(step){
  const m=state.meta||{};
  return [
    state.description||'',m.operation||'',m.safety||'',m.tools||'',
    m.material||'',m.workplace||'',
    step?.action||'',...(step?.keyMoments||[]),step?.reason||'',
    step?.successCriteria||'',...(step?.decisionPoints||[]),
    ...(step?.commonPitfalls||[])
  ].map(String).join('\n');
}
function stage391ReasonLabels(value){
  const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');
  const labels=[],invalid=[];
  for(const [index,line] of lines.entries()){
    const match=line.match(/^\s*(\d{1,2})[.)][ \t]+(\S.*)$/u);
    if(match)labels.push(Number(match[1]));
    else if(line.trim())invalid.push(index+1);
  }
  return {labels,invalid,lines};
}
function stage391ReasonShape(value){
  const e=stage391ReasonLabels(value);
  if(e.labels.length){
    if(e.invalid.length)return {ok:false,message:'В списке причин каждая непустая строка должна иметь свой номер.'};
    if(e.labels.some((n,i)=>n!==i+1))
      return {ok:false,message:'В списке причин есть пропуск или повтор номера.'};
  }else if(/^\s*\d+[.)]\s*/m.test(String(value||''))){
    return {ok:false,message:'Некорректный номер или пустая нумерованная причина.'};
  }
  return {ok:true};
}
function stage391FrvFacts(row,study){
  return [study?.processDescription,study?.operationId,study?.workplace,
    row?.actionRaw,row?.actionNormalized,row?.keyMoment,row?.reason,
    row?.qualityKey,row?.safetyKey,row?.tool,row?.material,row?.comment,
    row?.durationSec].map(x=>String(x??'')).join('\n');
}
function stage391ValidateReasonProposal(previous,candidate,step,sourceOverride){
  if(typeof candidate!=='string'||!candidate.trim())
    return {ok:false,message:'ИИ вернул пустую причину — прежний текст сохранён.'};
  if(candidate.length>2000)
    return {ok:false,message:'Предложенная причина слишком длинная для поля СОП.'};
  const value=stage38ReasonText(candidate,2000);
  if(!value||/^(?:null|undefined|none|keep|n\/a)$/iu.test(value))
    return {ok:false,message:'ИИ вернул служебное значение вместо причины.'};
  const old=stage391ReasonLabels(previous);
  const incoming=stage391ReasonLabels(value);
  if(incoming.labels.length){
    if(incoming.invalid.length)
      return {ok:false,message:'В нумерованной причине каждая строка должна начинаться с 1., 2. и т. д.'};
    if(incoming.labels.some((n,i)=>n!==i+1))
      return {ok:false,message:'ИИ нарушил порядок или полноту нумерации причин. Исходное поле сохранено.'};
  }else if(/^\s*\d+[.)]\s*/m.test(value)){
    return {ok:false,message:'ИИ оставил некорректный или пустой номер причины.'};
  }
  if(old.labels.length&&!old.invalid.length&&
     JSON.stringify(incoming.labels)!==JSON.stringify(old.labels)){
    return {ok:false,message:'ИИ изменил число или номера уже записанных причин. Исправьте вручную после проверки.'};
  }
  const unconfirmed=stage29HasUnconfirmedNumber(
    stage38StripOrdinalLabels(value),sourceOverride??stage391FactCorpus(step),0);
  const whyProblems=stage391TwiReasonQualityIssues(value,step,
    sourceOverride??stage391TwiSourceFacts(step),previous).filter(x=>x.blockAI);
  if(whyProblems.length)
    return {ok:false,message:'ИИ предложил некорректное объяснение: '+whyProblems[0].message};
  if(unconfirmed.length)
    return {ok:false,message:'ИИ предложил неподтверждённые числовые параметры: '+unconfirmed.join(', ')+'.'};
  return {ok:true,value};
}
function stage391ValidateKeyPointProposal(candidate,step){
  const raw=String(candidate??'').trim();
  if(!raw||/^(?:null|undefined|none|keep|n\/a)$/iu.test(raw))
    return {ok:false,message:'ИИ не вернул корректный ключевой момент.'};
  if(raw.length>900||/[\r\n]/.test(raw))
    return {ok:false,message:'ИИ должен вернуть только один ключевой момент без списка.'};
  const unconfirmed=stage29HasUnconfirmedNumber(raw,stage391FactCorpus(step),0);
  if(unconfirmed.length)
    return {ok:false,message:'Новый ключевой момент содержит неподтверждённые числа: '+unconfirmed.join(', ')+'.'};
  return {ok:true,value:raw};
}
function stage391RejectInvalidReason(previous,proposed,step){
  const checked=stage391ValidateReasonProposal(previous,proposed,step);
  if(!checked.ok)toast(checked.message,'warning');
  return checked;
}

function stage391ValidateTextProposal(candidate,step,sourceOverride){
  const value=typeof candidate==='string'?candidate.trim():'';
  if(!value||/^(?:null|undefined|none|keep|n\/a)$/iu.test(value))
    return {ok:false,message:'ИИ вернул пустое или служебное значение.'};
  const extras=stage29HasUnconfirmedNumber(value,
    sourceOverride??stage391FactCorpus(step),0);
  if(extras.length)
    return {ok:false,message:'ИИ предложил неподтверждённые числовые параметры: '+extras.join(', ')+'.'};
  return {ok:true,value};
}

// TWI JI WHAT / HOW / WHY quality: fail closed only for obvious AI mistakes.
// Subjective or weakly supported concerns are advisory, never an automatic
// rewrite of user-authored SOP content or FRV observations.
function stage391TwiPlain(text){
  return String(text||'').toLocaleLowerCase('ru')
    .replace(/^\s*\d{1,2}[.)]\s*/u,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function stage391TwiSourceFacts(step){
  const m=state.meta||{};
  return [state.description,m.operation,m.safety,m.tools,m.material,
    step?.action,...(Array.isArray(step?.keyMoments)?step.keyMoments:[]),
    step?.successCriteria,...(step?.decisionPoints||[])].map(x=>String(x||'')).join('\n');
}
function stage391TwiReasonQualityIssues(reason,step,evidence='',previous=''){
  const points=(Array.isArray(step?.keyMoments)?step.keyMoments:[])
    .map(stage391TwiPlain).filter(Boolean);
  const action=stage391TwiPlain(step?.action);
  const source=stage391TwiPlain(evidence||stage391TwiSourceFacts(step));
  const before=stage391TwiPlain(previous);
  const issues=[];
  const hazards=[
    ['перегрев','перегрев'],['возгоран','возгорание'],
    ['поражен','поражение током'],['взрыв','взрыв'],
    ['ожог','ожог'],['заклиниван','заклинивание'],
    ['поломк','поломка'],['травм','травма'],
    ['снижени точност','снижение точности']
  ];
  const lines=String(reason||'').replace(/\r\n?/g,'\n').split('\n');
  for(let i=0;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const value=stage391TwiPlain(lines[i]);
    if(!value)continue;
    const echo=points.some(p=>p.length>=22&&(
      value===p||value.startsWith(p+' ')||value.startsWith(p+' необходимо')||
      value.startsWith(p+' для')||value.startsWith(p+' чтобы')
    ))||action.length>=22&&(value===action||value.startsWith(action+' для'));
    if(echo){
      issues.push({line:i+1,kind:'repeated_key_point',
        message:'Причина повторяет ключевой момент или действие вместо ответа «почему».',
        blockAI:true});
    }
    const vague=(
      /^(?:это\s+)?(?:необходимо|нужно|требуется|важно)\s+для\s+(?:обеспечени|выполнени|соблюдени)/u.test(value)||
      /^(?:для\s+)?(?:обеспечени|повышени)\s+(?:качества|безопасности|эффективности|правильности|точности)\s+(?:работы|выполнения|операции)?$/u.test(value)||
      /^(?:для\s+)?(?:проверки|контроля)\s+(?:работы|функционирования)\s+(?:инструмента|оборудования)?(?:\s+перед\s+началом\s+работы)?$/u.test(value)||
      /^(?:чтобы\s+)?(?:правильно|безопасно|качественно)\s+выполнить\s+(?:работу|операцию|действие)$/u.test(value)
    );
    if(vague&&!echo){
      issues.push({line:i+1,kind:'generic_why',
        message:'В причине только общая цель («для качества/безопасности»), без конкретного объяснения.',
        blockAI:true});
    }
    // Existing manually-entered risks are not invalidated retroactively.
    // AI must not introduce a NEW physical consequence not grounded in source.
    for(const [token,label] of hazards){
      if(value.includes(token)&&!source.includes(token)&&!before.includes(token)){
        issues.push({line:i+1,kind:'unconfirmed_consequence',
          message:'Последствие «'+label+'» не подтверждено описанием операции; уточните у технолога.',
          blockAI:true});
        break;
      }
    }
  }
  return issues;
}
// Advisory local review: preserve existing text, numbering and the user's
// right to record a justified reason even if an automated heuristic flags it.
const stage391PreviousTwiStructureChecks=stage28TwiStructureChecks;
stage28TwiStructureChecks=function stage391TwiStructureWithWhy(steps){
  const issues=stage391PreviousTwiStructureChecks(steps);
  (Array.isArray(steps)?steps:[]).forEach((step,index)=>{
    const why=stage391TwiReasonQualityIssues(step?.reason,step);
    for(const problem of why.slice(0,3)){
      issues.push({stepId:index+1,field:'reason',severity:'info',
        type:'incomplete',status:'open',fixValue:null,thread:[],
        description:'Проверьте причину, строка '+problem.line+': '+problem.message,
        suggestion:'Причина TWI отвечает «ПОЧЕМУ» конкретный приём важен. Уточните факт у технолога, не повторяйте КМ и не придумывайте последствия.'});
    }
  });
  return issues;
};
// Generation retains every source step and original Reasons Why. When the AI
// produces a weak or speculative explanation, ask a question rather than
// inventing a reason or rejecting the full otherwise-valid SOP draft.
const stage391PreviousSopNormalize=stage29SopNormalize;
stage29SopNormalize=function stage391NormalizeWithReasonReview(sop,input){
  // This is only the generated PROPOSAL, never state.steps. A reference to a
  // rule or a request to consult documentation is not a causal Reason Why.
  // Remove that non-WHY text before the numeric source gate, otherwise the
  // model's invented order number can incorrectly reject the whole valid SOP.
  const normOnly=[];
  (Array.isArray(sop?.steps)?sop.steps:[]).forEach((step,i)=>{
    const lines=String(step.reason??'').replace(/\r\n?/g,'\n')
      .split('\n').filter(s=>s.trim());
    const kept=lines.filter(s=>!stage391ReasonAIIsReferenceInsteadOfWhy(s));
    if(kept.length===lines.length)return;
    // Preserve every usable AI-draft WHY line. If numbering was present,
    // normalize only the remaining ordinal labels inside the single Reason
    // field; never create extra Excel columns or edit the live state.steps.
    const numbered=kept.length&&kept.every(s=>/^\s*\d{1,2}[.)]\s+\S/u.test(s));
    step.reason=numbered?kept.map((s,n)=>
      s.replace(/^\s*\d{1,2}[.)]\s+/u,(n+1)+'. ')).join('\n'):
      kept.join('\n');
    normOnly.push(i+1);
  });
  const result=stage391PreviousSopNormalize(sop,input);
  const source=[input?.userDescription,input?.operation,input?.safety,
    input?.tools,input?.material].map(x=>String(x||'')).join('\n');
  const questions=Array.isArray(result.sop.openQuestions)?result.sop.openQuestions:[];
  for(const n of normOnly)questions.push('Шаг '+n+
    ': ИИ указал норматив или инструкцию вместо WHY. Уточните фактическое обоснование ключевого момента.');
  (result.sop.steps||[]).forEach((step,i)=>{
    const concerns=stage391TwiReasonQualityIssues(step.reason,step,source);
    if(concerns.length){
      questions.push('Шаг '+(i+1)+': уточните WHY ключевого момента. '+
        concerns[0].message);
    }
  });
  result.sop.openQuestions=[...new Set(questions)].slice(0,15);
  return result;
};
