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
async function frvStudyBuild(){frvStudySyncFields();const d=ensureFrvStudy(),desc=String(state.description||'').trim();if(!desc)return toast('Сначала заполните «Описание процесса» в редакторе','info');const guard=aiGuardCapture({frv:true});const btn=$('frvStudyBuildBtn');if(btn){btn.disabled=true;btn.textContent='⏳ Строю ФРВ…'}try{const sys=`Ты инженер по фотографии рабочего времени и стандартизированной работе. На основании описания работы выдели только реально наблюдаемые действия, которые можно увидеть или измерить при выполнении операции. Не пиши СОП и не придумывай факты, время, инструменты или требования, которых нет в описании. Одно действие — одна строка наблюдения. Объединяй тесно связанные действия, если они являются одной наблюдаемой операцией. Не дроби предложение на микродвижения.

Верни ТОЛЬКО валидный JSON без markdown, комментариев и пояснений. Главный и единственный массив называется sequence. Для каждой строки обязательно заполни actionRaw и actionNormalized. Остальные поля заполняй только если они прямо следуют из описания, иначе оставляй пустыми или null. durationSec всегда null, если длительность прямо не указана. Формат:
{"sequence":[{"actionRaw":"","actionNormalized":"","activityMode":"Manual|Auto|Walk|Wait|Setup|Other","valueType":"VA|NVA_Necessary|NVA_Waste|WAIT|BREAK|OTHER","qualityKey":"","safetyKey":"","tool":"","material":"","comment":"","lossCode":"","causeCode":"","durationSec":null}]}`;const payload={description:desc};const raw=await aiAsk(sys,JSON.stringify(payload),{model:currentModel,temperature:.1,maxTokens:3500,task:'frv_study_build'});const out=parseFrvAIJson(raw);let seq=Array.isArray(out?.sequence)?out.sequence:(Array.isArray(out?.rows)?out.rows:(Array.isArray(out?.observations)?out.observations:[]));if(!seq.length&&out?.data){seq=Array.isArray(out.data.sequence)?out.data.sequence:(Array.isArray(out.data.rows)?out.data.rows:[])}seq=seq.filter(x=>x&&String(x.actionRaw??x.action??x.actionNormalized??'').trim());if(!seq.length)throw new Error('ИИ не вернул наблюдаемых действий. Повторите запрос или проверьте описание работы.');if(!aiGuardCanApply(guard))return;
const observations=seq.map((x,i)=>{
  const actionRaw=String(x.actionRaw??x.action??x.actionNormalized??'').trim();
  const actionNormalized=String(x.actionNormalized??x.action??actionRaw).trim();
  const row=frvStudyEmptyObservation(i+1);
  // New AI observations are suggestions, NOT measured facts.
  // Even if a model returns a duration, it may never be written as a measurement.
  return {...row,
    actionRaw,actionNormalized,seqNo:i+1,durationSec:null,
    activityMode:FRV_ACTIVITY_MODES.includes(x.activityMode)?x.activityMode:row.activityMode,
    valueType:FRV_VALUE_TYPES.includes(x.valueType)?x.valueType:row.valueType,
    qualityKey:String(x.qualityKey??'').slice(0,800),
    safetyKey:String(x.safetyKey??'').slice(0,800),
    tool:String(x.tool??'').slice(0,800),material:String(x.material??'').slice(0,800),
    comment:String(x.comment??'').slice(0,2000),
    lossCode:FRV_LOSSES.includes(x.lossCode)?x.lossCode:'',
    causeCode:String(x.causeCode??'').slice(0,500)
  };
});
const isExisting=aiFrvHasMeaningfulObservations(d);
if(isExisting){
  const choice=await aiFrvAppendPreview(d,observations);
  if(choice!=='append'){
    toast('ФРВ не изменена.','info');
    return;
  }
  if(!aiGuardCanApply(guard))return;
}
const n=isExisting?Math.max(0,...d.cycles.map(c=>Number(c.cycleNo)||0))+1:1;
const cycle={...frvStudyEmptyCycle(n),observations};
if(isExisting){
  d.cycles.push(cycle); // Preserve references to every old observation and measurement.
  if(d.analysis&&Object.keys(d.analysis).length)d.analysisNeedsReview=true;
}else{
  d.cycles=[cycle];
}
d.status='Observed';
d.validation=null;
saveDraft();renderFrvStudy();
toast(isExisting
  ?'Новые предложения добавлены отдельным циклом ФРВ. Прежние замеры и наблюдения сохранены; проверьте и проанализируйте результат.'
  :'ФРВ построена. Проверьте действия и внесите фактическую длительность по замеру.','success')}catch(e){console.error('[ФРВ] Построение:',e);toast(diagnoseAIError(e),'error')}finally{if(btn){btn.disabled=false;btn.textContent='🤖 Построить ФРВ из описания'}}}
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
  try{
    const observations=d.cycles.flatMap(c=>c.observations.map(o=>({id:o.id,cycleNo:c.cycleNo,seqNo:o.seqNo,actionRaw:o.actionRaw,actionNormalized:o.actionNormalized,durationSec:frvStudyDuration(o),activityMode:o.activityMode,valueType:o.valueType,lossCode:o.lossCode,causeCode:o.causeCode,qualityKey:o.qualityKey,safetyKey:o.safetyKey,tool:o.tool,material:o.material,comment:o.comment,standardCandidate:o.standardCandidate,evidenceId:o.evidenceId})));
    if(!observations.length)return toast('Нет наблюдений для анализа','info');
    const guard=aiGuardCapture({frv:true});
    const sys=`Ты аналитик ФРВ и стандартизированной работы. Анализируй только переданные наблюдения. RAW и фактическую длительность не изменяй и не придумывай отсутствующие факты. Не дроби действия и не создавай новые действия, которых нет в наблюдениях. Для каждого наблюдения, которое пригодно для стандарта, сформируй рекомендацию. Ключевой момент и причина должны быть заполнены только когда они обоснованы самим наблюдением или переданными данными. Потери анализируй отдельно: потеря → причина → мероприятие → ожидаемое сокращение времени. observationId ОБЯЗАТЕЛЬНО должен точно совпадать с id исходного наблюдения. Если данных недостаточно, оставь поле пустым и укажи это в risks.
Верни ТОЛЬКО валидный JSON без markdown:
{"summary":"","losses":[{"observationId":"","lossCode":"","cause":"","countermeasure":"","expectedReductionSec":null}],"standardCandidates":[{"observationId":"","action":"","standardTimeSec":null,"keyMoment":"","reason":"","quality":"","safety":"","tool":"","material":"","sourceCycleNo":null}],"risks":[],"nextMeasurement":""}`;
    const raw=await aiAsk(sys,JSON.stringify({study:frvStudyExport(),observations}),{model:currentModel,temperature:.1,maxTokens:3000,task:'frv_study_analyze'});
    const proposal=frvAiNormalizeAnalysis(parseFrvAIJson(raw),observations);
    if(!aiGuardCanApply(guard))return;
    const choice=await frvAiAnalysisDialog(d,proposal);
    if(choice==='cancel'||!choice){
      toast('Текущие наблюдения и анализ ФРВ сохранены.','info');
      return;
    }
    if(!aiGuardCanApply(guard))return;
    d.analysis=proposal;
    d.analysisNeedsReview=false;
    const changed=frvAiApplyAnalysisRows(d,proposal,choice);
    d.status='Analyzed';
    d.validation=null;
    saveDraft();renderFrvStudy();
    toast('Анализ ФРВ сохранён: '+proposal.standardCandidates.length+
      ' кандидатов. Изменено производных полей: '+changed+
      '. RAW и измеренные секунды не изменены.','success');
  }catch(e){console.error('[ФРВ] Анализ:',e);toast(diagnoseAIError(e),'error')}
}
