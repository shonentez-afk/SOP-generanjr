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
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
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
      saveDraft();frvStudyQueuePersist();renderFrvStudy();
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
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
    toast('Рекомендации сохранены, измерения не менялись. Производных полей: '+changed,'success');
  }catch(e){console.error('[ФРВ] Анализ:',e);toast(diagnoseAIError(e),'error')}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ Предложить улучшения с ИИ'}}
}

// Stage35: evidence signature for a suggested category. It includes the
// actual action, measured seconds, comment and current user category. This
// prevents confirming a stale suggestion after the observation was edited.
function frv35AiEvidenceKey(o){
  return JSON.stringify([String(o?.actionRaw||''),
    frvStudyMeasuredDuration(o),String(o?.comment||''),
    String(o?.valueType||'OTHER')]);
}
// Stage34: one optional, reviewable *batch* AI classification.
// The model receives texts and measured seconds only as readonly evidence.
// Its response never sets durationSec, actionRaw or SOP approval.
async function frv34SuggestClassifications(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),observations=d.cycles.flatMap(c=>(c.observations||[]))
    .filter(o=>String(o.actionRaw||'').trim()&&frvStudyMeasuredDuration(o)!==null)
    .map(o=>({id:o.id,actionRaw:o.actionRaw,durationSec:frvStudyMeasuredDuration(o),
      currentType:o.valueType,comment:o.comment||'',lossCode:o.lossCode||''}));
  if(!observations.length)return toast('Сначала запишите фактические действия и замеры.','warning');
  const fingerprint=JSON.stringify(d.cycles);
  const guard=aiGuardCapture({frv:true}),btn=$('frvStudyClassifyBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Проверяю действия…'}
  try{
    const system='Ты помощник инженера для ФРВ на заводе. Прочитай реальные действия, '+
      'предложи вероятную категорию времени для каждого, объясни сомнительные места. '+
      'Категории: VA (ценность), NVA_Necessary (М2), NVA_Waste (М1), WAIT (ожидание), '+
      'BREAK (регламентированный перерыв), OTHER (не определено). '+
      'Если без фактов нельзя решить, оставь OTHER и напиши «требует проверки». '+
      'Не придумывай измерения, нормы, причины и эффект. '+
      'Возвращай ТОЛЬКО JSON вида {"classifications":[{"observationId":"",'+
      '"valueType":"OTHER","lossCode":"","causeCode":"","reason":"",'+
      '"confidence":"low"}]}. observationId только из входных данных.';
    const raw=await aiAsk(system,JSON.stringify({observations}),{
      model:currentModel,temperature:.1,maxTokens:2600,task:'frv_study_classify'});
    const obj=parseFrvAIJson(raw),allowed=new Set(observations.map(o=>o.id));
    const proposed=Array.isArray(obj.classifications)?obj.classifications:[];
    const results=[];
    const seen=new Set();
    for(const proposal of proposed){
      const id=proposal?.observationId;
      if(!allowed.has(id)||seen.has(id)||!FRV_VALUE_TYPES.includes(proposal.valueType))
        continue;
      const source=d.cycles.flatMap(c=>c.observations).find(o=>o.id===id);
      if(!source)continue;
      seen.add(id);
      results.push({observationId:id,action:source.actionRaw,
        valueType:proposal.valueType,
        lossCode:['NVA_Waste','WAIT'].includes(proposal.valueType)&&
          FRV_LOSSES.includes(proposal.lossCode)?proposal.lossCode:'',
        causeCode:String(proposal.causeCode||'').slice(0,180),
        reason:String(proposal.reason||'').slice(0,350),
        confidence:['high','medium','low'].includes(proposal.confidence)?
          proposal.confidence:'low',
        sourceEvidenceKey:frv35AiEvidenceKey(source)});
    }
    if(!results.length)throw new Error('ИИ не дал проверяемых классификаций');
    if(!aiGuardCanApply(guard)||JSON.stringify(d.cycles)!==fingerprint){
      toast('Наблюдения изменились; предложения ИИ не сохранены.','warning');return;
    }
    // Explicit row-by-row confirmation is required in the analysis panel.
    d.aiClassifications=results;
    saveDraft();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
    toast('Показано предложений классификации: '+results.length+
      '. Проверьте и подтвердите нужные категории.','success');
  }catch(e){console.error('[FRV AI classify]',e);toast(diagnoseAIError(e),'error')}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ Классифицировать с ИИ'}}
}
(function bindFrv34AI(){
  $('frvStudyClassifyBtn')?.addEventListener('click',frv34SuggestClassifications);
})();
