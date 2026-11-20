function parseFrvAIJson(raw){
  let s=String(raw??'').trim();
  s=s.replace(/```(?:json|JSON)?/g,'').replace(/```/g,'').trim();
  // Частая ошибка моделей: экранированные двоеточия вне строк (\:).
  s=s.replace(/\\:/g,':');
  // Берём первый полноценный JSON-объект, игнорируя пояснения модели до/после него.
  const first=s.indexOf('{');
  if(first<0) throw new Error('ИИ не вернул JSON-объект');
  let depth=0,inString=false,escaped=false,end=-1;
  for(let i=first;i<s.length;i++){
    const ch=s[i];
    if(inString){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0){end=i+1;break;}
    }
  }
  if(end<0) throw new Error('ИИ вернул незавершённый JSON');
  let json=s.slice(first,end)
    .replace(/,\s*([}\]])/g,'$1')
    .replace(/\u00a0/g,' ');
  try{
    const obj=JSON.parse(json);
    if(!obj || typeof obj!=='object' || Array.isArray(obj)) throw new Error('Ожидался JSON-объект');
    return obj;
  }catch(firstErr){
    // Безопасный второй проход только для типовых артефактов вывода модели.
    json=json.replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g,'$1"$2":');
    try{
      const obj=JSON.parse(json);
      if(!obj || typeof obj!=='object' || Array.isArray(obj)) throw new Error('Ожидался JSON-объект');
      return obj;
    }catch(e){
      throw new Error('ИИ вернул некорректный JSON: '+firstErr.message);
    }
  }
}
async function frvStudyBuild(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),desc=String(d.processDescription||'').trim();
  if(!desc)return toast('Сначала опишите работу в поле «Что изучаем» — прямо в Анализе ФРВ.','info');
  const guard=aiGuardCapture({frv:true}),btn=$('frvStudyBuildBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Предлагаю действия…'}
  try{
    const system='Ты наблюдатель ФРВ на промышленном предприятии. '+
      'На основе только данного описания предложи короткий перечень наблюдаемых действий. '+
      'Это черновик, а НЕ реальные измерения. Не придумывай время, инструменты, '+
      'нормативы, требования безопасности, которых нет в описании. '+
      'Не дроби одно действие на микродвижения. Отвечай строго JSON: '+
      '{"sequence":[{"actionRaw":"","actionNormalized":"","activityMode":"Manual",'+
      '"valueType":"OTHER","tool":"","material":"","qualityKey":"","safetyKey":""}]}';
    const raw=await aiAsk(system,JSON.stringify({description:desc}),{
      model:currentModel,temperature:.1,maxTokens:2400,task:'frv_study_build'});
    const obj=parseFrvAIJson(raw);
    let seq=Array.isArray(obj.sequence)?obj.sequence:
      (Array.isArray(obj.rows)?obj.rows:[]);
    seq=seq.filter(o=>o&&typeof o==='object'&&String(o.actionRaw||o.action||'').trim()).slice(0,100);
    if(!seq.length)throw new Error('ИИ не предложил наблюдаемых действий. Уточните описание или введите действия вручную.');
    if(!aiGuardCanApply(guard))return;
    // The model is never allowed to fabricate measured cycles or durations.
    d.suggestedActions=seq.map(o=>({
      actionRaw:String(o.actionRaw||o.action||'').trim().slice(0,1000),
      actionNormalized:String(o.actionNormalized||'').slice(0,1000),
      activityMode:FRV_ACTIVITY_MODES.includes(o.activityMode)?o.activityMode:'Manual',
      valueType:FRV_VALUE_TYPES.includes(o.valueType)?o.valueType:'OTHER',
      tool:typeof o.tool==='string'?o.tool.slice(0,300):'',
      material:typeof o.material==='string'?o.material.slice(0,300):'',
      qualityKey:typeof o.qualityKey==='string'?o.qualityKey.slice(0,300):'',
      safetyKey:typeof o.safetyKey==='string'?o.safetyKey.slice(0,300):'',
      durationSec:null,source:'AI-draft'
    }));
    saveDraft();renderFrvStudy();
    toast('Показаны черновые действия. Добавьте нужные в наблюдения и проведите реальные замеры.','success');
  }catch(e){console.error('[ФРВ] Предложения действий:',e);toast(diagnoseAIError(e),'error')}
  finally{if(btn){btn.disabled=false;btn.textContent='🤖 Предложить действия'}}
}

async function frvStudySuggestRow(ci,oi){
  frvStudySyncFields();
  const d=ensureFrvStudy(),o=d.cycles[ci]?.observations[oi];
  if(!o)return;
  const guard=aiGuardCapture({frv:true});
  const b=document.querySelector(`[data-frvs-suggest="${ci}:${oi}"]`);
  const old=b?.textContent;
  if(b){b.disabled=true;b.textContent='⏳ Подсказка…';}
  try{
    const system=`Ты помощник аналитика ФРВ производственного предприятия. Анализируй только переданное фактическое действие. Не изменяй RAW и фактическую длительность. Не придумывай отсутствующие факты. Верни ТОЛЬКО один валидный JSON-объект без markdown, пояснений и комментариев.
Поля:
{"actionNormalized":"","valueType":"VA|NVA_Necessary|NVA_Waste|WAIT|BREAK|OTHER","activityMode":"Manual|Auto|Walk|Wait|Setup|Other","lossCode":"","causeCode":"","qualityKey":"","safetyKey":"","keyMoment":"","reason":"","standardCandidate":false}
keyMoment — только действительно важная деталь выполнения шага. reason — кратко почему эта деталь важна. Если оснований недостаточно, оставь поля пустыми. Не придумывай нормативы, значения, СИЗ или требования.`;
    const raw=await aiAsk(system,JSON.stringify({actionRaw:String(o.actionRaw||''),durationSec:o.durationSec==null?null:Number(o.durationSec)}),{model:currentModel,temperature:.1,maxTokens:1000,task:'frv_study_row_suggest'});
    const proposal=frvAiRowProposal(parseFrvAIJson(raw));
    if(!aiGuardCanApply(guard))return;
    if(!frvAiRowChanges(o,proposal).length){
      toast('Новых изменений для строки ФРВ нет.','info');
      return;
    }
    const choice=await frvAiRowDialog(o,proposal);
    if(choice==='cancel'||!choice){
      toast('Предложение ИИ не применено.','info');
      return;
    }
    if(!aiGuardCanApply(guard))return;
    const count=frvAiApplyRow(o,proposal,choice);
    if(count){
      d.validation=null;
      if(d.analysis&&Object.keys(d.analysis).length)d.analysisNeedsReview=true;
      saveDraft();renderFrvStudy();
      toast('Применены предложения ИИ для '+count+' полей ФРВ. Факты и время не изменены.','success');
    }else{
      toast('Нечего применять: существующие поля сохранены.','info');
    }
  }catch(e){console.error('[ФРВ] Подсказка строки:',e);toast(diagnoseAIError(e),'error')}
  finally{if(b){b.disabled=false;b.textContent=old||'🤖 Подсказать';}}
}
async function frvStudyAnalyze(){
  frvStudySyncFields();
  const d=ensureFrvStudy();
  const observed=d.cycles.flatMap(c=>c.observations.map(o=>({
    id:o.id,cycleNo:c.cycleNo,seqNo:o.seqNo,actionRaw:String(o.actionRaw||'').trim(),
    actionNormalized:o.actionNormalized,
    durationSec:frvStudyMeasuredDuration(o),activityMode:o.activityMode,
    valueType:o.valueType,lossCode:o.lossCode,causeCode:o.causeCode,
    qualityKey:o.qualityKey,safetyKey:o.safetyKey,tool:o.tool,material:o.material,
    comment:o.comment,standardCandidate:o.standardCandidate,evidenceId:o.evidenceId
  })));
  const observations=observed.filter(o=>o.actionRaw&&o.durationSec!==null&&o.durationSec>0);
  if(!observations.length)return toast('Нужен хотя бы один реально замеренный шаг.','warning');
  const fingerprint=JSON.stringify(d.cycles);
  const guard=aiGuardCapture({frv:true}),btn=$('frvStudyAnalyzeBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Ищу улучшения…'}
  try{
    const system='Ты инженер по фотографии рабочего времени. Используй ТОЛЬКО '+
      'реальные наблюдения и секунды. Не подменяй RAW/время, не создавай действия. '+
      'Анализируй ценность, потери и возможные меры, не придумывай нормативное время. '+
      'Для кандидатов стандартной работы записывай observationId строго из данных; '+
      'если основания для ключевого момента или причины недостаточны, оставь пусто. '+
      'Ожидаемый эффект только оценка (не факт), указать неопределённость в risks. '+
      'Верни ТОЛЬКО JSON вида '+
      '{"summary":"","losses":[{"observationId":"","lossCode":"","cause":"",'+
      '"countermeasure":"","expectedReductionSec":null}],'+
      '"standardCandidates":[{"observationId":"","action":"","standardTimeSec":null,'+
      '"keyMoment":"","reason":"","quality":"","safety":"","tool":"","material":"",'+
      '"sourceCycleNo":null}],"risks":[],"nextMeasurement":""}';
    const raw=await aiAsk(system,JSON.stringify({
      research:{description:d.processDescription,workplace:d.workplace,operator:d.operator},
      observations,unmeasuredCount:observed.length-observations.length
    }),{model:currentModel,temperature:.1,maxTokens:3000,task:'frv_study_analyze'});
    const proposal=frvAiNormalizeAnalysis(parseFrvAIJson(raw),observations);
    if(!aiGuardCanApply(guard))return;
    if(JSON.stringify(d.cycles)!==fingerprint){
      toast('Замеры изменились во время работы ИИ. Проверьте данные и повторите анализ.','warning');
      return;
    }
    const choice=await frvAiAnalysisDialog(d,proposal);
    if(!choice||choice==='cancel'){
      toast('Замеры и предыдущий анализ не изменены.','info');return;
    }
    if(!aiGuardCanApply(guard)||JSON.stringify(d.cycles)!==fingerprint){
      toast('Замеры изменились, ответ ИИ не применён.','warning');return;
    }
    d.analysis=proposal;d.analysisNeedsReview=false;
    const changed=frvAiApplyAnalysisRows(d,proposal,choice);
    d.status='Analyzed';d.validation=null;
    saveDraft();renderFrvStudy();
    toast('Рекомендации сохранены, измерения не менялись. Производных полей: '+changed,'success');
  }catch(e){console.error('[ФРВ] Анализ:',e);toast(diagnoseAIError(e),'error')}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ Предложить улучшения с ИИ'}}
}
