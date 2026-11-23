// Stage39.1: safe ✨ Reasons proposal. This is deliberately an independent
// overlay over the accepted Stage39 Reason handler. A valid grounded AI WHY
// updates the editable Reason directly, without an extra modal or KM button.
const stage391BeforeReasonReviewFill=aiFillField;

// A normative citation or "ask someone / consult instructions" is not a
// Reason Why. Manual text is NEVER rewritten here: this only gates AI drafts.
function stage391ReasonAIIsReferenceInsteadOfWhy(text){
  const lines=stage38StripOrdinalLabels(String(text||'')).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return lines.some(line=>
    /^(?:(?:ПТЭЭП|ПУЭ|ГОСТ|СанПиН|СНиП)(?![\p{L}\p{N}])|ISO\s*\d+|СТО\s+(?:№\s*)?[A-ZА-Я0-9]|(?:Приказ|Постановление)\s+(?:[\p{L} ]{0,35})?№\s*\d+)/iu.test(line)||
    /^(?:при\s+несоответствии\s*[—–:-]?\s*)?(?:проверь(?:те)?|сверь(?:те)?|уточни(?:те)?|обратитесь|следует\s+обратиться)(?=\s|[.:—–-]|$).*(?:инструкц|документац|технолог)/iu.test(line)
  );
}
function stage391ReasonAIDraftForContext(previous){
  const s=String(previous||'');
  // The existing Reason can contain a previous model hallucination. Keep it
  // in the document for comparison, but never treat it as source evidence.
  return stage391ReasonAIIsReferenceInsteadOfWhy(s)
    ? 'В прежнем поле только нормативная ссылка или указание проверить документацию; подтверждённой WHY-причины пока нет.'
    : s;
}

function stage391ReasonAIInspect(previous,proposed,step){
  if(typeof proposed!=='string'||!proposed.trim())
    return {ok:false,message:'ИИ вернул пустую причину; исходный текст сохранён.'};
  // Reuse the already accepted exact-Key-Point cleanup logic for the
  // *proposal only*. The operator must see and approve the final wording.
  const cleaned=stage391CleanupReason(proposed,step);
  const value=stage38ReasonText(cleaned.after,2000);
  if(!value||/^(?:keep|null|undefined|none|n\/a|NEEDS_REASON_FACTS)$/iu.test(value))
    return {ok:false,message:'В исходных данных недостаточно подтверждённого WHY. Уточните технологическую цель проверки; документ сохранён.'};
  if(stage391ReasonAIIsReferenceInsteadOfWhy(value))
    return {ok:false,message:'ИИ вернул ссылку на норматив или инструкцию вместо причины WHY. Сформулируйте технологическую цель проверки.'};
  const lines=value.split('\n').filter(s=>s.trim());
  const incoming=stage391ReasonLabels(value);
  if(lines.length>1&&!incoming.labels.length)
    return {ok:false,message:'Несколько причин необходимо нумеровать 1., 2. и т. д. в одном поле.'};
  const shape=stage391ReasonShape(value);
  if(!shape.ok)return {ok:false,message:shape.message};
  // New normative claims are not substantiated by the system reference list.
  // Only references actually present in the user's document/context count.
  // A preexisting model-generated Reason is NOT independent evidence.
  const sourceEvidence=stage391TwiSourceFacts(step);
  const facts=sourceEvidence.toLocaleLowerCase('ru');
  // Unicode word boundaries: never mistake "состояние" for a "СТО"
  // standard or an ordinary word containing "ГОСТ" for a normative claim.
  const namedNorms=value.match(/(?<![\p{L}\p{N}])(?:ГОСТ(?:\s+[A-Za-zА-Яа-я0-9.\/-]+)?|ISO\s*\d+|ПТЭЭП|СанПиН(?:\s*[\d.]+)?|СНиП|СТО\s+(?:№\s*)?[A-ZА-Я0-9][\w.\/-]*|Приказ\s*[№N]?\s*\d+)(?![\p{L}\p{N}])/giu)||[];
  for(const norm of namedNorms){
    const tag=norm.trim().toLocaleLowerCase('ru');
    if(!facts.includes(tag))
      return {ok:false,message:'ИИ добавил неподтверждённый норматив «'+norm+
        '». Уточните источник; исходная причина сохранена.'};
  }
  const old=stage391ReasonLabels(previous);
  const changedCount=old.labels.length!==incoming.labels.length;
  // Only for a pending, explicitly reviewable change of reason count:
  // validate the actual value with the same numeric/fact/WHY checks.
  // The previous count is checked on the normal path; special changes
  // are never permitted by a bypass that writes without a preview.
  const checked=stage391ValidateReasonProposal(
    changedCount?'':String(previous||''),value,step,sourceEvidence);
  if(!checked.ok)return checked;
  // Never allow a hazard to be laundered through an old, unverified Reason.
  const unsupported=stage391TwiReasonQualityIssues(value,step,sourceEvidence,'')
    .find(x=>x.blockAI&&x.kind==='unconfirmed_consequence');
  if(unsupported)
    return {ok:false,message:'ИИ предложил неподтверждённое последствие: '+unsupported.message};
  const oldValue=stage38ReasonText(String(previous||''));
  if(checked.value===oldValue)
    return {ok:false,message:'ИИ не предложил изменений; исходная причина сохранена.'};
  return {ok:true,value:checked.value,previous:String(previous||''),
    changedCount,oldCount:old.labels.length,newCount:incoming.labels.length,
    echoesRemoved:cleaned.changed};
}
aiFillField=async function stage391SafeReasonField(btn,type,source,applyFn){
  if(type!=='reason')
    return stage391BeforeReasonReviewFill(btn,type,source,applyFn);
  if(['Опубликован','Архив'].includes(state.documentManager?.status)){
    toast('Документ защищён. Создайте новую версию для ИИ-правки.','info');
    return;
  }
  if(!String(source??'').trim()){
    toast('Сначала заполните причину — ИИ дорабатывает черновик.','info');
    return;
  }
  const step=state.steps.find(s=>s.id===Number(btn?.dataset?.id));
  if(!step){toast('Шаг не найден. Исходный СОП сохранён.','warning');return;}
  const guard=aiGuardCapture();
  const oldText=btn.textContent;
  btn.disabled=true;btn.textContent='⏳';
  try{
    // Prefer a single shared WHY when it genuinely covers ALL critical KMs;
    // several numbered WHYs remain valid when distinct facts require them.
    // Existing numbered reasons are never silently collapsed.
    const instruction='\n'+AI_DATA_BOUNDARY+
      '\nЗАДАНИЕ: составь Reason Why как краткую технологическую ЦЕЛЬ уже описанного '+
      'критического приёма. По умолчанию предпочитай ОДНУ краткую общую причину '+
      'без номера, если она объясняет все Key Points и не теряет разных известных обоснований. '+
      'При действительно разных подтверждённых причинах используй 1., 2., 3. '+
      'в одном поле. Число причин не обязано совпадать с числом КМ. '+
      'Пример на основе фактов: если КМ проверяет наличие видимых повреждений инструмента, '+
      'цель — «Позволяет выявить видимые повреждения до использования». '+
      'Не заменяй эту цель цитатами документов, указанием обратиться к инструкциям '+
      'или последствиями, не вытекающими из фактов операции. '+
      'Предыдущая причина — неподтверждённый черновик, не источник фактов. '+
      'Не копируй её нормативные ссылки или предположения. '+
      'Если данных недостаточно даже для такой цели, верни ровно NEEDS_REASON_FACTS. '+
      'Ответ — только готовый текст WHY без заголовков, пояснений и Markdown.';
    const context='DATA BEGIN\n'+JSON.stringify({
      operation:state.meta?.operation||'',
      description:state.description||'',
      action:step.action||'',
      allKeyPoints:(step.keyMoments||[]).filter(Boolean),
      currentReason:stage391ReasonAIDraftForContext(source),
      reasonDraftIsVerified:false,
      formatPreference:'Одна общая причина, если она охватывает все КМ; иначе разные нумерованные'
    })+'\nDATA END';
    // One bounded retry for typical hallucinated consequences or references.
    // Never repair claims by guessing: the model must return a new grounded WHY.
    let inspection=null;
    for(let attempt=0;attempt<2;attempt++){
      const correction=attempt===0?'':(
        '\nПРЕДЫДУЩИЙ ОТВЕТ НЕ ПРОШЁЛ ПРОВЕРКУ: он не объяснил WHY '+
        'из предоставленных фактов. Дай конкретную цель описанного КМ, '+
        'не ссылайся на нормы, внешние документы и неподтверждённые последствия. '+
        'Если оснований нет, ответь NEEDS_REASON_FACTS.'
      );
      const raw=await aiAsk(AI_SYS.reason+instruction+correction,context,{
        model:currentModel,maxTokens:550,task:'edit_reason'
      });
      if(!aiGuardCanApply(guard))return;
      const answer=cleanAIFieldResult(raw,'reason');
      inspection=stage391ReasonAIInspect(source,answer,step);
      if(inspection.ok||/^NEEDS_REASON_FACTS$/iu.test(answer))break;
    }
    if(!inspection?.ok){
      toast('ИИ не смог подтвердить причину. Исходное поле сохранено. '+
        (inspection?.message||'Уточните технологическую цель у специалиста.'),'warning');
      return;
    }
    if(!aiGuardCanApply(guard))return;
    if(['Опубликован','Архив'].includes(state.documentManager?.status)){
      toast('Документ защищён. Создайте новую версию для изменения.','warning');return;
    }
    // Revalidate just before writing, to catch any changed source or AI data.
    const fresh=stage391ReasonAIInspect(source,inspection.value,step);
    if(!fresh.ok||fresh.value!==inspection.value){
      toast('Предложение устарело или не прошло повторную проверку. Исходный текст сохранён.','warning');
      return;
    }
    applyFn(fresh.value);
    stateChanged();renderSteps();
    toast('Причина обновлена ИИ. Проверьте технологический смысл и актуальность TWI.','success');
  }catch(e){
    toast(diagnoseAIError(e),'error');
  }finally{
    btn.disabled=false;btn.textContent=oldText;
  }
};
