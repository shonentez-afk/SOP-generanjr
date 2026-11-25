// Stage42 — checked, transactional application of a reviewed workbook proposal.
// The original Excel importer, Yandex transport, JSON schemas and export stay untouched.
function stage42DocumentSignature(){
  return JSON.stringify({
    meta:state.meta,steps:state.steps,documentManager:state.documentManager,
    responsibles:state.responsibles,agreedList:state.agreedList,
    checklist:state.checklist,twi:state.twi,frvStudy:state.frvStudy
  });
}
function stage42CheckProposal(proposal){
  if(!proposal||!Array.isArray(proposal.steps))throw new Error('Нет подготовленной СОП');
  if(!proposal.steps.length)throw new Error('Добавьте хотя бы одно действие из исходной книги');
  if(proposal.steps.length>250)throw new Error('Более 250 шагов: разделите книгу перед импортом');
  for(const [i,st] of proposal.steps.entries()){
    if(!String(st.action||'').trim())throw new Error('В шаге '+(i+1)+' отсутствует действие');
    if(String(st.action).length>3000)throw new Error('Слишком длинное действие в шаге '+(i+1));
    const kms=(st.keyMoments||[]).map(x=>String(x).trim()).filter(Boolean);
    if(kms.length>60)throw new Error('В шаге '+(i+1)+' более 60 КМ. Проверьте исходную ячейку и разделите ошибочно объединённые списки.');
    if(kms.some(x=>x.length>1600))throw new Error('Слишком длинный ключевой момент в шаге '+(i+1));
    if(String(st.reason||'').length>8000)throw new Error('Слишком длинная причина в шаге '+(i+1));
    if(!Number.isFinite(Number(st.durationSeconds))||Number(st.durationSeconds)<0)
      throw new Error('Проверьте длительность шага '+(i+1));
    if(st.photoIndex!==-1){
      const m=proposal.media[st.photoIndex];
      if(!m?.bytes?.byteLength)throw new Error('Неверная привязка фотографии в шаге '+(i+1));
      if(proposal.steps.filter(x=>x.photoIndex===st.photoIndex).length>1)
        throw new Error('Одна фотография назначена нескольким шагам');
    }
  }
  return true;
}
async function stage42DuplicateDocuments(proposal){
  if(typeof docDbGetAll!=='function')return [];
  const docs=await docDbGetAll();
  const number=normText(String(proposal.meta.sopNumber||''));
  const operation=normText(String(proposal.meta.operation||''));
  return docs.filter(doc=>{
    const m=doc.snapshot?.meta||{};
    const n=normText(String(m.sopNumber||doc.number||''));
    const title=normText(String(m.operation||doc.title||''));
    return (number&&number.length>2&&n===number)||(operation&&operation.length>5&&title===operation);
  }).map(doc=>({id:doc.id,title:doc.title||'Без названия',status:doc.status}));
}
function stage42BlobDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result||''));
    r.onerror=()=>reject(r.error||new Error('Не удалось прочитать фотографию'));
    r.readAsDataURL(blob);
  });
}
function stage42EmptyTwi(){
  return {enabled:false,trainer:'',trainee:'',
    prepare:{purpose:'',known:'',prep:'',interest:''},
    present:{round1:'',round2:'',round3:''},
    tryOut:{perform:'',explain:'',check:'',correct:''},
    followUp:{help:'',control:'',observe:'',close:''}};
}
async function stage42ApplyProposal(proposal,signature){
  stage42CheckProposal(proposal);
  if(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив')
    throw new Error('Опубликованный/архивный СОП защищён. Создайте новый документ перед импортом');
  if(signature!==stage42DocumentSignature())
    throw new Error('Текущий СОП изменился после открытия мастера. Закройте его и начните импорт заново');
  const before={
    meta:state.meta,steps:state.steps,description:state.description,
    openQuestions:state.openQuestions,responsibles:state.responsibles,
    agreedList:state.agreedList,safetyIconIds:state.safetyIconIds,
    checklist:state.checklist,frvMeta:state.frvMeta,frvStudy:state.frvStudy,
    twi:state.twi,documentManager:state.documentManager,
    reviewIssues,reviewSummary,stepIdCounter
  };
  const photoIds=[];
  try{
    const proposed=[];
    for(const source of proposal.steps){
      let s=createEmptyStep();
      // Do not reuse an existing photo key, including one held by another
      // saved document; IDB stores imported photographs keyed by step ID.
      let attempts=0;
      while(await idbGetPhoto(s.id)){
        if(++attempts>10000)throw new Error('Не удалось назначить новый ID фотографии');
        s=createEmptyStep();
      }
      s.action=String(source.action||'').trim();
      s.keyMoments=(source.keyMoments||[]).map(x=>String(x).trim()).filter(Boolean);
      if(!s.keyMoments.length)s.keyMoments=[''];
      s.reason=String(source.reason||'');
      s.durationSeconds=Math.round(Number(source.durationSeconds)||0);
      s.successCriteria=String(source.successCriteria||'');
      s.frv={...s.frv,...(source.frv||{})};
      const media=proposal.media[source.photoIndex];
      if(media){
        const blob=new Blob([media.bytes],{type:'image/'+media.ext});
        s.imageData=await stage42BlobDataUrl(blob);
        s.imageBuffer=media.bytes.slice().buffer;
        s.imageExt=media.ext;
        s.hasPhoto=true;
        s.photoEdited=false;
        s.photoAnnotations=[];
        if(!await idbPutPhoto(s.id,blob,media.ext,{annotations:[],updatedAt:Date.now()}))
          throw new Error('Фото шага '+(proposed.length+1)+' не записано в IndexedDB');
        photoIds.push(s.id);
        const back=await idbGetPhoto(s.id);
        if(!back?.blob||back.blob.size!==blob.size)
          throw new Error('Фото шага '+(proposed.length+1)+' не прошло проверку чтения');
      }
      proposed.push(s);
    }
    const blankMeta=Object.fromEntries(Object.keys(state.meta).map(k=>[k,'']));
    state.meta={...blankMeta,...(proposal.meta||{})};
    state.steps=proposed;
    state.description='';
    state.openQuestions=[];
    state.responsibles=proposal.responsibles?.length?proposal.responsibles.slice():[''];
    state.agreedList=proposal.agreed?.length?proposal.agreed.map(a=>({...a})):[{post:'',name:''}];
    state.safetyIconIds=[];
    state.checklist=JSON.parse(JSON.stringify(CHECKLIST_DEFAULT));
    for(const entry of proposal.checklist||[]){
      const target=state.checklist.find(x=>x.id===entry.id);
      if(!target)continue;
      if(typeof entry.score==='number'){target.score=entry.score;target.scoreSource='manual'}
      if(typeof entry.weight==='number')target.weight=entry.weight;
      if(entry.comment)target.comment=entry.comment;
    }
    state.frvMeta={observers:'',quality:'',other:'',
      purpose:'зафиксировать текущее исполнение операции',tOp:'',tVdc:'',tM2:'',
      tM1:'',tMove:'',tArea:'',tIn:'',tOut:''};
    state.frvStudy=null;
    state.twi=stage42EmptyTwi();
    state.documentManager={currentId:null,status:'Черновик',deptCode:'',
      year:new Date().getFullYear(),version:1,seqNo:null};
    reviewIssues=[];reviewSummary=null;
    stateToHtml();
    saveDraft();
    toast('Импортировано '+proposed.length+' шагов. Проверьте СОП и сохраните её в библиотеку.','success');
    return proposed.length;
  }catch(error){
    for(const id of photoIds)await idbDeletePhoto(id);
    state.meta=before.meta;state.steps=before.steps;state.description=before.description;
    state.openQuestions=before.openQuestions;state.responsibles=before.responsibles;
    state.agreedList=before.agreedList;state.safetyIconIds=before.safetyIconIds;
    state.checklist=before.checklist;state.frvMeta=before.frvMeta;
    state.frvStudy=before.frvStudy;state.twi=before.twi;
    state.documentManager=before.documentManager;
    reviewIssues=before.reviewIssues;reviewSummary=before.reviewSummary;
    stepIdCounter=before.stepIdCounter;
    stateToHtml();
    throw error;
  }
}
