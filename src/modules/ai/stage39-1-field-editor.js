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
// The ✨ 'Причина' action is restored to accepted Stage39 behavior.
// Other Stage39.1 AI edits (Key Points, Action) remain unchanged.
async function stage391AcceptedReasonFill(btn,type,source,applyFn){if(!source||(typeof source==='string'&&!source.trim())){toast('Сначала заполните поле — ИИ дорабатывает черновик, а не придумывает его с нуля','info');return}const guard=aiGuardCapture();const old=btn.textContent;btn.disabled=true;btn.textContent='⏳';try{const step=state.steps.find(x=>x.id===Number(btn.dataset.id));const ctx=type==='reason'&&step?`Действие: ${step.action}\nKey Points: ${step.keyMoments.filter(Boolean).join('; ')}\nТекущий Reason: ${source}`:String(source);const rawResult=await aiAsk(AI_SYS[type],ctx,{model:currentModel,maxTokens:400,task:`edit_${type}`});const result=cleanAIFieldResult(rawResult,type);if(!result)throw new Error('ИИ вернул пустой текст');if(!aiGuardCanApply(guard))return;applyFn(result);renderSteps();stateChanged();toast('Поле обновлено ИИ')}catch(e){toast(diagnoseAIError(e),'error')}finally{btn.disabled=false;btn.textContent=old}}

async function aiFillField(btn,type,source,applyFn){
  if(['Опубликован','Архив'].includes(state.documentManager?.status)){
    toast('Документ защищён. Создайте новую версию для ИИ-правки.','info');return;
  }
  if(type==='reason')return stage391AcceptedReasonFill(btn,type,source,applyFn);
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
    const context=step&&type==='km'?
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
      '';
    const raw=await aiAsk(AI_SYS[type]+instruction,context,{
      model:currentModel,maxTokens:400,task:'edit_'+type
    });
    const result=cleanAIFieldResult(raw,type);
    if(!result)throw new Error('ИИ вернул пустой текст');
    if(!aiGuardCanApply(guard))return;
    let safe=result;
    if(step&&type==='km'){
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
