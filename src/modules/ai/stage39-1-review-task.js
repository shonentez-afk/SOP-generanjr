// Stage28: unified mentor. One AI request per explicit check, not one request
// for full review plus another for the "Logic" toolbar.
const STAGE28_REVIEW_PROMPT=[
  AI_SYS.review,
  AI_DATA_BOUNDARY,
  'Это единая проверка СОП: Important Step -> 0-3 обоснованных Key Points -> Reason Why -> критерий результата.',
  'КОРПОРАТИВНОЕ ПРАВИЛО STAGE38: на каждый шаг ровно ОДНО текстовое поле reason. Если одна причина объясняет несколько Key Points — это корректно, нумерация не требуется.',
  'Несколько разных причин допустимы внутри одного поля reason строками 1. ...\\n2. ...\\n3. ...; не требуй число причин равным числу Key Points.',
  'Не считай отсутствие ГОСТ, приказа или нормативной ссылки самостоятельной ошибкой. Норматив не придумывай. Если предлагаешь fixValue для reason, сохрани действующую нумерацию.',
  'Проверка причин ПОЧЕМУ: конкретная подтверждённая связь между критичным приёмом и следствием. Если Reason повторяет полный текст Key Point с добавлением «для обеспечения качества/безопасности», это не WHY, предложи уточнение.',
  'Не принимай за Key Point обычную последовательность выполнения работы (например, просто включить питание/запустить), если нет особого критичного приёма. Не требуй заполнить 3 Key Points.',
  'Не допускай неподтверждённых последствий вроде перегрева, травмы, потери точности, повреждения оборудования. Если неизвестно, почему задана точная выдержка или режим, запроси конкретное объяснение у инженера вместо догадки.',
  'Ошибку смысла отмечай как вопрос/замечание, без автоматической замены Reasons, без фиктивной нормативной ссылки и нового параметра.',
  'Ноль Key Points допустим, отсутствие фотографии само по себе не ошибка.',
  'Не придумывай нормативы, допуски, СИЗ и технологические значения.',
  'Для каждого замечания верни evidence: {"field":"action|keyMoments|reason|successCriteria|decisionPoints|safety|tools|material","quote":"ДОСЛОВНЫЙ фрагмент входного поля"}',
  'Если точной цитаты нет, не выдумывай её: evidence=null, severity=question, fixValue=null.',
  'Различай факт из СОП, технологическую гипотезу и вопрос к инженеру.',
  'Не дублируй одно и то же замечание. Не оценивай пиксели фотографий: они не переданы.',
  'Возвращай обычный JSON review со свойствами issues, summary, overall_quality.',
  'stepId — номер шага stepNumber из входных данных, начиная с 1; не внутренний id.',
  'Исправления только как предложения, не меняй фактическое время.',
  'Если передано focusStepNumbers, возвращай замечания только по этим номерам; соседние шаги служат контекстом.',
].join('\n');

function stage28ReviewInput(numbers){
  const focus=new Set(numbers);
  const meta=state.meta||{};
  return {
    meta:{
      operation:meta.operation,department:meta.department,executor:meta.executor,
      safety:meta.safety,tools:meta.tools,material:meta.material
    },
    sourceDescription:state.description,
    focusStepNumbers:numbers,
    steps:state.steps.map((s,i)=>({s,i})).filter(({i})=>focus.has(i+1))
      .map(({s,i})=>({
        stepNumber:i+1,action:s.action,
        keyMoments:Array.isArray(s.keyMoments)?s.keyMoments.filter(Boolean):[],
        reason:s.reason,time:formatDuration(s.durationSeconds),
        successCriteria:s.successCriteria,
        decisionPoints:s.decisionPoints,commonPitfalls:s.commonPitfalls,
        visualMarkers:s.visualMarkers,
        hasPhoto:!!(s.hasPhoto||s.imageData||s.imageBuffer),
        photoHint:s.photoHint||''
      }))
  };
}
function stage28CurrentDiff(){
  return stage28CompareSteps(state.steps,stage28ReviewMeta,
    stage28DocumentSignature(state));
}
function stage28ReviewSetSummary(quality,mode,affectedCount,hasAi,reason){
  if(!hasAi)return {
    overall_quality:'',summary:'Автопроверка по полям СОП. Онлайн-наставник недоступен; ранее полученные замечания не заменялись.'
  };
  return {
    overall_quality:quality.overall_quality||'',
    summary:(mode==='changed'?'Проверено изменённых и соседних шагов: '+affectedCount+
      '. Остальные замечания и обсуждения сохранены. ':
      'Выполнена полная проверка СОП с привязкой замечаний к исходным полям. ')+
      (quality.summary||'')+(reason?' '+reason:'')
  };
}
async function reviewEntireSOP(options={}){
  const requested=options&&options.mode==='changed'?'changed':'full';
  if(!state.steps?.length){toast('Добавьте хотя бы один шаг','error');return false;}
  const btn=$('reviewSopBtn');
  const partialButton=$('stage28CheckChanged');
  if(btn?.disabled){toast('Проверка уже выполняется','info');return false;}
  const old=btn?.innerHTML;
  if(btn){btn.disabled=true;btn.innerHTML='⏳ Проверка СОП…';}
  if(partialButton)partialButton.disabled=true;
  try{
    autoScoreChecklist();
    const context=stage28DocumentSignature(state);
    const diff=stage28CompareSteps(state.steps,stage28ReviewMeta,context);
    const changedSet=new Set(diff.changed);
    let mode=requested;
    if(mode==='changed'&&(diff.full||diff.changed.length>8)){
      mode='full';
      toast('Состав, порядок или общие условия СОП изменились: нужна полная проверка.','info');
    }
    if(mode==='changed'&&!diff.changed.length){
      renderReviewResults(reviewSummary||{});
      toast('С момента предыдущей проверки шаги не изменились.','info');
      return true;
    }
    const affected=mode==='full'
      ?state.steps.map((_,i)=>i+1):diff.affected;
    const focus=new Set(affected);
    const input=stage28ReviewInput(affected);
    const payload=JSON.stringify(input);
    if(payload.length>58000){
      toast('Для надёжной ИИ-проверки СОП слишком объёмный. Автопроверка доступна, разбейте документ на проверяемые разделы.','warning');
      if(reviewIssues.length)return false;
    }
    const guard=aiGuardCapture({review:true});
    const deterministic=stage28GroundChecks([
      ...runDeterministicChecks(),...stage28TwiStructureChecks(state.steps)
    ],state.steps,state.meta);
    let ai=[],quality={},onlineOk=false;
    try{
      if(payload.length>58000)throw new Error('Stage28 oversized input');
      const rawText=await aiAsk(STAGE28_REVIEW_PROMPT,payload,{
        model:currentModel,maxTokens:3000,temperature:0.1,task:'review'
      });
      const parsed=aiReadTaskObject(rawText,'review');
      const review=validateReviewResponse(parsed);
      ai=stage28GroundAIReview(review,parsed,state.steps,state.meta);
      // A model cannot forge step numbers outside the current reviewed scope.
      ai=ai.filter(i=>i.stepId!=null&&focus.has(Number(i.stepId))||
        mode==='full'&&i.stepId==null);
      quality=review;onlineOk=true;
    }catch(e){
      if(!aiGuardMatches(guard)){aiGuardCanApply(guard);return false;}
      if(reviewIssues.length){
        toast('Наставник недоступен; прежние замечания и диалоги сохранены. '+diagnoseAIError(e),'warning');
        return false;
      }
      toast('Наставник недоступен: показана только локальная автопроверка.','info');
    }
    if(!aiGuardCanApply(guard))return false;
    if(stage28DocumentSignature(state)!==context)return false;
    const stepIssues=deterministic.filter(i=>i.stepId==null||
      mode==='full'||focus.has(Number(i.stepId)));
    const incoming=stage28Dedup([...stepIssues,...ai]);
    const prior=reviewIssues;
    const prevMeta=stage28NormalizeMeta(stage28ReviewMeta);
    const canKeep=(n)=>{
      if(n===0)return prevMeta.contextSignature===context;
      return prevMeta.contextSignature===context&&
        prevMeta.stepSignatures[n-1]?.content===diff.signatures[n-1]?.content;
    };
    let merged;
    if(mode==='full'){
      merged=incoming.map(iss=>{
        const same=prior.find(x=>stage28IssueKey(x)===stage28IssueKey(iss));
        return stage28PreserveIssue(same,iss,canKeep(Number(iss.stepId)||0));
      });
    }else{
      // Never re-check unchanged document-wide issues in a per-step request.
      const subset=incoming.filter(i=>i.stepId!=null&&focus.has(Number(i.stepId)));
      merged=stage28MergeIssueLists(prior,subset,affected,canKeep);
    }
    // A duplicate must not resurrect a deferred item or a withdrawn dispute.
    merged=stage28Dedup(merged);
    reviewIssues=merged.filter(x=>!isDeferredIssue(x)||x.status==='deferred');
    reviewSummary=stage28ReviewSetSummary(quality,mode,affected.length,onlineOk);
    if(onlineOk){
      stage28ReviewMeta=stage28NormalizeMeta({
        documentId:state.documentManager?.currentId||null,
        contextSignature:context,stepSignatures:diff.signatures,
        aiComplete:true,lastMode:mode,checkedAt:Date.now(),
        reviewedSteps:affected.length,partial:false
      });
    }else{
      stage28ReviewMeta=stage28EmptyMeta();
      stage28ReviewMeta.documentId=state.documentManager?.currentId||null;
    }
    renderReviewResults(reviewSummary);
    saveDraftDebounced();
    toast((mode==='changed'?'Изменения проверены: ':'Проверка завершена: ')+
      reviewIssues.length+' замечаний'+(onlineOk?'':' (только автопроверка)'),
      reviewIssues.some(x=>x.severity==='critical'||x.severity==='safety_gap')?
        'warning':'success');
    return true;
  }catch(e){
    toast(diagnoseAIError(e),'error');
    return false;
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML=old;}
    if(partialButton)partialButton.disabled=false;
  }
}
async function stage28ReviewChanged(){
  const done=await reviewEntireSOP({mode:'changed'});
  if(done&&stage27ActiveTab==='mentor')stage28SyncLogic();
}
function stage28SyncLogic(){
  if(!stage28ReviewMeta.aiComplete&&!reviewIssues.length)return;
  const out=reviewIssues.filter(x=>x.stepId!=null&&
    !['time','photo'].includes(x.field)&&
    x.status!=='withdrawn'&&x.status!=='deferred').slice(0,15)
    .map((x,i)=>({
      id:'M'+(i+1),
      stepId:state.steps[Number(x.stepId)-1]?.id??null,
      description:String(x.description||'').slice(0,750),
      evidence:(x.evidenceSource?x.evidenceSource+': ':'')+
        String(x.evidence||'').slice(0,700),
      suggestion:String(x.suggestion||'').slice(0,700),
      severity:cssFor(x.severity)==='critical'?'safety_gap':
        cssFor(x.severity)==='warning'?'warning':'question',
      explanation:''
    })).filter(x=>Number.isSafeInteger(x.stepId));
  state.stage27=stage27Normalize(state.stage27);
  state.stage27.mentor=out;
  state.stage27.mentorSignature=stage27DocumentSignature();
  stage27Store();stage27Render();
}
async function stage28ReviewLogic(){
  if(!state.steps.length){toast('Добавьте шаги СОП.','info');return;}
  if(stage27SetBusy(true)===false)return;
  try{
    const diff=stage28CurrentDiff();
    const hasReview=!!stage28ReviewMeta.aiComplete;
    // Instead of a second AI call for the same SOP, show the unified mentor
    // results. If the SOP changed, a focused request refreshes affected steps.
    if(!hasReview||diff.changed.length||diff.full){
      const result=await reviewEntireSOP({mode:hasReview?'changed':'full'});
      if(!result)return;
    }
    stage28SyncLogic();
    toast('Логика шагов показана из общей проверки СОП.','success');
  }finally{stage27SetBusy(false);}
}
