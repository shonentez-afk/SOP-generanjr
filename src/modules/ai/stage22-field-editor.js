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
async function aiFillField(btn,type,source,applyFn){if(!source||(typeof source==='string'&&!source.trim())){toast('Сначала заполните поле — ИИ дорабатывает черновик, а не придумывает его с нуля','info');return}const guard=aiGuardCapture();const old=btn.textContent;btn.disabled=true;btn.textContent='⏳';try{const step=state.steps.find(x=>x.id===Number(btn.dataset.id));const ctx=type==='reason'&&step?`Действие: ${step.action}\nKey Points: ${step.keyMoments.filter(Boolean).join('; ')}\nТекущий Reason: ${source}`:String(source);const rawResult=await aiAsk(AI_SYS[type],ctx,{model:currentModel,maxTokens:400,task:`edit_${type}`});const result=cleanAIFieldResult(rawResult,type);if(!result)throw new Error('ИИ вернул пустой текст');if(!aiGuardCanApply(guard))return;applyFn(result);renderSteps();stateChanged();toast('Поле обновлено ИИ')}catch(e){toast(diagnoseAIError(e),'error')}finally{btn.disabled=false;btn.textContent=old}}

