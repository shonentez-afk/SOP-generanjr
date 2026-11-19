// Stage26: FRV AI is advisory. RAW observations, times and their evidence are read-only.
const FRV_AI_ROW_FIELDS=[
  ['actionNormalized','Нормализованное действие'],
  ['activityMode','Режим выполнения'],['valueType','Ценность'],
  ['lossCode','Код потери'],['causeCode','Причина потери'],
  ['keyMoment','Ключевой момент'],['reason','Почему это важно'],
  ['qualityKey','Качество'],['safetyKey','Безопасность'],
  ['tool','Инструмент'],['material','Материал']
];
const FRV_AI_ANALYSIS_FIELDS=[
  ['actionNormalized','action','Нормализованное действие'],
  ['keyMoment','keyMoment','Ключевой момент'],
  ['reason','reason','Почему это важно'],
  ['qualityKey','quality','Качество'],
  ['safetyKey','safety','Безопасность'],
  ['tool','tool','Инструмент'],['material','material','Материал']
];
function frvAiText(value,max=1000){
  if(typeof value!=='string')return '';
  const text=value.trim();
  return /^(?:null|undefined|none|n\/a|не указано)$/i.test(text)?'':text.slice(0,max);
}
function frvAiRowProposal(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw aiTaskSchemaError('frv_study_row_suggest','incomplete','expected object');
  const out={};
  for(const [field] of FRV_AI_ROW_FIELDS){
    const v=frvAiText(raw[field]);
    if(!v)continue;
    if(field==='valueType'&&!FRV_VALUE_TYPES.includes(v))continue;
    if(field==='activityMode'&&!FRV_ACTIVITY_MODES.includes(v))continue;
    if(field==='lossCode'&&!FRV_LOSSES.includes(v))continue;
    out[field]=v;
  }
  if(typeof raw.standardCandidate==='boolean')out.standardCandidate=raw.standardCandidate;
  if(!Object.keys(out).length)
    throw aiTaskSchemaError('frv_study_row_suggest','incomplete','no usable fields');
  return out;
}
function frvAiRowChanges(row,proposal){
  return Object.entries(proposal).filter(([name,value])=>
    String(row?.[name]??'')!==String(value)).map(([field,value])=>({
      field,old:row?.[field]??'',value,
      label:FRV_AI_ROW_FIELDS.find(item=>item[0]===field)?.[1]||'Кандидат в стандарт'
    }));
}
function frvAiMayFill(row,field){
  const v=row?.[field];
  return v===null||v===undefined||v===''||
    (field==='standardCandidate'&&v===false)||
    (field==='valueType'&&v==='OTHER')||
    (field==='activityMode'&&v==='Manual');
}
function frvAiApplyRow(row,proposal,mode){
  if(mode!=='fill'&&mode!=='replace')return 0;
  let count=0;
  for(const [field,value] of Object.entries(proposal)){
    // A strict allow-list: never touch actionRaw, durationSec, evidence, id,
    // location or original cycle metadata supplied by the observer.
    if(!FRV_AI_ROW_FIELDS.some(pair=>pair[0]===field)&&field!=='standardCandidate')continue;
    if(mode==='fill'&&!frvAiMayFill(row,field))continue;
    if(row[field]===value)continue;
    row[field]=value;count++;
  }
  return count;
}
function frvAiChangesMarkup(changes){
  return '<div style="display:grid;gap:8px;">'+changes.slice(0,30).map(x=>
    '<div style="border:1px solid #cbd5e1;border-radius:8px;padding:9px;">'+
    '<b>'+escapeHtml(x.label)+'</b>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:6px;">'+
    '<div style="background:#f1f5f9;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere;">Сейчас: '+escapeHtml(String(x.old||'—'))+'</div>'+
    '<div style="background:#ecfdf5;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere;">ИИ: '+escapeHtml(String(x.value??''))+'</div>'+
    '</div></div>').join('')+'</div>';
}
function frvAiRowDialog(row,proposal){
  const changes=frvAiRowChanges(row,proposal);
  if(!changes.length)return Promise.resolve('cancel');
  return aiReviewChoiceModal({
    id:'frvRowSuggestionPreview',
    title:'Предложение ИИ для строки ФРВ',
    intro:'Фактическое действие (RAW), длительность и доказательства никогда не меняются. Заполнить только пустые поля — безопасный вариант. Замена ранее введённых пояснений требует отдельного решения.',
    details:frvAiChangesMarkup(changes),
    choices:[
      {action:'cancel',label:'Оставить строку без изменений'},
      {action:'fill',label:'Заполнить только незаполненные',primary:true},
      {action:'replace',label:'Заменить производные поля',danger:true}
    ]
  });
}
function frvAiNormalizeAnalysis(raw,observations){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw aiTaskSchemaError('frv_study_analyze','incomplete','missing analysis object');
  const ids=new Set(observations.map(o=>String(o.id)));
  const candidates=(Array.isArray(raw.standardCandidates)?raw.standardCandidates:[])
    .filter(x=>x&&typeof x==='object'&&ids.has(String(x.observationId)))
    .slice(0,1000).map(x=>({
      observationId:String(x.observationId),
      action:frvAiText(x.action),keyMoment:frvAiText(x.keyMoment),
      reason:frvAiText(x.reason),quality:frvAiText(x.quality),
      safety:frvAiText(x.safety),tool:frvAiText(x.tool),material:frvAiText(x.material),
      standardTimeSec:null, // never promote a guessed standard time to a measurement
      sourceCycleNo:x.sourceCycleNo??null
    }));
  const losses=(Array.isArray(raw.losses)?raw.losses:[])
    .filter(x=>x&&typeof x==='object'&&
      (!x.observationId||ids.has(String(x.observationId)))).slice(0,1000)
    .map(x=>({observationId:String(x.observationId||''),
      lossCode:FRV_LOSSES.includes(x.lossCode)?x.lossCode:'',
      cause:frvAiText(x.cause),countermeasure:frvAiText(x.countermeasure),
      expectedReductionSec:Number.isFinite(Number(x.expectedReductionSec))&&
        x.expectedReductionSec!==null&&x.expectedReductionSec!==''&&
        Number(x.expectedReductionSec)>=0?Number(x.expectedReductionSec):null}));
  const analysis={
    summary:frvAiText(raw.summary,3000),
    standardCandidates:candidates,losses,
    risks:(Array.isArray(raw.risks)?raw.risks:[]).map(x=>frvAiText(x)).filter(Boolean).slice(0,100),
    nextMeasurement:frvAiText(raw.nextMeasurement,3000)
  };
  if(!analysis.summary&&!analysis.standardCandidates.length&&!analysis.losses.length&&
     !analysis.risks.length&&!analysis.nextMeasurement)
    throw aiTaskSchemaError('frv_study_analyze','incomplete','analysis is empty');
  return analysis;
}
function frvAiAnalysisRowProposal(candidate){
  const p={};
  for(const [dest,source] of FRV_AI_ANALYSIS_FIELDS){
    const value=frvAiText(candidate?.[source]);
    if(value)p[dest]=value;
  }
  return p;
}
function frvAiApplyAnalysisRows(study,analysis,mode){
  if(mode!=='fill'&&mode!=='replace')return 0;
  const map=new Map(analysis.standardCandidates.map(x=>[String(x.observationId),x]));
  let applied=0;
  for(const cycle of study.cycles||[])for(const row of cycle.observations||[]){
    const candidate=map.get(String(row.id));
    if(!candidate)continue;
    applied+=frvAiApplyRow(row,frvAiAnalysisRowProposal(candidate),mode);
  }
  return applied;
}
function frvAiAnalysisDialog(study,analysis){
  const original=study.analysis&&Object.keys(study.analysis).length;
  const rows=analysis.standardCandidates.slice(0,16).map((x,i)=>
    '<li style="margin:5px 0">'+(i+1)+'. '+escapeHtml(x.action||'(действие не указано)')+
    ' — '+escapeHtml(x.keyMoment||'(ключевой момент не определён)')+'</li>').join('');
  const details='<p style="background:#f1f5f9;padding:9px;border-radius:7px;">'+
    (original?'В ФРВ уже есть результаты анализа. Новый ответ заменит только сводный анализ, если вы это подтвердите.':
      'Пока подтверждённого анализа нет.')+'</p>'+
    '<div style="background:#ecfdf5;padding:10px;border-radius:7px;margin-top:9px;white-space:pre-wrap;overflow-wrap:anywhere;"><b>Новая сводка ИИ</b><p>'+
    escapeHtml(analysis.summary||'(не указана)')+'</p><p>Кандидатов: '+analysis.standardCandidates.length+
    ', потерь: '+analysis.losses.length+', рисков: '+analysis.risks.length+'</p><ol style="padding-left:20px;">'+rows+'</ol></div>';
  return aiReviewChoiceModal({
    id:'frvAnalysisPreview',title:'Применить анализ ФРВ?',
    intro:'RAW, фактически замеренные секунды и фото остаются неизменными при любом выборе. Подсказки ИИ могут пополнить свободные производные поля или, только по отдельному подтверждению, заменить их.',
    details,choices:[
      {action:'cancel',label:'Оставить текущий анализ'},
      {action:'store',label:'Сохранить только анализ'},
      {action:'fill',label:'Анализ + заполнить пустые поля',primary:true},
      {action:'replace',label:'Анализ + заменить пояснения',danger:true}
    ]
  });
}
