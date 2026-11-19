// Stage27: deterministic contracts for local knowledge, AI proposals and versions.
// No network, DOM writes, photos, mutations or external dependencies here.
function stage27Text(x,max=3000){
  return typeof x==='string'?x.trim().slice(0,max):'';
}
function stage27Empty(){
  return {schemaVersion:1,questions:[],suggestions:[],suggestionSignature:'',
    mentor:[],mentorSignature:'',analogSource:null};
}
function stage27Normalize(input){
  const s=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const out=stage27Empty();
  const q=Array.isArray(s.questions)?s.questions:[];
  out.questions=q.slice(0,20).map((v,i)=>({
    id:stage27Text(v?.id,50)||'Q'+(i+1),
    question:stage27Text(v?.question,400),
    why:stage27Text(v?.why,450),
    stepId:Number.isSafeInteger(v?.stepId)?v.stepId:null,
    answer:stage27Text(v?.answer,1800),
    confirmed:!!v?.confirmed&&!!stage27Text(v?.answer)
  })).filter(v=>v.question);
  out.suggestions=(Array.isArray(s.suggestions)?s.suggestions:[]).slice(0,12)
    .map((v,i)=>({
      id:stage27Text(v?.id,50)||'S'+(i+1),
      questionId:stage27Text(v?.questionId,50),
      stepId:Number.isSafeInteger(v?.stepId)?v.stepId:null,
      field:stage27Text(v?.field,35),
      oldValue:stage27Text(v?.oldValue,3000),
      newValue:stage27Text(v?.newValue,3000),
      why:stage27Text(v?.why,700)
    })).filter(v=>v.newValue);
  out.suggestionSignature=stage27Text(s.suggestionSignature,100000);
  out.mentor=(Array.isArray(s.mentor)?s.mentor:[]).slice(0,15)
    .map((v,i)=>({
      id:stage27Text(v?.id,50)||'M'+(i+1),
      stepId:Number.isSafeInteger(v?.stepId)?v.stepId:null,
      description:stage27Text(v?.description,750),
      evidence:stage27Text(v?.evidence,900),
      suggestion:stage27Text(v?.suggestion,900),
      severity:['warning','question','safety_gap'].includes(v?.severity)?v.severity:'question',
      explanation:stage27Text(v?.explanation,1400)
    })).filter(v=>v.description);
  out.mentorSignature=stage27Text(s.mentorSignature,100000);
  if(s.analogSource&&typeof s.analogSource==='object'){
    out.analogSource={
      id:stage27Text(s.analogSource.id,100),
      number:stage27Text(s.analogSource.number,120),
      title:stage27Text(s.analogSource.title,240)
    };
  }
  return out;
}
function stage27ExportState(){
  return stage27Normalize(state.stage27);
}
function stage27StepData(s){
  return {
    id:s.id,
    action:stage27Text(s.action),
    keyMoments:(Array.isArray(s.keyMoments)?s.keyMoments:[]).map(x=>stage27Text(x,700)),
    reason:stage27Text(s.reason),
    successCriteria:stage27Text(s.successCriteria),
    durationSeconds:Number(s.durationSeconds)||0,
    decisionPoints:Array.isArray(s.decisionPoints)?s.decisionPoints.map(x=>stage27Text(x,400)):[],
    commonPitfalls:Array.isArray(s.commonPitfalls)?s.commonPitfalls.map(x=>stage27Text(x,400)):[],
    visualMarkers:Array.isArray(s.visualMarkers)?s.visualMarkers.map(x=>stage27Text(x,400)):[],
    hasPhoto:!!(s.hasPhoto||s.imageData||s.imageBuffer),
    photoAnnotations:Array.isArray(s.photoAnnotations)?s.photoAnnotations.length:0
  };
}
function stage27DocumentData(input){
  const s=input||state,meta=s.meta||{},dm=s.documentManager||{};
  return {
    document:{id:dm.currentId||null,status:dm.status||'Черновик',
      version:dm.version||1,versionOf:dm.versionOf||null},
    meta:{
      operation:stage27Text(meta.operation,350),
      workplace:stage27Text(meta.workplace,350),
      executor:stage27Text(meta.executor,350),
      department:stage27Text(meta.department,350),
      tools:stage27Text(meta.tools,1500),
      material:stage27Text(meta.material,1500),
      safety:stage27Text(meta.safety,1800)
    },
    description:stage27Text(s.description,10000),
    openQuestions:(Array.isArray(s.openQuestions)?s.openQuestions:[])
      .map(x=>stage27Text(x,400)).filter(Boolean).slice(0,50),
    steps:(Array.isArray(s.steps)?s.steps:[]).map(stage27StepData)
  };
}
function stage27DocumentSignature(){
  const ids=['meta-operation','meta-description','meta-tools','meta-material',
    'meta-safety','meta-workplace','meta-department','meta-executor'];
  const dom=typeof document==='undefined'?[]:ids.map(id=>{
    const el=document.getElementById(id);
    return el?el.value:null;
  });
  return JSON.stringify({snapshot:stage27DocumentData(),dom});
}
function stage27IsLocked(){
  return ['Опубликован','Архив'].includes(state.documentManager?.status);
}
function stage27ValidStepId(id,steps){
  return Number.isSafeInteger(id)&&steps.some(s=>s.id===id);
}
function stage27ParseQuestions(raw,steps){
  const x=aiReadTaskObject(raw,'stage27_questions');
  if(!Array.isArray(x.questions)||!x.questions.length)throw aiTaskSchemaError('stage27_questions','incomplete','questions');
  const out=[],seen=new Set();
  for(const q of x.questions.slice(0,7)){
    const question=stage27Text(q?.question,350);
    if(question.length<12)continue;
    const id=Number(q?.stepId);
    const stepId=stage27ValidStepId(id,steps)?id:null;
    const key=question.toLocaleLowerCase('ru')+'|'+String(stepId);
    if(seen.has(key))continue;
    seen.add(key);
    out.push({id:'Q'+(out.length+1),question,stepId,
      why:stage27Text(q?.why,400),answer:'',confirmed:false});
  }
  if(!out.length)throw aiTaskSchemaError('stage27_questions','incomplete','no meaningful question');
  return out.slice(0,6);
}
const STAGE27_FIELDS=new Set(['action','reason','successCriteria']);
function stage27ParseProposals(raw,steps,questions){
  const x=aiReadTaskObject(raw,'stage27_proposals');
  if(!Array.isArray(x.proposals))throw aiTaskSchemaError('stage27_proposals','incomplete','proposals');
  const allowed=new Map(questions.filter(q=>q.confirmed&&q.answer).map(q=>[q.id,q]));
  const out=[],seen=new Set();
  for(const p of x.proposals.slice(0,20)){
    const stepId=Number(p?.stepId);
    const field=stage27Text(p?.field,40);
    const questionId=stage27Text(p?.questionId,50);
    const step=steps.find(s=>s.id===stepId);
    const fact=allowed.get(questionId);
    if(!step||!STAGE27_FIELDS.has(field)||!fact)continue;
    if(fact.stepId!==null&&fact.stepId!==stepId)continue;
    const oldValue=stage27Text(p?.oldValue,3000);
    const newValue=stage27Text(p?.newValue,3000);
    if(!newValue||/^(?:null|undefined|none|keep)$/i.test(newValue)||
       newValue===oldValue||oldValue!==stage27Text(step[field],3000))continue;
    const key=String(stepId)+'|'+field;
    if(seen.has(key))continue;
    seen.add(key);
    out.push({id:'S'+(out.length+1),questionId,stepId,field,
      oldValue,newValue,why:stage27Text(p?.why,600)});
  }
  return out.slice(0,10);
}
function stage27Words(text){
  const raw=String(text||'').toLocaleLowerCase('ru').match(/[a-zа-яё0-9]{3,}/gu)||[];
  return new Set(raw.filter(s=>!['для','при','или','это','как','что','под','после','перед','без',
    'операция','работа','соп','инструкция'].includes(s)));
}
function stage27RankAnalogs(docs,query,currentId,limit=8){
  const terms=stage27Words(query);
  if(!terms.size)return [];
  return (Array.isArray(docs)?docs:[])
    .filter(d=>d&&d.status==='Опубликован'&&String(d.id)!==String(currentId||'')&&
      d.snapshot&&Array.isArray(d.snapshot.steps)&&d.snapshot.steps.length)
    .map(doc=>{
      const snap=doc.snapshot;
      const title=stage27Words([doc.title,doc.number,snap.meta?.operation].join(' '));
      const body=stage27Words([snap.description,snap.meta?.tools,snap.meta?.material,
        ...snap.steps.map(s=>s.action)].join(' '));
      let score=0;
      for(const w of terms){if(title.has(w))score+=5;else if(body.has(w))score+=1;}
      return {doc,score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||
      Number(b.doc.version||0)-Number(a.doc.version||0)||
      String(a.doc.id).localeCompare(String(b.doc.id)))
    .slice(0,limit);
}
const STAGE27_DIFF_FIELDS=[
  ['action','Действие','twi_photo'],['keyMoments','Ключевые моменты','twi_photo'],
  ['reason','Почему важно','twi'],['successCriteria','Критерий результата','twi'],
  ['decisionPoints','Действие при отклонении','twi'],
  ['durationSeconds','Время','frv'],['visualMarkers','Визуальная подсказка','photo'],
  ['hasPhoto','Фотография','photo'],['photoAnnotations','Разметка фото','photo']
];
function stage27DiffSnapshots(previous,current){
  const old=previous||{},now=current||{},changes=[],impacts=new Set();
  const oldSteps=Array.isArray(old.steps)?old.steps:[],
    newSteps=Array.isArray(now.steps)?now.steps:[];
  const oldMap=new Map(oldSteps.map((s,i)=>[String(s.id),{s,index:i}]));
  const newMap=new Map(newSteps.map((s,i)=>[String(s.id),{s,index:i}]));
  for(const [id,entry] of oldMap){
    if(!newMap.has(id)){
      changes.push({kind:'removed',stepId:id,field:'Шаг',before:stage27Text(entry.s.action),after:''});
      impacts.add('twi');impacts.add('photo');continue;
    }
    const next=newMap.get(id);
    if(entry.index!==next.index){
      changes.push({kind:'order',stepId:id,field:'Порядок',before:String(entry.index+1),after:String(next.index+1)});
      impacts.add('twi');
    }
    for(const [field,label,impact] of STAGE27_DIFF_FIELDS){
      const a=entry.s[field],b=next.s[field];
      if(JSON.stringify(a??null)===JSON.stringify(b??null))continue;
      changes.push({kind:'changed',stepId:id,field:label,
        before:Array.isArray(a)?a.join('; '):String(a??''),
        after:Array.isArray(b)?b.join('; '):String(b??'')});
      if(impact==='twi_photo'){impacts.add('twi');impacts.add('photo');}
      else impacts.add(impact);
    }
  }
  for(const [id,entry] of newMap){
    if(!oldMap.has(id)){
      changes.push({kind:'added',stepId:id,field:'Шаг',before:'',after:stage27Text(entry.s.action)});
      impacts.add('twi');impacts.add('photo');
    }
  }
  for(const [field,label,impact] of [
    ['safety','Безопасность','safety'],['tools','Инструменты','twi'],
    ['material','Материалы','twi'],['operation','Операция','twi']
  ]){
    const a=old.meta?.[field],b=now.meta?.[field];
    if(String(a??'')===String(b??''))continue;
    changes.push({kind:'metadata',stepId:'',field:label,before:String(a??''),after:String(b??'')});
    impacts.add(impact);
  }
  return {changes,impacts:[...impacts].sort()};
}
