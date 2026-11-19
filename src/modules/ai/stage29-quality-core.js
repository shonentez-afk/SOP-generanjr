// Stage29 — quality controls shared by SOP and SOP-derived TWI.
// Deterministic and source-grounded. No network, editor writes or new workflows.
const STAGE29_EMPTY_MARKERS=new Set([
  'null','undefined','none','keep','nil','n/a','нет данных','не указано',
  'отсутствует','неизвестно','—','-'
]);
const STAGE29_STOPWORDS=new Set([
 'и','или','что','это','как','для','при','перед','после','если','тогда','без',
 'когда','также','только','должен','должна','нужно','необходимо','проверить',
 'нужно','важно','правильно','сделать','сначала','затем','работы','работа'
]);
function stage29Text(value,max=4000){
  if(typeof value!=='string')return '';
  const s=value.trim().replace(/\s+/g,' ');
  return STAGE29_EMPTY_MARKERS.has(s.toLocaleLowerCase('ru'))?'':s.slice(0,max);
}
function stage29Tokens(text){
  return new Set((String(text||'').toLocaleLowerCase('ru').match(/[a-zа-яё0-9]{4,}/gu)||[])
    .filter(t=>!STAGE29_STOPWORDS.has(t)));
}
function stage29Numbers(text){
  return (String(text||'').match(/(?<![a-zа-яё0-9])\d+(?:[.,]\d+)?(?![a-zа-яё0-9])/giu)||[])
    .map(x=>x.replace(',','.').replace(/^0+(?=\d)/,''));
}
function stage29HasUnconfirmedNumber(value,source,numbers){
  const allowed=new Set(stage29Numbers(source));
  for(let i=1;i<=numbers;i++)allowed.add(String(i)); // step labels 1..N
  return [...new Set(stage29Numbers(value))].filter(x=>!allowed.has(x));
}
function stage29QualityError(task,detail){
  const e=new Error('Результат ИИ содержит неподтверждённые сведения или неполную структуру. Документ не изменён.');
  e.code='AI_TASK_INCOMPLETE';
  e.task=task;
  e.detail=detail.slice(0,450);
  return e;
}
function stage29SopNormalize(sop,input){
  const source=[input.operation,input.department,input.workplace,input.executor,
    input.tools,input.material,input.safety,input.userDescription].join('\n');
  const steps=sop.steps;
  // Existing validator already rejects missing actions and limits Key Points/visuals.
  // Tighten placeholders and duplicate Key Points without inventing content.
  for(const step of steps){
    step.action=stage29Text(step.action,1600);
    step.reason=stage29Text(step.reason,2000);
    step.success_criteria=stage29Text(step.success_criteria,2000);
    step.keyMoments=[...new Map((step.keyMoments||[]).map(x=>stage29Text(x,900))
      .filter(Boolean).map(x=>[x.toLocaleLowerCase('ru'),x])).values()].slice(0,3);
    for(const key of ['decision_points','common_pitfalls']){
      step[key]=Array.isArray(step[key])?step[key].map(x=>stage29Text(x,600)).filter(Boolean):[];
    }
    step.visual_markers=Array.isArray(step.visual_markers)?
      step.visual_markers.map(x=>stage29Text(x,500)).filter(Boolean).slice(0,1):[];
    if(!step.action)throw stage29QualityError('generate_sop','Пустое действие после очистки placeholders');
  }
  // Numeric specifics are not safe to fabricate. If a number first appears in
  // the AI result, reject the proposal BEFORE modifying the live SOP.
  const claims=[];
  for(let i=0;i<steps.length;i++){
    const s=steps[i];
    for(const field of ['action','reason','success_criteria']){
      const extras=stage29HasUnconfirmedNumber(s[field],source,0);
      if(extras.length)claims.push('шаг '+(i+1)+' / '+field+': '+extras.join(', '));
    }
    for(const field of ['keyMoments','decision_points','common_pitfalls','visual_markers']){
      for(const value of s[field]){
        const extras=stage29HasUnconfirmedNumber(value,source,0);
        if(extras.length)claims.push('шаг '+(i+1)+' / '+field+': '+extras.join(', '));
      }
    }
    if(s.time){
      const val=String(s.time);
      // Explicit time may be stated as 00:40, 40 секунд, or 0:40; no inferred durations.
      const digits=stage29Numbers(val);
      if(digits.length&&!digits.every(x=>stage29HasUnconfirmedNumber(x,source,0).length===0)){
        claims.push('шаг '+(i+1)+' / time: '+val);
      }
    }
  }
  for(const field of ['safety','tools','material']){
    const extras=stage29HasUnconfirmedNumber(sop[field],source,0);
    if(extras.length)claims.push(field+': '+extras.join(', '));
  }
  if(claims.length)throw stage29QualityError('generate_sop',
    'Новые числа и параметры отсутствуют в описании: '+claims.slice(0,6).join('; '));
  const normalizedActions=steps.map(s=>s.action.toLocaleLowerCase('ru').replace(/\s+/g,' ').trim());
  const seen=new Map();
  const repeats=[];
  normalizedActions.forEach((action,i)=>{
    if(seen.has(action))repeats.push([seen.get(action)+1,i+1]);
    else seen.set(action,i);
  });
  const q=Array.isArray(sop.openQuestions)?sop.openQuestions:[];
  const questions=q.map(x=>stage29Text(x,500)).filter(Boolean);
  for(const [a,b] of repeats){
    questions.push('Проверьте, действительно ли действия шагов '+a+' и '+b+
      ' являются разными, или их нужно объединить.');
  }
  sop.openQuestions=[...new Set(questions)].slice(0,15);
  // Track diagnostic results without changing the stored SOP schema.
  return {sop,quality:{
    count:steps.length,
    duplicateActions:repeats.length,
    questions:sop.openQuestions.length,
    keyPoints:steps.reduce((n,s)=>n+s.keyMoments.length,0)
  }};
}
function stage29TwiSourceText(src){
  return [src.operation,src.executor,src.workplace,src.safety,
    ...(src.steps||[]).flatMap(s=>[
      s.action,...(s.keyPoints||[]),s.reason,s.successCriteria,
      ...(s.decisionPoints||[])
    ])].map(String).join('\n');
}
function stage29SafeLines(lines,field){
  const text=lines.join('\n').trim();
  if(text.length>3900)throw stage29QualityError('twi_generate',
    'Слишком объёмный раздел '+field+'; сократите черновик СОП для одного учебного плана');
  return text;
}
function stage29TwiNormalize(plan,source){
  const steps=Array.isArray(source.steps)?source.steps.filter(x=>stage29Text(x.action)):[];
  if(!steps.length)throw stage29QualityError('twi_generate','Нет действий СОП');
  // No unsupported numeric detail in generic AI text, e.g. invented "after 3 days".
  const corpus=stage29TwiSourceText(source);
  for(const sec of ['prepare','present','tryOut','followUp']){
    for(const [field,value] of Object.entries(plan[sec]||{})){
      const txt=stage29Text(value);
      const extras=stage29HasUnconfirmedNumber(txt,corpus,steps.length);
      if(extras.length)throw stage29QualityError('twi_generate',
        'Не подтверждены числа '+extras.join(', ')+' в '+sec+'.'+field);
      plan[sec][field]=txt;
    }
  }
  // The actual job breakdown ALWAYS comes from the current SOP, never from a
  // generic AI paraphrase. The model still writes preparation, practice and follow-up.
  const actions=['Показать операцию целиком. Затем выполнить действия по СОП:'];
  const points=[],reasons=[],criteria=[];
  for(const [i,s] of steps.entries()){
    const number=i+1;
    const action=stage29Text(s.action,1000);
    actions.push(number+'. '+action);
    const kp=(Array.isArray(s.keyPoints)?s.keyPoints:[]).map(x=>stage29Text(x,600)).filter(Boolean);
    if(kp.length)points.push(number+'. '+action+': '+kp.join('; '));
    if(kp.length&&stage29Text(s.reason))
      reasons.push(number+'. '+action+': '+stage29Text(s.reason,800));
    const result=stage29Text(s.successCriteria);
    if(result)criteria.push(number+'. '+result);
  }
  plan.present.round1=stage29SafeLines(actions,'пошаговый показ');
  plan.present.round2=stage29SafeLines(points.length?[
    'Ключевые моменты — только из СОП:',...points
  ]:['В СОП ключевые моменты не выделены. Не придумывайте их без подтверждения инженера.'],'ключевые моменты');
  plan.present.round3=stage29SafeLines(reasons.length?[
    'Объяснить причины, явно описанные в СОП:',...reasons
  ]:['Причины для Key Points в СОП не указаны. Уточните их у инженера; не выдумывайте.'],'объяснение причин');
  if(criteria.length){
    plan.tryOut.check=stage29SafeLines([
      'Сверить выполнение с критериями результата СОП:',...criteria
    ],'проверка выполнения');
  }
  // No confirmed follow-up frequency -> prevent invented commitments. Existing
  // model content remains only when it did not introduce unsupported numbers.
  return {plan,quality:{
    steps:steps.length,
    keyPointSteps:points.length,
    reasonSteps:reasons.length,
    criteriaSteps:criteria.length
  }};
}
