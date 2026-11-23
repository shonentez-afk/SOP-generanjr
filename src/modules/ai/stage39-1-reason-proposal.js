// Stage39.1: safe ✨ Reasons proposal. This is deliberately an independent
// overlay: the accepted Stage39 Reason handler and the manual "Убрать повтор КМ"
// tool remain unchanged. No generated response writes to SOP without consent.
const stage391BeforeReasonReviewFill=aiFillField;

function stage391ReasonAIInspect(previous,proposed,step){
  if(typeof proposed!=='string'||!proposed.trim())
    return {ok:false,message:'ИИ вернул пустую причину; исходный текст сохранён.'};
  // Reuse the already accepted exact-Key-Point cleanup logic for the
  // *proposal only*. The operator must see and approve the final wording.
  const cleaned=stage391CleanupReason(proposed,step);
  const value=stage38ReasonText(cleaned.after,2000);
  if(!value||/^(?:keep|null|undefined|none|n\/a)$/iu.test(value))
    return {ok:false,message:'ИИ вернул служебное значение вместо причины.'};
  const lines=value.split('\n').filter(s=>s.trim());
  const incoming=stage391ReasonLabels(value);
  if(lines.length>1&&!incoming.labels.length)
    return {ok:false,message:'Несколько причин необходимо нумеровать 1., 2. и т. д. в одном поле.'};
  const shape=stage391ReasonShape(value);
  if(!shape.ok)return {ok:false,message:shape.message};
  // New normative claims are not substantiated by the system reference list.
  // Only references actually present in the user's document/context count.
  const facts=stage391FactCorpus(step).toLocaleLowerCase('ru');
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
    changedCount?'':String(previous||''),value,step);
  if(!checked.ok)return checked;
  const oldValue=stage38ReasonText(String(previous||''));
  if(checked.value===oldValue)
    return {ok:false,message:'ИИ не предложил изменений; исходная причина сохранена.'};
  return {ok:true,value:checked.value,previous:String(previous||''),
    changedCount,oldCount:old.labels.length,newCount:incoming.labels.length,
    echoesRemoved:cleaned.changed};
}
function stage391ReasonAIReviewDetails(inspection,step){
  const old=escapeHtml(inspection.previous||'(пусто)');
  const revised=escapeHtml(inspection.value);
  const note=inspection.changedCount?
    '<p style="color:#9a3412;font-weight:600;margin:0 0 10px;">'+
    'Меняется количество причин: '+
    (inspection.oldCount||'одна общая')+' → '+
    (inspection.newCount||'одна общая')+
    '. Проверьте, что важные обоснования не потеряны.</p>':'';
  const echo=inspection.echoesRemoved?
    '<p style="color:#475569;margin:0 0 10px;">Удалено точных повторов КМ из предложения ИИ: '+
    inspection.echoesRemoved+' (проверяйте смысл).</p>':'';
  const panel=(name,value)=>'<section style="min-width:0;">'+
    '<p style="font-weight:700;font-size:13px;margin:0 0 5px;">'+name+'</p>'+
    '<pre style="font-family:inherit;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;'+
    'padding:12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:9px;'+
    'min-height:90px;margin:0;">'+value+'</pre></section>';
  return note+echo+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));'+
    'gap:12px;margin-bottom:10px;">'+
    panel('Было',old)+panel('Стало',revised)+'</div>'+
    '<p style="font-size:12px;color:#92400e;">Контроль ИИ не подтверждает технологическую '+
    'достоверность причин. Проверьте их по фактам операции и инструкции оборудования.</p>';
}
function stage391ReasonAIReviewModal(inspection,step){
  const pending=aiReviewChoiceModal({
    id:'stage391ReasonAIReview',
    title:'Предложение ИИ: причины TWI',
    intro:'ИИ предлагает изменить только поле «Причина» шага «'+
      String(step.action||'').slice(0,90)+'». Документ не изменится без вашего подтверждения.',
    details:stage391ReasonAIReviewDetails(inspection,step),
    choices:[
      {action:'cancel',label:'Оставить как было'},
      {action:'apply',label:'Применить к причине',primary:true}
    ]
  });
  // Use the existing shared review modal, with the same fixed-height footer
  // behavior as our user-approved manual cleanup preview. This affects only
  // the current modal instance; it cannot change other FRV/TWI dialogs.
  const root=document.getElementById('stage391ReasonAIReview');
  if(root){
    root.style.padding='8px';
    const dialog=root.querySelector('[role="dialog"]');
    if(dialog){
      Object.assign(dialog.style,{
        display:'flex',flexDirection:'column',
        maxHeight:'calc(100vh - 16px)',overflow:'hidden'
      });
      const content=dialog.children[2];
      if(content)Object.assign(content.style,{
        flex:'1 1 auto',minHeight:'0',maxHeight:'none',
        overflowY:'auto',overflowX:'hidden'
      });
      const footer=dialog.lastElementChild;
      if(footer)Object.assign(footer.style,{
        flex:'0 0 auto',background:'#fff',
        paddingBottom:'2px'
      });
    }
  }
  return pending;
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
      '\nРаботай только с Reason Why. По умолчанию предпочитай ОДНУ краткую общую '+
      'причину без номера, ЕСЛИ она действительно объясняет все критичные Key Points. '+
      'Если есть несколько разных подтверждённых обоснований, верни строки 1., 2. и т. д. '+
      'в одном поле. Число причин не обязано совпадать с числом КМ. '+
      'Не повторяй тексты действий/Key Points. Не придумывай нормативы, травмы, '+
      'перегрев, допуски или числовые параметры. '+
      'Не скрывай уникальные причины из исходного текста: если их невозможно '+
      'сохранить в одной общей формулировке, предложи несколько. '+
      'Ответ — ТОЛЬКО текст причины, без заголовка, пояснений и Markdown.';
    const context='DATA BEGIN\n'+JSON.stringify({
      operation:state.meta?.operation||'',
      description:state.description||'',
      action:step.action||'',
      allKeyPoints:(step.keyMoments||[]).filter(Boolean),
      currentReason:String(source),
      formatPreference:'Одна общая причина, если она охватывает все КМ; иначе разные нумерованные'
    })+'\nDATA END';
    const raw=await aiAsk(AI_SYS.reason+instruction,context,{
      model:currentModel,maxTokens:550,task:'edit_reason'
    });
    if(!aiGuardCanApply(guard))return;
    const answer=cleanAIFieldResult(raw,'reason');
    const inspection=stage391ReasonAIInspect(source,answer,step);
    if(!inspection.ok){toast(inspection.message,'warning');return;}
    const choice=await stage391ReasonAIReviewModal(inspection,step);
    if(choice!=='apply')return;
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
    toast('Изменение причины применено после подтверждения. Проверьте актуальность TWI.','success');
  }catch(e){
    toast(diagnoseAIError(e),'error');
  }finally{
    btn.disabled=false;btn.textContent=oldText;
  }
};
