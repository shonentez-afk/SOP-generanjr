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
  // Part/model numbers (e.g. KF37, M12) are also source facts.
  return (String(text||'').match(/\d+(?:[.,]\d+)?/gu)||[])
    .map(x=>x.replace(',','.').replace(/^0+(?=\d)/,''));
}
function stage29HasUnconfirmedNumber(value,source,steps){
  const allowed=new Set(stage29Numbers(source));
  // Allow explicit sequence labels, not all small numbers: "через 3 дня" is
  // still an invented commitment when the SOP has 3 or more steps.
  const text=steps>0?String(value||'')
    .replace(/(?:шаг|шаге|этап|пункт|номер)\s*(?:№|#)?\s*\d+/giu,'')
    .replace(/^\s*\d+[.)]\s*/gm,''):String(value||'');
  return [...new Set(stage29Numbers(text))].filter(x=>!allowed.has(x));
}
function stage29TimeConfirmed(value,source){
  if(!value)return true;
  const candidate=String(value).match(/^(\d{1,4}):([0-5]\d)$/);
  if(!candidate)return false;
  const seconds=Number(candidate[1])*60+Number(candidate[2]);
  const text=String(source||'');
  if(!seconds)return false;
  if(text.includes(String(value)))return true;
  const hhmm=/\b(\d{1,4}):([0-5]\d)\b/g;
  for(const m of text.matchAll(hhmm)){
    if(Number(m[1])*60+Number(m[2])===seconds)return true;
  }
  for(const m of text.matchAll(/(\d+)\s*мин(?:ута|уты|ут)?\s*(\d+)\s*сек(?:унд[аы]?|)?/giu)){
    if(Number(m[1])*60+Number(m[2])===seconds)return true;
  }
  const units=/(\d+(?:[.,]\d+)?)\s*(секунд(?:а|ы|у|ами)?|сек|с\b|минут(?:а|ы|у|ами)?|мин\b|час(?:а|ов)?|ч\b)/giu;
  for(const m of text.matchAll(units)){
    const count=Number(m[1].replace(',','.'));
    const multiplier=/^(?:сек|с$)/iu.test(m[2])?1:
      /^(?:мин)/iu.test(m[2])?60:3600;
    if(count*multiplier===seconds)return true;
  }
  return false;
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
  const timeQuestions=[];
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
    if(s.time&&!stage29TimeConfirmed(s.time,source)){
      // A fabricated estimate is discarded, not accepted as a measurement.
      // The rest of a valid draft is still usable after the user's confirmation.
      s.time=null;
      timeQuestions.push('Уточните фактическую длительность шага '+(i+1)+
        ': в исходном описании время не указано.');
    }
  }
  for(const field of ['department','workplace','executor','safety','tools','material']){
    sop[field]=stage29Text(sop[field],1600);
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
  questions.push(...timeQuestions);
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
function stage29TwiNormalize(plan,source,{repeat=false}={}){
  const steps=Array.isArray(source.steps)?source.steps.filter(x=>stage29Text(x.action)):[];
  if(!steps.length)throw stage29QualityError('twi_generate','Нет действий СОП');
  // No unsupported numeric detail in generic AI text, e.g. invented "after 3 days".
  const corpus=stage29TwiSourceText(source);
  for(const sec of ['prepare','present','tryOut','followUp']){
    for(const [field,value] of Object.entries(plan[sec]||{})){
      const txt=stage29Text(value);
      // PRESENT fields are replaced below with verified SOP facts; generic model
      // placeholders and numbered training-round labels cannot leak into TWI.
      const replaced=!repeat&&(sec==='present'||sec==='tryOut'&&field==='check'&&
        steps.some(s=>stage29Text(s.successCriteria)));
      const extras=replaced?[]:stage29HasUnconfirmedNumber(txt,corpus,steps.length);
      if(extras.length)throw stage29QualityError('twi_generate',
        'Не подтверждены числа '+extras.join(', ')+' в '+sec+'.'+field);
      plan[sec][field]=txt;
    }
  }
  // Calendar follow-up promises cannot be invented, even without digits.
  // This is a suggestion for the instructor, not an externally imposed schedule.
  const cadence=/(каждую\s+смену|каждый\s+день|каждую\s+неделю|ежедневно|еженедельно|ежемесячно|раз\s+в\s+(?:день|смену|неделю|месяц)|по\s+графику)/giu;
  for(const field of ['control','observe','close']){
    const text=plan.followUp?.[field]||'';
    const matches=[...text.matchAll(cadence)].map(m=>m[0]);
    if(matches.some(x=>!corpus.toLocaleLowerCase('ru').includes(x.toLocaleLowerCase('ru')))){
      plan.followUp[field]='Наблюдать первые самостоятельные выполнения; частоту и сроки уточнить у наставника.';
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
  if(!repeat){
    // First generation: ground every training round in SOP, not generic model prose.
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
  }else{
    // Repeat generation is only a proposal: old TWI preview controls all writes.
    // Leave model phrasing visible for deliberate user selection, and reject
    // unsupported numbers above. Never silently overwrite the anchored plan.
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
