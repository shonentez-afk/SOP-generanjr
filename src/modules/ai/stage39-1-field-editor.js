function cleanAIFieldResult(text,type){
  let v=String(text??'').trim();
  if(type==='reason'){
    v=v.replace(/^(?:Reason\s*Why|Reason|Причина|Почему)\s*[:\-–—]?\s*/i,'').trim();
  }
  if(type==='photoHint'){
    v=v.replace(/^(?:Фото|Кадр|Фотография|Визуализация|Вариант)\s*[:\-–—]?\s*/i,'').trim();
    // Keep exactly one recommendation even if an older proxy/model ignores the new instruction.
    v=v.split(/(?:\.\s+|;\s+|\n+)/).map(x=>x.trim()).filter(Boolean)[0]||v;
  }
  return v.replace(/^['"«]|['"»]$/g,'').trim();
}
// Stage39.1: the ✨ beside "Причина" must write WHY, never repeat HOW.
// Only strip a prefix when it EXACTLY matches a Key Point or Important Step.
// Do not paraphrase or invent a consequence; all results still pass the
// existing number, numbering and fact-based checks before being applied.
function stage391StarReasonOnly(text,step){
  const references=[...(Array.isArray(step?.keyMoments)?step.keyMoments:[]),
    step?.action].filter(x=>typeof x==='string'&&x.trim());
  let removed=0;
  const lines=String(text??'').replace(/\r\n?/g,'\n').split('\n');
  const output=[];
  for(const line of lines){
    const match=line.match(/^(\s*(?:\d{1,2}[.)]\s*)?)(.*)$/u);
    if(!match){output.push(line);continue;}
    const label=match[1],body=match[2].trim();
    if(!body){output.push(line);continue;}
    let next=body;
    // Accept only a visually clear "Key Point — Reason Why" construction.
    // A dash inside the actual reason stays untouched. Hyphens in words and
    // equipment part numbers must never be used as separators.
    const separators=/\s+[—–-]\s+|\s*:\s+/gu;
    for(const split of body.matchAll(separators)){
      const prefix=body.slice(0,split.index).trim();
      const cause=body.slice(split.index+split[0].length).trim();
      const same=references.some(ref=>
        stage391TwiPlain(prefix)===stage391TwiPlain(ref));
      if(!same)continue;
      if(!cause||stage391TwiPlain(cause).length<8){
        return {ok:false,message:'ИИ повторил ключевой момент без объяснения «почему». Исходная причина сохранена.'};
      }
      next=cause;
      removed++;
      break;
    }
    output.push(label+next);
  }
  return {ok:true,value:output.join('\n'),removed};
}

async function aiFillField(btn,type,source,applyFn){
  if(['Опубликован','Архив'].includes(state.documentManager?.status)){
    toast('Документ защищён. Создайте новую версию для ИИ-правки.','info');return;
  }
  if(!source||(typeof source==='string'&&!source.trim())){
    toast('Сначала заполните поле — ИИ дорабатывает черновик, а не придумывает его с нуля','info');
    return;
  }
  const stepId=Number(btn.dataset.id||btn.dataset.aiKm);
  const step=state.steps.find(x=>x.id===stepId);
  const guard=aiGuardCapture();
  const originalText=btn.textContent;
  btn.disabled=true;btn.textContent='⏳';
  try{
    // Stage39.1: a selected Key Point needs the action, neighbouring points
    // and the current (possibly multi-line) Reasons Why for context.
    const context=step&&['km','reason'].includes(type)?
      'DATA BEGIN\n'+JSON.stringify({
        operation:state.meta?.operation||'',
        description:state.description||'',
        action:step.action,
        allKeyPoints:step.keyMoments.filter(Boolean),
        reason:step.reason,
        selectedKeyPointIndex:type==='km'?Number(btn.dataset.ki):null,
        currentText:String(source)
      })+'\nDATA END':String(source);
    const instruction=type==='km'?
      '\nКорпоративное правило: причины относятся к критическим Key Points и хранятся ОДНИМ полем. Не меняй другие Key Points и Reasons. Если новая формулировка изменила бы смысл существующих причин, верни исходный Key Point без изменения. Не выдумывай параметры.':
      type==='reason'?
      '\nКнопка ✨ редактирует ТОЛЬКО Reasons Why. Верни СТРОГО объяснения ПОЧЕМУ, без текста Key Points и без конструкции «КМ — причина». Плохо: «1. Проверить кабель на повреждения — предотвращает риск». Хорошо: «1. Снижает риск при использовании повреждённого кабеля» (только если риск подтверждён исходными фактами). Не повторяй ни одно действие или критический приём в начале причины. Корпоративное правило: одно поле Reason на шаг. Общая причина может быть без номера; несколько причин — строго отдельными строками 1., 2., 3. Сохрани имеющиеся номера и количество причин, не заменяй отдельные причины общей. Не добавляй параметры или последствия, которых нет в фактическом контексте. Если причина не подтверждена, не сочиняй её.':
      '';
    const raw=await aiAsk(AI_SYS[type]+instruction,context,{
      model:currentModel,maxTokens:type==='reason'?1200:400,task:'edit_'+type
    });
    const result=cleanAIFieldResult(raw,type);
    if(!result)throw new Error('ИИ вернул пустой текст');
    if(!aiGuardCanApply(guard))return;
    let safe=result;
    if(step&&type==='reason'){
      const extracted=stage391StarReasonOnly(result,step);
      if(!extracted.ok){toast(extracted.message,'warning');return;}
      const check=stage391RejectInvalidReason(String(source),extracted.value,step);
      if(!check.ok)return;
      safe=check.value;
    }else if(step&&type==='km'){
      const check=stage391ValidateKeyPointProposal(result,step);
      if(!check.ok){toast(check.message,'warning');return;}
      safe=check.value;
    }else if(step&&type==='action'){
      const check=stage391ValidateTextProposal(result,step);
      if(!check.ok){toast(check.message,'warning');return;}
      safe=check.value;
    }
    applyFn(safe);
    renderSteps();stateChanged();
    toast(type==='km'?'Ключевой момент доработан. Проверьте соответствие записанным причинам.':'Поле обновлено ИИ');
  }catch(e){toast(diagnoseAIError(e),'error')}
  finally{btn.disabled=false;btn.textContent=originalText}
}
