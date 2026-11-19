async function generateSOP(){
  if(['Опубликован','Архив'].includes(state.documentManager?.status)){
    toast('Документ защищён от редактирования. Создайте новую версию.','info');return;
  }
  const d=$('meta-description').value.trim();
  if(!d)return toast('Заполните «Описание процесса»','info');
  const guard=aiGuardCapture();
  const b=$('generateSopBtn'),old=b.innerHTML;
  b.disabled=true;b.innerHTML='⏳ Генерация…';
  try{
    const facts={
      operation:$('meta-operation').value,department:$('meta-department').value,
      workplace:$('meta-workplace').value,executor:$('meta-executor').value,
      tools:$('meta-tools').value,material:$('meta-material').value,
      safety:$('meta-safety').value,userDescription:d
    };
    const ctx='DATA BEGIN\n'+JSON.stringify(facts)+'\nDATA END';
    const checked=stage29SopNormalize(validateGeneratedSop(aiReadTaskObject(
      await aiAsk(STAGE29_SOP_PROMPT,ctx,
        {model:currentModel,temperature:.2,maxTokens:3700,task:'generate_sop'}),'generate_sop')),facts);
    const sop=checked.sop;
    if(!aiGuardCanApply(guard))return;
    let choice='replace';
    if(aiSopHasMeaningfulSteps()){
      choice=await aiSopPlanPreview(sop);
      if(choice==='cancel'||!choice){
        toast('Текущий СОП оставлен без изменений.','info');
        return;
      }
      if(!aiGuardCanApply(guard))return;
    }
    // Construct fresh step objects only after the user confirms the operation.
    const additions=sop.steps.map(s=>({
      id:++stepIdCounter,action:s.action,
      keyMoments:s.keyMoments.length?s.keyMoments:[''],
      reason:s.reason,durationSeconds:parseDuration(s.time),
      successCriteria:s.success_criteria,decisionPoints:s.decision_points,
      commonPitfalls:s.common_pitfalls,visualMarkers:s.visual_markers,
      photoHint:s.visual_markers.join('. '),
      imageData:null,imageBuffer:null,imageExt:null,
      frv:{vdc:false,m2:'',m1:'',move:'',comment:''}
    }));
    if(choice==='append'){
      state.steps.push(...additions);
      const questions=[...(Array.isArray(state.openQuestions)?state.openQuestions:[]),
        ...(Array.isArray(sop.openQuestions)?sop.openQuestions:[])];
      state.openQuestions=[...new Set(questions.map(q=>String(q).trim()).filter(Boolean))].slice(0,50);
      const ids=Array.isArray(sop.isoIconIds)?sop.isoIconIds:[];
      state.safetyIconIds=[...new Set([...(state.safetyIconIds||[]),...ids])]
        .filter(id=>ICON_LIB.some(x=>x.id===id));
    }else{
      // Complete replacement is an explicit choice in the comparison dialog.
      state.openQuestions=Array.isArray(sop.openQuestions)?sop.openQuestions:[];
      if(sop.department)setVal('meta-department',sop.department);
      if(sop.workplace)setVal('meta-workplace',sop.workplace);
      if(sop.executor)setVal('meta-executor',sop.executor);
      if(sop.safety)setVal('meta-safety',sop.safety);
      if(sop.tools)setVal('meta-tools',sop.tools);
      if(sop.material)setVal('meta-material',sop.material);
      state.safetyIconIds=(Array.isArray(sop.isoIconIds)?sop.isoIconIds:[])
        .filter(id=>ICON_LIB.some(x=>x.id===id));
      state.steps=additions;
      htmlFieldToState();
    }
    state.description=d;
    stateChanged();
    toast(choice==='append'
      ?'Добавлено шагов из ИИ: '+additions.length+'. Существующие шаги и фотографии сохранены.'
      :'СОП составлен: '+state.steps.length+' шагов. Проверьте и откорректируйте.'+
       (state.openQuestions.length?' Есть вопросов для уточнения: '+state.openQuestions.length+'.':''));
  }catch(e){
    if(e?.task==='generate_sop'&&e?.detail)
      toast('СОП не изменён. Уточните исходное описание: '+e.detail,'warning');
    else toast(diagnoseAIError(e),'error');
  }finally{
    b.disabled=false;b.innerHTML=old;
  }
}
async function generatePhotoHint(id){const s=state.steps.find(x=>x.id===id);if(!s)return;const guard=aiGuardCapture();try{const rawTxt=await aiAsk(AI_SYS.photoHint,`Действие: ${s.action}\nКлючевые моменты: ${s.keyMoments.filter(Boolean).join('; ')}\nКритерий результата: ${s.successCriteria||'(не задан)'}`,{model:currentModel,maxTokens:300,task:'photo_hint'});const txt=cleanAIFieldResult(rawTxt,'photoHint');if(!txt)throw new Error('ИИ не вернул подсказку для фото');if(!aiGuardCanApply(guard))return;s.photoHint=txt;renderSteps();stateChanged();toast('Подсказка для фото готова')}catch(e){toast(diagnoseAIError(e),'error')}}

