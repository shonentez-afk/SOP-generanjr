// Stage27: indexed local published SOP analogs and deterministic version comparison.
// No automatic cloud upload: source SOP is sent only by explicit "Create by analog" click.
let stage27AnalogSelected=null;
let stage27AnalogMatches=[];
let stage27HistoryCandidates=[];
const STAGE27_ANALOG_PROMPT=[
  'Ты инженер-технолог по методике TWI Job Instruction.',
  AI_DATA_BOUNDARY,
  'Составь черновик СОП для ЦЕЛЕВОЙ операции из TARGET и SOURCE.',
  'SOURCE — только пример структуры, а не подтверждённая инструкция для TARGET.',
  'Никогда не переносить из SOURCE без подтверждения: настройки, допуски, инструменты,',
  'оборудование, СИЗ, меры безопасности, технологические условия, решения при отклонении.',
  'При нехватке фактов возвращай конкретные openQuestions вместо догадок.',
  'Важно: не выдавай текст источника за проверенную норму и не переноси изображения.',
  'В steps только действия, непосредственно обоснованные данными TARGET;',
  'разрешено использовать SOURCE для стиля и порядка, если нет противоречий.',
  'Время только если явно подтверждено TARGET; иначе null. Key Points 0-3.',
  'Только JSON по схеме:',
  '{"department":"","workplace":"","executor":"","safety":"","tools":"","material":"",',
  '"isoIconIds":[],"openQuestions":[],"steps":[{"action":"","keyMoments":[],',
  '"reason":"","time":null,"success_criteria":"","decision_points":[],',
  '"common_pitfalls":[],"visual_markers":[]}]}'
].join('\n');

async function stage27FindAnalogs(){
  const query=stage27Text($('stage27AnalogQuery')?.value,1000);
  if(!query){toast('Введите название, оборудование или ключевые слова.','info');return;}
  try{
    const docs=await docDbGetAll();
    stage27AnalogMatches=stage27RankAnalogs(docs,query,
      state.documentManager?.currentId,8);
    stage27AnalogSelected=null;
    stage27Render();
    toast(stage27AnalogMatches.length?'Подобраны опубликованные СОП по ключевым словам.':
      'Подходящих опубликованных СОП нет.','info');
  }catch(e){toast('Поиск в библиотеке: '+e.message,'error')}
}
async function stage27SelectAnalog(id){
  const entry=stage27AnalogMatches.find(x=>String(x.doc.id)===String(id));
  if(!entry)return;
  stage27AnalogSelected={id:entry.doc.id,doc:entry.doc,
    targetDocumentId:state.documentManager?.currentId||null};
  stage27Render();
}
function stage27CreateFromAI(sop){
  const arr=sop.steps.map(s=>({
    id:++stepIdCounter,
    action:s.action,
    keyMoments:s.keyMoments.length?s.keyMoments:[''],
    reason:s.reason,durationSeconds:parseDuration(s.time),
    successCriteria:s.success_criteria,decisionPoints:s.decision_points,
    commonPitfalls:s.common_pitfalls,visualMarkers:s.visual_markers,
    photoHint:s.visual_markers.join('. '),
    imageData:null,imageBuffer:null,imageExt:null,
    frv:{vdc:false,m2:'',m1:'',move:'',comment:''}
  }));
  return arr;
}
async function stage27GenerateAnalog(){
  if(stage27IsLocked()){toast('Сначала создайте новую версию или новый черновик.','info');return;}
  if(!stage27AnalogSelected){toast('Выберите опубликованный СОП из библиотеки.','info');return;}
  const targetDifference=stage27Text($('stage27AnalogDifferences')?.value,2500);
  const target=stage27DocumentData();
  if(!target.description&&!targetDifference){
    toast('Укажите описание целевой операции или отличия от аналога.','info');return;
  }
  if(stage27SetBusy(true)===false)return;
  try{
    const guard=stage27RequestGuard();
    const selectedId=stage27AnalogSelected.id;
    // Read fresh authoritative copy. A stale result or archived document cannot
    // become a trusted analog between selection and use.
    const source=await docDbGet(selectedId);
    if(!source||source.status!=='Опубликован'||!source.snapshot){
      toast('Исходный СОП больше не опубликован или недоступен.','warning');return;
    }
    if(source.snapshot.steps?.length>24){
      toast('В исходном СОП более 24 шагов. Выберите меньший аналог.','warning');return;
    }
    const src={
      number:source.number,title:source.title,
      meta:{
        operation:source.snapshot.meta?.operation||'',
        tools:source.snapshot.meta?.tools||'',
        material:source.snapshot.meta?.material||''
      },
      steps:(source.snapshot.steps||[]).map(s=>({
        action:s.action,keyMoments:s.keyMoments,reason:s.reason,
        successCriteria:s.successCriteria,decisionPoints:s.decisionPoints
      }))
    };
    const payload={TARGET:{
      operation:target.meta.operation,workplace:target.meta.workplace,
      description:target.description,confirmedDifferences:targetDifference,
      existingSteps:target.steps.map(s=>({action:s.action,keyMoments:s.keyMoments}))
    },SOURCE:src};
    if(JSON.stringify(payload).length>25000){
      toast('Описание слишком велико для безопасной обработки за один запрос.','warning');return;
    }
    const raw=await aiAsk(STAGE27_ANALOG_PROMPT,
      'DATA BEGIN\n'+JSON.stringify(payload)+'\nDATA END',
      {model:currentModel,temperature:0.2,maxTokens:3500,task:'stage27_analog'});
    const sop=validateGeneratedSop(aiReadTaskObject(raw,'stage27_analog'));
    if(!stage27GuardCanApply(guard)||stage27AnalogSelected?.id!==selectedId)return;
    let choice='replace';
    if(aiSopHasMeaningfulSteps()){
      choice=await aiSopPlanPreview(sop);
      if(choice!=='replace'&&choice!=='append'){
        toast('Создание по аналогии отменено. СОП не изменён.','info');return;
      }
      if(!stage27GuardCanApply(guard)||stage27AnalogSelected?.id!==selectedId)return;
    }
    const additions=stage27CreateFromAI(sop);
    if(choice==='append'){
      state.steps.push(...additions);
      state.openQuestions=[...new Set([
        ...(Array.isArray(state.openQuestions)?state.openQuestions:[]),
        ...(Array.isArray(sop.openQuestions)?sop.openQuestions:[])
      ])].filter(Boolean).slice(0,50);
    }else{
      state.steps=additions;
      state.openQuestions=Array.isArray(sop.openQuestions)?sop.openQuestions:[];
    }
    state.stage27.analogSource={
      id:String(source.id),number:String(source.number||''),
      title:String(source.title||'')
    };
    // No source photos, source timings, source safety icons, approval or statuses.
    stateChanged();stage27Render();
    toast('Черновик сформирован по аналогии: '+additions.length+
      ' шагов. Проверьте факты и вопросы перед утверждением.','success');
  }catch(e){toast('СОП по аналогии: '+diagnoseAIError(e),'error')}
  finally{stage27SetBusy(false)}
}
async function stage27RefreshHistory(){
  try{
    const dm=state.documentManager||{};
    const docs=await docDbGetAll();
    stage27HistoryCandidates=docs.filter(d=>{
      if(!d||!d.snapshot||d.id===dm.currentId)return false;
      if(dm.seqNo&&dm.deptCode&&dm.year)return Number(d.seqNo)===Number(dm.seqNo)&&
        String(d.deptCode)===String(dm.deptCode)&&Number(d.year)===Number(dm.year);
      return !!dm.versionOf&&d.id===dm.versionOf;
    }).sort((a,b)=>Number(b.version||0)-Number(a.version||0));
    stage27RenderHistoryOptions();
    toast(stage27HistoryCandidates.length?'История версий загружена.':
      'Для текущего документа ещё нет предыдущей версии в библиотеке.','info');
  }catch(e){toast('История версий: '+e.message,'error')}
}
function stage27RenderHistoryOptions(){
  const input=$('stage27HistorySelect');
  if(!input)return;
  const previouslySelected=input.value;
  input.innerHTML='<option value="">Выберите редакцию для сравнения</option>'+
    stage27HistoryCandidates.map(d=>
      '<option value="'+stage27Attr(d.id)+'">'+
      escapeHtml((d.number||'Черновик')+' · v'+(d.version||1)+
        ' · '+(d.title||'Без названия'))+'</option>').join('');
  if(stage27HistoryCandidates.some(d=>String(d.id)===previouslySelected))
    input.value=previouslySelected;
}
function stage27DescribeImpacts(impacts){
  const labels={
    twi:'Проверить TWI: обучение могло устареть',
    photo:'Проверить фотографии и разметку изменённых шагов',
    frv:'Проверить согласование времени с фактической ФРВ',
    safety:'Проверить условия безопасности по действующим документам'
  };
  return (impacts||[]).map(x=>labels[x]).filter(Boolean);
}
function stage27CompareSelectedVersion(){
  const id=$('stage27HistorySelect')?.value;
  const target=$('stage27HistoryDiff');
  if(!id||!target){if(target)target.textContent='Выберите редакцию.';return;}
  const other=stage27HistoryCandidates.find(x=>String(x.id)===id);
  if(!other||!other.snapshot){target.textContent='Редакция недоступна.';return;}
  const old=stage27DocumentData({
    meta:other.snapshot.meta,description:other.snapshot.description,
    steps:other.snapshot.steps,openQuestions:other.snapshot.openQuestions
  });
  const now=stage27DocumentData();
  const result=stage27DiffSnapshots(old,now);
  if(!result.changes.length){
    target.textContent='Содержательных изменений не найдено. Сравниваются данные текущего редактора, включая несохранённые правки.';
    return;
  }
  const impacts=stage27DescribeImpacts(result.impacts);
  target.innerHTML='<div class="s27-summary">Изменений: '+result.changes.length+
    '. Учитываются несохранённые правки текущего редактора.</div>'+
    (impacts.length?'<div class="s27-impact">'+impacts.map(escapeHtml).join('<div></div>')+'</div>':'')+
    '<div class="s27-changes">'+result.changes.slice(0,120).map(c=>
      '<div class="s27-change"><b>'+escapeHtml(c.field)+
      (c.stepId?' · шаг '+escapeHtml(c.stepId):'')+'</b>'+
      '<div><span>Было:</span> '+escapeHtml(c.before||'—')+'</div>'+
      '<div><span>Стало:</span> '+escapeHtml(c.after||'—')+'</div></div>').join('')+'</div>'+
    (result.changes.length>120?'<p>Показаны первые 120 изменений.</p>':'');
}
