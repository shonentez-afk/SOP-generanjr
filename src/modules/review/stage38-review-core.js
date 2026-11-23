// Stage28 review contracts: evidence must originate in the user's SOP, not model prose.
// This module does not call AI or mutate the editor/document/media.
const STAGE28_FINGERPRINT_FIELDS=[
  'action','keyMoments','reason','successCriteria','decisionPoints',
  'commonPitfalls','visualMarkers','photoHint','durationSeconds'
];
const STAGE28_FIELDS={
  action:'Действие',keyMoments:'Ключевые моменты',reason:'Почему важно',
  successCriteria:'Критерий результата',decisionPoints:'Действия при отклонении',
  commonPitfalls:'Типичные ошибки',visualMarkers:'Визуальные подсказки',
  photoHint:'Фото-подсказка',time:'Время',photo:'Фото',
  safety:'Безопасность',tools:'Инструменты',material:'Материалы'
};
let stage28ReviewMeta=stage28EmptyMeta();
function stage28EmptyMeta(){
  return {schemaVersion:1,documentId:null,contextSignature:'',
    stepSignatures:[],aiComplete:false,lastMode:'',
    checkedAt:0,reviewedSteps:0,partial:false};
}
function stage28NormalizeMeta(raw){
  const o=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  return {
    schemaVersion:1,
    documentId:o.documentId==null?null:String(o.documentId).slice(0,120),
    contextSignature:typeof o.contextSignature==='string'?o.contextSignature.slice(0,12000):'',
    stepSignatures:Array.isArray(o.stepSignatures)?o.stepSignatures.slice(0,250).map(x=>({
      id:Number.isSafeInteger(x?.id)?x.id:null,
      content:typeof x?.content==='string'?x.content.slice(0,16000):''
    })):[],
    aiComplete:!!o.aiComplete,
    lastMode:['full','changed'].includes(o.lastMode)?o.lastMode:'',
    checkedAt:Number.isFinite(Number(o.checkedAt))?Number(o.checkedAt):0,
    reviewedSteps:Number.isSafeInteger(o.reviewedSteps)?o.reviewedSteps:0,
    partial:!!o.partial
  };
}
function stage28DocumentSignature(s){
  const meta=s.meta||{};
  return JSON.stringify({
    documentId:s.documentManager?.currentId??null,
    documentStatus:s.documentManager?.status??'Черновик',
    operation:meta.operation||'',
    description:s.description||'',
    safety:meta.safety||'',tools:meta.tools||'',material:meta.material||'',
    department:meta.department||'',executor:meta.executor||''
  });
}
function stage28StepSignature(step){
  const s=step||{};
  const record={id:Number.isSafeInteger(s.id)?s.id:null};
  for(const key of STAGE28_FINGERPRINT_FIELDS)record[key]=s[key]??null;
  // Only photo presence is checked: the model has not seen the pixels.
  record.hasPhoto=!!(s.imageData||s.imageBuffer||s.hasPhoto||
    (Array.isArray(s.photoAnnotations)&&s.photoAnnotations.length));
  return {id:record.id,content:JSON.stringify(record)};
}
function stage28CompareSteps(steps,previous,contextSignature){
  const latest=(Array.isArray(steps)?steps:[]).map(stage28StepSignature);
  const prev=stage28NormalizeMeta(previous);
  const invalid=!prev.aiComplete||!prev.stepSignatures.length||
    prev.contextSignature!==contextSignature||
    latest.length!==prev.stepSignatures.length||
    latest.some((x,i)=>x.id==null||x.id!==prev.stepSignatures[i]?.id);
  if(invalid){
    return {full:true,changed:latest.map((_,i)=>i+1),
      affected:latest.map((_,i)=>i+1),signatures:latest};
  }
  const changed=latest.map((x,i)=>x.content===prev.stepSignatures[i].content?null:i+1)
    .filter(Boolean);
  const affected=new Set();
  for(const n of changed){
    for(const value of [n-1,n,n+1]){
      if(value>=1&&value<=latest.length)affected.add(value);
    }
  }
  return {full:false,changed,affected:[...affected].sort((a,b)=>a-b),
    signatures:latest};
}
function stage28IssueKey(issue){
  return [Number(issue?.stepId)||0,
    String(issue?.field||'').trim().toLocaleLowerCase('ru'),
    String(issue?.description||'').trim().toLocaleLowerCase('ru').replace(/\s+/g,' ')
  ].join('|');
}
function stage28Dedup(issues){
  const out=[],seen=new Map();
  for(const i of issues){
    const key=stage28IssueKey(i);
    if(!String(i.description||'').trim())continue;
    if(seen.has(key)){
      const old=out[seen.get(key)];
      // Preserve a grounded issue over an unsupported model hypothesis.
      if(old.evidenceKind!=='observed'&&i.evidenceKind==='observed')out[seen.get(key)]=i;
      continue;
    }
    seen.set(key,out.length);out.push(i);
  }
  return out;
}
function stage28SourceValue(step,meta,field){
  const s=step||{};
  const v=field==='time'?s.durationSeconds:
    field==='photo'?'':Object.prototype.hasOwnProperty.call(s,field)?s[field]:
    Object.prototype.hasOwnProperty.call(meta||{},field)?meta[field]:'';
  if(Array.isArray(v))return v.map(x=>String(x??'').trim()).filter(Boolean).join('; ');
  return String(v??'').trim();
}
function stage28SourceExcerpt(issue,steps,meta){
  const stepId=Number(issue?.stepId);
  const step=Number.isInteger(stepId)&&stepId>0?steps[stepId-1]:null;
  let field=String(issue?.field||'');
  if(!STAGE28_FIELDS[field])field=step?'action':'safety';
  let source=stage28SourceValue(step,meta,field);
  if(!source&&step)source=stage28SourceValue(step,meta,'action');
  const label=(step?'Шаг '+stepId+' · ':'Условия СОП · ')+(STAGE28_FIELDS[field]||'Данные');
  return {label,text:source.slice(0,350),field,step};
}
function stage28EvidenceForIssue(issue,rawEvidence,steps,meta,origin){
  const info=stage28SourceExcerpt(issue,steps,meta);
  const q=typeof rawEvidence==='string'?rawEvidence.trim():String(rawEvidence?.quote??'').trim();
  const requested=typeof rawEvidence==='object'&&rawEvidence?
    String(rawEvidence.field||''):'';
  const source=stage28SourceValue(info.step,meta,
    STAGE28_FIELDS[requested]?requested:info.field);
  // Never trust a made-up "quote". Require contiguous excerpt in a real field.
  const verified=q.length>=7&&source.toLocaleLowerCase('ru').includes(q.toLocaleLowerCase('ru'));
  const kind=origin==='deterministic'?'observed':verified?'observed':
    issue?.type==='contradiction'?'hypothesis':'question';
  const grounded=origin==='deterministic' || verified;
  return {
    evidenceKind:kind,
    evidenceSource:verified?((info.step?'Шаг '+issue.stepId+' · ':'СОП · ')+
      (STAGE28_FIELDS[requested]||STAGE28_FIELDS[info.field])):info.label,
    evidence:verified?q.slice(0,280):info.text,
    evidenceVerified:grounded,
    evidenceNote:kind==='observed'?'Проверено по полям СОП':
      kind==='hypothesis'?'Гипотеза ИИ: требуется подтверждение':
      'Недостаточно подтверждений: вопрос инженеру'
  };
}
function stage28GroundAIReview(validated,raw,steps,meta){
  const original=Array.isArray(raw?.issues)?raw.issues.filter(Boolean).slice(0,15):[];
  return (validated.issues||[]).map((issue,index)=>{
    const s=Number(issue.stepId);
    // Number in the legacy review protocol is a 1-based visible step number.
    const invalid=s&&!((Number.isInteger(s)&&s>=1&&s<=steps.length));
    if(invalid)return null;
    const evidence=stage28EvidenceForIssue(issue,original[index]?.evidence,
      steps,meta,'ai');
    return {
      ...issue,...evidence,reviewOrigin:'ai',status:'open',thread:[],
      // Unsupported AI claims are questions, never a proven safety violation.
      severity:evidence.evidenceVerified?issue.severity:'question',
      // No direct fix unless source wording was located in SOP.
      fixValue:evidence.evidenceVerified&&issue.field!=='time'?issue.fixValue:null
    };
  }).filter(Boolean);
}
function stage28GroundChecks(issues,steps,meta){
  return (Array.isArray(issues)?issues:[]).map(issue=>({
    ...issue,...stage28EvidenceForIssue(issue,null,steps,meta,'deterministic'),
    reviewOrigin:'rule'
  }));
}
function stage28TwiStructureChecks(steps){
  // Detect only strictly demonstrable editorial contradictions. No requirement
  // that every Important Step has a Key Point, photo or external safety standard.
  const issues=[];
  (Array.isArray(steps)?steps:[]).forEach((s,i)=>{
    const stepId=i+1;
    const km=Array.isArray(s?.keyMoments)?s.keyMoments.map(x=>String(x??'').trim())
      .filter(Boolean):[];
    const action=String(s?.action??'').trim();
    const reason=String(s?.reason??'').trim();
    const criterion=String(s?.successCriteria??'').trim();
    const norm=x=>String(x||'').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();
    if(km.length>3){
      issues.push({stepId,field:'keyMoments',severity:'warning',
        type:'incomplete',status:'open',fixValue:null,thread:[],
        description:'В шаге более трёх ключевых моментов',
        suggestion:'Проверьте, не смешаны ли разные важные действия; не создавайте лишние Key Points.'});
    }
    if(new Set(km.map(norm)).size!==km.length){
      issues.push({stepId,field:'keyMoments',severity:'info',
        type:'duplicate',status:'open',fixValue:null,thread:[],
        description:'Одинаковый ключевой момент повторяется внутри шага',
        suggestion:'Оставьте только действительно разные критичные детали.'});
    }
    if(reason.length>12&&(norm(reason)===norm(action)||km.some(x=>norm(x)===norm(reason)))){
      issues.push({stepId,field:'reason',severity:'info',
        type:'incomplete',status:'open',fixValue:null,thread:[],
        description:'Объяснение «Почему важно» дословно повторяет действие или ключевой момент',
        suggestion:'Проверьте, поясняет ли текст причину, а не только повторяет порядок действий.'});
    }
    issues.push(...stage38ReasonIssues(reason,km.length,stepId));
    if(action.length>12&&criterion.length>12&&norm(action)===norm(criterion)){
      issues.push({stepId,field:'successCriteria',severity:'info',
        type:'incomplete',status:'open',fixValue:null,thread:[],
        description:'Критерий результата дословно повторяет действие',
        suggestion:'Если результат можно наблюдать, опишите признак его успешного завершения.'});
    }
  });
  return issues;
}
function stage28PhotoGuidance(steps){
  const out=[];
  (Array.isArray(steps)?steps:[]).forEach((s,i)=>{
    const marked=(Array.isArray(s.visualMarkers)?s.visualMarkers:[])
      .map(v=>String(v||'').trim()).find(Boolean)||String(s.photoHint||'').trim();
    if(!marked)return;
    const hasPhoto=!!(s.imageData||s.imageBuffer||s.hasPhoto||
      (Array.isArray(s.photoAnnotations)&&s.photoAnnotations.length));
    out.push({stepId:i+1,hasPhoto,hint:marked.slice(0,220),
      message:hasPhoto?'Фото прикреплено; содержимое изображения ИИ не проверял':
        'Возможный кадр по тексту: '+marked.slice(0,160)+
        '. Фотография не обязательна без обоснования'});
  });
  return out.slice(0,15);
}
function stage28PreserveIssue(oldIssue,newIssue,allowDialog){
  if(!oldIssue||!newIssue||stage28IssueKey(oldIssue)!==stage28IssueKey(newIssue))
    return newIssue;
  if(!allowDialog)return newIssue;
  return {...newIssue,status:oldIssue.status||'open',
    thread:Array.isArray(oldIssue.thread)?oldIssue.thread:[],
    pendingDraft:oldIssue.pendingDraft||'',disputeOpen:!!oldIssue.disputeOpen,
    ...(oldIssue.deferredAt?{deferredAt:oldIssue.deferredAt}:{})};
}
function stage28MergeIssueLists(previous,replacement,affected,allowDialogFor){
  const focus=new Set(affected);
  const prev=Array.isArray(previous)?previous:[];
  const incoming=stage28Dedup(replacement);
  const kept=prev.filter(issue=>issue.stepId!=null&&!focus.has(Number(issue.stepId))||
    issue.stepId==null&&!focus.has(0));
  const result=[];
  for(const item of incoming){
    const old=prev.find(x=>stage28IssueKey(x)===stage28IssueKey(item));
    const allow=old&&allowDialogFor(Number(item.stepId)||0);
    result.push(stage28PreserveIssue(old,item,allow));
  }
  return stage28Dedup([...kept,...result]);
}
