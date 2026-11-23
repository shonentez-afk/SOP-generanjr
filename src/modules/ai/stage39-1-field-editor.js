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
      '\nКорпоративное правило: одно поле Reason на шаг. Общая причина может быть без номера; несколько причин — строго отдельными строками 1., 2., 3. Сохрани имеющиеся номера и количество причин, не заменяй отдельные причины общей. Не добавляй параметры, которых нет в фактическом контексте.':
      '';
    const raw=await aiAsk(AI_SYS[type]+instruction,context,{
      model:currentModel,maxTokens:type==='reason'?1200:400,task:'edit_'+type
    });
    const result=cleanAIFieldResult(raw,type);
    if(!result)throw new Error('ИИ вернул пустой текст');
    if(!aiGuardCanApply(guard))return;
    let safe=result;
    if(step&&type==='reason'){
      const check=stage391RejectInvalidReason(String(source),result,step);
      if(!check.ok)return;
      safe=check.value;
    }else if(step&&type==='km'){
      const check=stage391ValidateKeyPointProposal(result,step);
      if(!check.ok){toast(check.message,'warning');return;}
      safe=check.value;
    }
    applyFn(safe);
    renderSteps();stateChanged();
    toast(type==='km'?'Ключевой момент доработан. Проверьте соответствие записанным причинам.':'Поле обновлено ИИ');
  }catch(e){toast(diagnoseAIError(e),'error')}
  finally{btn.disabled=false;btn.textContent=originalText}
}
