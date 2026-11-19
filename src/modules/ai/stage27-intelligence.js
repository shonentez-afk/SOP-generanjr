// Stage27: user-confirmed facts and a read-only advanced technology review.
// Never writes model suggestions into SOP without an explicit per-field choice.
const STAGE27_QUESTION_PROMPT=[
  'Ты инженер-технолог и помощник по методике TWI Job Instruction.',
  AI_DATA_BOUNDARY,
  'Проанализируй только переданные факты процесса и существующие шаги.',
  'Найди до 6 действительно важных пробелов, для ответа на которые нужен человек.',
  'Не выдумывай параметры, СИЗ, допуски и нормативные пункты.',
  'Если неизвестно, какой следующий шаг нужен, спроси; если фактов хватает, вопросы не дублируй.',
  'Вывод только валидный JSON:',
  '{"questions":[{"question":"...","stepId":123,"why":"Почему уточнение критично"}]}',
  'stepId обязан соответствовать id переданного шага; для общих вопросов используй null.'
].join('\n');
const STAGE27_PROPOSAL_PROMPT=[
  'Ты инженер, корректирующий существующий СОП строго по подтверждённым пользователем фактам.',
  AI_DATA_BOUNDARY,
  'Предлагай только точечные изменения уже существующих шагов.',
  'Запрещено менять время, фотографии, безопасность, исходные фактические замеры или создавать новые шаги.',
  'Разрешены только поля: action, reason, successCriteria.',
  'Каждое изменение должно опираться на конкретный questionId с confirmed=true.',
  'oldValue обязан полностью совпадать с текущим значением поля, включая пустую строку.',
  'Не добавляй технологические факты без явного ответа пользователя.',
  'Если данных недостаточно для безопасной точечной правки, верни {"proposals":[]}.',
  'Только JSON:',
  '{"proposals":[{"stepId":123,"questionId":"Q1","field":"successCriteria","oldValue":"...","newValue":"...","why":"..."}]}'
].join('\n');
const STAGE27_MENTOR_PROMPT=[
  'Ты инженер-технолог и независимый редактор СОП/TWI.',
  AI_DATA_BOUNDARY,
  'Проверь логическую согласованность соседних шагов, действий, Key Points, Reasons Why, критериев успеха и явно описанных условий.',
  'Не дублируй формальные замечания (пустое время, нет фото или нет Key Points).',
  'Различай подтверждённое противоречие и вопрос, который надо уточнить.',
  'Не выдавай предположение за доказанный риск; не ссылайся на непроверенные нормы.',
  'Поле evidence содержит дословный или близкий к исходным данным фрагмент, подтверждающий замечание.',
  'Никаких готовых автоматических исправлений; рекомендации только для ручной оценки.',
  'Максимум 10 независимых замечаний. Если существенных нет, верни {"issues":[]}.',
  'Только JSON:',
  '{"issues":[{"stepId":123,"severity":"question|warning|safety_gap","description":"...","evidence":"...","suggestion":"..."}]}'
].join('\n');
const STAGE27_EXPLAIN_PROMPT=[
  'Ты наставник по стандартизированной работе. Объясни конкретное замечание простыми словами.',
  AI_DATA_BOUNDARY,
  'Опирайся на предоставленные действия и факты, разделяй доказанные противоречия и вопросы.',
  'Не придумывай критерии безопасности, нормативные пункты, время или оборудование.',
  'Не предлагай автоматическое изменение документа. Ответ: 2-4 коротких предложения.'
].join('\n');

function stage27Store(){
  state.stage27=stage27Normalize(state.stage27);
  saveDraftDebounced();
}
function stage27SafeQuestionState(){
  return stage27Normalize(state.stage27).questions;
}
function stage27RequestGuard(){
  return {editor:aiGuardCapture(),assistant:JSON.stringify(stage27ExportState())};
}
function stage27GuardMatches(guard){
  return aiGuardMatches(guard?.editor)&&
    JSON.stringify(stage27ExportState())===guard.assistant;
}
function stage27GuardCanApply(guard){
  if(stage27GuardMatches(guard))return true;
  toast('СОП или ответы изменились во время запроса. Устаревший результат отклонён.','info');
  return false;
}
async function stage27AskQuestions(){
  if(stage27SetBusy(true)===false)return;
  try{
    const data=stage27DocumentData();
    if(!data.description&&!data.steps.length){
      toast('Сначала опишите операцию или добавьте шаги СОП.','info');return;
    }
    const guard=stage27RequestGuard();
    const raw=await aiAsk(STAGE27_QUESTION_PROMPT,
      'DATA BEGIN\n'+JSON.stringify({
        operation:data.meta.operation,description:data.description,
        steps:data.steps.map(s=>({id:s.id,action:s.action,keyMoments:s.keyMoments,
          reason:s.reason,successCriteria:s.successCriteria,decisionPoints:s.decisionPoints})),
        openQuestions:data.openQuestions,
        confirmedFacts:state.stage27.questions.filter(q=>q.confirmed).map(q=>({
          question:q.question,answer:q.answer,stepId:q.stepId
        }))
      })+'\nDATA END',
      {model:currentModel,temperature:0.1,maxTokens:1250,task:'stage27_questions'});
    const incoming=stage27ParseQuestions(raw,state.steps);
    if(!stage27GuardCanApply(guard))return;
    // A new AI question set may not silently erase confirmed answers or even
    // unsent text typed by a person. Preserve those across repeated requests.
    const previous=stage27SafeQuestionState();
    const retained=previous.filter(q=>q.answer);
    const result=retained.slice();
    const existing=new Set(result.map(q=>q.question+'|'+q.stepId));
    const usedIds=new Set(result.map(q=>q.id));
    for(const item of incoming){
      const key=item.question+'|'+item.stepId;
      if(existing.has(key))continue;
      const old=previous.find(q=>q.question+'|'+q.stepId===key);
      let id=old?.id||item.id;
      if(usedIds.has(id)){
        let n=1;
        while(usedIds.has('Q'+n))n++;
        id='Q'+n;
      }
      usedIds.add(id);existing.add(key);
      result.push({...item,id,answer:old?.answer||'',
        confirmed:!!old?.confirmed&&!!old?.answer});
    }
    state.stage27.questions=result.slice(0,20);
    state.stage27.suggestions=[];state.stage27.suggestionSignature='';
    stage27Store();stage27Render();
    toast('Вопросы для уточнения сформированы. Ответьте и подтвердите факты.','success');
  }catch(e){toast('Вопросы: '+diagnoseAIError(e),'error')}
  finally{stage27SetBusy(false)}
}
function stage27SaveAnswer(qid,answer){
  const q=state.stage27?.questions?.find(v=>v.id===qid);
  if(!q)return;
  const next=stage27Text(answer,1800);
  if(next!==q.answer){q.answer=next;q.confirmed=false;
    state.stage27.suggestions=[];state.stage27.suggestionSignature='';
    stage27Store();
  }
}
function stage27ConfirmAnswer(qid){
  const q=state.stage27?.questions?.find(v=>v.id===qid);
  if(!q)return;
  if(!q.answer){toast('Сначала заполните ответ.','info');return;}
  q.confirmed=true;state.stage27.suggestions=[];
  state.stage27.suggestionSignature='';
  stage27Store();stage27Render();
}
async function stage27SuggestFromFacts(){
  if(stage27IsLocked()){toast('Сначала создайте новую версию СОП.','info');return;}
  if(!state.steps.length){toast('Добавьте шаги СОП до уточнения существующих шагов.','info');return;}
  const confirmed=stage27SafeQuestionState().filter(q=>q.confirmed&&q.answer);
  if(!confirmed.length){toast('Сначала подтвердите хотя бы один ответ.','info');return;}
  if(stage27SetBusy(true)===false)return;
  try{
    const guard=stage27RequestGuard();
    const doc=stage27DocumentData();
    const raw=await aiAsk(STAGE27_PROPOSAL_PROMPT,
      'DATA BEGIN\n'+JSON.stringify({
        meta:doc.meta,description:doc.description,
        steps:doc.steps.map(s=>({id:s.id,action:s.action,reason:s.reason,
          successCriteria:s.successCriteria,keyMoments:s.keyMoments})),
        confirmedAnswers:confirmed.map(q=>({
          questionId:q.id,question:q.question,answer:q.answer,stepId:q.stepId,confirmed:true
        }))
      })+'\nDATA END',
      {model:currentModel,temperature:0.1,maxTokens:1800,task:'stage27_proposals'});
    const suggestions=stage27ParseProposals(raw,state.steps,confirmed);
    if(!stage27GuardCanApply(guard))return;
    state.stage27.suggestions=suggestions;
    state.stage27.suggestionSignature=stage27DocumentSignature();
    stage27Store();stage27Render();
    toast(suggestions.length?'Проверьте предложенные изменения и выберите нужные.':
      'ИИ не нашёл обоснованных точечных изменений. СОП не изменён.',
      suggestions.length?'success':'info');
  }catch(e){toast('Предложения: '+diagnoseAIError(e),'error')}
  finally{stage27SetBusy(false)}
}
function stage27ApplySelected(){
  if(stage27IsLocked()){toast('Опубликованный СОП не изменяется. Создайте новую версию.','info');return;}
  const d=state.stage27;
  if(!d?.suggestions?.length)return;
  if(!d.suggestionSignature||d.suggestionSignature!==stage27DocumentSignature()){
    d.suggestions=[];d.suggestionSignature='';stage27Store();stage27Render();
    toast('СОП изменён после получения предложений. Повторите анализ.','warning');return;
  }
  const choices=[...document.querySelectorAll('#stage27ProposalsArea [data-stage27-suggestion]:checked')]
    .map(el=>el.getAttribute('data-stage27-suggestion'));
  if(!choices.length){toast('Отметьте предложения для применения.','info');return;}
  const selected=d.suggestions.filter(p=>choices.includes(p.id));
  for(const p of selected){
    const s=state.steps.find(x=>x.id===p.stepId);
    const fact=d.questions.find(x=>x.id===p.questionId);
    if(!s||!STAGE27_FIELDS.has(p.field)||stage27Text(s[p.field])!==p.oldValue||
       !fact?.confirmed||!fact.answer){
      toast('Одно из предложений устарело; СОП не изменён.','warning');return;
    }
  }
  for(const p of selected){
    state.steps.find(x=>x.id===p.stepId)[p.field]=p.newValue;
  }
  // Closing a question is explicit: only confirmed facts used for an applied change.
  const used=new Set(selected.map(s=>s.questionId));
  state.openQuestions=state.openQuestions.filter(question=>
    !d.questions.some(q=>used.has(q.id)&&q.question===question));
  d.suggestions=[];d.suggestionSignature='';
  stateChanged();
  stage27Render();
  toast('Применено точечных изменений: '+selected.length+
    '. Время, фото и ФРВ сохранены. Проверьте актуальность TWI.','success');
}
function stage27ParseMentor(raw,steps){
  const x=aiReadTaskObject(raw,'stage27_mentor');
  if(!Array.isArray(x.issues))throw aiTaskSchemaError('stage27_mentor','incomplete','issues');
  const out=[],seen=new Set();
  for(const rawItem of x.issues.slice(0,15)){
    const description=stage27Text(rawItem?.description,600);
    const stepId=Number(rawItem?.stepId);
    if(description.length<12||!stage27ValidStepId(stepId,steps))continue;
    const key=stepId+'|'+description.toLocaleLowerCase('ru');
    if(seen.has(key))continue;
    seen.add(key);
    out.push({id:'M'+(out.length+1),stepId,description,
      severity:['question','warning','safety_gap'].includes(rawItem?.severity)?
        rawItem.severity:'question',
      evidence:stage27Text(rawItem?.evidence,700),
      suggestion:stage27Text(rawItem?.suggestion,700),explanation:''});
  }
  return out.slice(0,10);
}
async function stage27ReviewLogic(){
  if(!state.steps.length){toast('Сначала добавьте шаги СОП.','info');return;}
  if(stage27SetBusy(true)===false)return;
  try{
    const guard=stage27RequestGuard();
    const doc=stage27DocumentData();
    // Large SOPs are explicitly partial rather than silently truncated.
    const checked=doc.steps.slice(0,18);
    const payload={meta:doc.meta,steps:checked.map(s=>({
      id:s.id,action:s.action,keyMoments:s.keyMoments,
      reason:s.reason,successCriteria:s.successCriteria,decisionPoints:s.decisionPoints
    }))};
    if(JSON.stringify(payload).length>24000){
      toast('Документ слишком объёмный для одной проверки. Сократите рассматриваемый блок.','warning');
      return;
    }
    const raw=await aiAsk(STAGE27_MENTOR_PROMPT,
      'DATA BEGIN\n'+JSON.stringify(payload)+'\nDATA END',
      {model:currentModel,temperature:0.1,maxTokens:1800,task:'stage27_mentor'});
    const issues=stage27ParseMentor(raw,checked);
    if(!stage27GuardCanApply(guard))return;
    state.stage27.mentor=issues;
    state.stage27.mentorSignature=stage27DocumentSignature();
    stage27Store();stage27Render();
    toast('Дополнительная логическая проверка завершена'+
      (doc.steps.length>18?' (первые 18 шагов)':''),'success');
  }catch(e){toast('Проверка логики: '+diagnoseAIError(e),'error')}
  finally{stage27SetBusy(false)}
}
async function stage27ExplainMentor(issueId){
  const d=state.stage27,issue=d?.mentor?.find(i=>i.id===issueId);
  if(!issue)return;
  if(d.mentorSignature!==stage27DocumentSignature()){
    toast('После проверки СОП изменился. Проведите проверку заново.','info');return;
  }
  if(stage27SetBusy(true)===false)return;
  try{
    const guard=stage27RequestGuard();
    const step=state.steps.find(s=>s.id===issue.stepId);
    const raw=await aiAsk(STAGE27_EXPLAIN_PROMPT,
      'DATA BEGIN\n'+JSON.stringify({
        operation:state.meta.operation,step:stage27StepData(step),
        issue:{description:issue.description,evidence:issue.evidence,
          suggestion:issue.suggestion}
      })+'\nDATA END',
      {model:currentModel,temperature:0.15,maxTokens:550,task:'stage27_explain'});
    if(!stage27GuardCanApply(guard))return;
    const text=stage27Text(raw,1300);
    if(!text)throw new Error('Пустое объяснение');
    issue.explanation=text;stage27Store();stage27Render();
  }catch(e){toast('Объяснение: '+diagnoseAIError(e),'error')}
  finally{stage27SetBusy(false)}
}
