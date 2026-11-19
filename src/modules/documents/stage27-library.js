async function docSaveCurrent(status='Черновик'){
 const now=Date.now(); const dm=state.documentManager||{};
 if(dm.status==='Опубликован'||dm.status==='Архив') return toast('Опубликованный или архивный документ нельзя изменять. Создайте новую версию.','info');
 if(!dm.currentId)dm.currentId=docMakeId();
 dm.status='Черновик'; dm.year=Number(dm.year)||new Date().getFullYear(); dm.version=Math.max(1,Number(dm.version)||1);
 const snap=docSnapshot();
 const doc={id:dm.currentId,status:'Черновик',seqNo:dm.seqNo||null,deptCode:String(dm.deptCode||''),year:dm.year,version:dm.version,number:'Черновик',title:docTitle(snap),updatedAt:now,createdAt:dm.createdAt||now,createdBy:String(dm.createdBy||''),publishedBy:String(dm.publishedBy||''),versionOf:dm.versionOf||null,snapshot:snap};
 if(!(await photoSaveDocumentCopies(doc.id,state.steps)))return;
 await docDbPut(doc); dm.createdAt=doc.createdAt; state.documentManager=dm; await docWriteJsonToNetwork(doc); saveDraft(); renderDocumentManager(); toast('Черновик сохранён','success'); return doc;
}
async function docPublishCurrent(){
 htmlFieldToState(); const dm=state.documentManager||{};
 const code=String($('docDeptCode')?.value||dm.deptCode||'').trim();
 const year=Number($('docYear')?.value||dm.year||new Date().getFullYear());
 let version=Math.max(1,Number($('docVersion')?.value||dm.version||1));
 if(!/^\d+$/.test(code))return toast('Укажите числовой код подразделения','error');
 if(!Number.isInteger(year)||year<2000||year>2100)return toast('Укажите корректный год','error');
 if(!state.meta.operation.trim())return toast('Укажите название операции','error');
 if(dm.status==='Опубликован')return toast('Эта версия уже опубликована и зафиксирована. Создайте новую версию.','info');
 if(dm.status==='Архив')return toast('Архивный документ нельзя публиковать напрямую. Создайте новую версию.','info');
 if(!dm.seqNo) dm.seqNo=await docNextSeq();
 // Если это новая версия, не допускаем повторную публикацию той же версии.
 const docs=await docDbGetAll();
 const same=docs.find(d=>d.status==='Опубликован'&&Number(d.seqNo)===Number(dm.seqNo)&&String(d.deptCode)===code&&Number(d.year)===year);
 if(same) version=Math.max(version,Number(same.version||1)+1);
 const uniqueCheck=await docCheckUniquePublished({id:dm.currentId||'',seqNo:dm.seqNo,deptCode:code,year,version});
 if(!uniqueCheck.ok){return toast(`Публикация остановлена: номер ${code}.${dm.seqNo}.${year} ${version} уже существует.`, 'error');}
 dm.deptCode=code; dm.year=year; dm.version=version; dm.status='Опубликован'; dm.publishedBy=String($('docPublishedBy')?.value||dm.publishedBy||'').trim();
 state.documentManager=dm; state.meta.sopNumber=`${code}.${dm.seqNo}.${year} ${version}`; setVal('meta-sop-number',state.meta.sopNumber);
 const now=Date.now(), snap=docSnapshot();
 const doc={id:dm.currentId||docMakeId(),status:'Опубликован',seqNo:dm.seqNo,deptCode:code,year,version,number:state.meta.sopNumber,title:docTitle(snap),updatedAt:now,createdAt:dm.createdAt||now,createdBy:String(dm.createdBy||''),publishedBy:String(dm.publishedBy||''),versionOf:dm.versionOf||null,snapshot:snap};
 dm.currentId=doc.id; dm.createdAt=doc.createdAt; if(!(await photoSaveDocumentCopies(doc.id,state.steps)))return; await docDbPut(doc); await docAppendJournal({action:'publish',documentId:doc.id,number:doc.number,status:doc.status,versionOf:doc.versionOf||null}); state.documentManager=dm; const oldDraftFile=(`Черновик_${doc.id}`).replace(/[\/:*?"<>|]+/g,'_')+'.json'; await docWriteJsonToNetwork(doc); await docRemoveNetworkFile(oldDraftFile); saveDraft(); renderDocumentManager(); toast(`СОП опубликован: ${doc.number}`,'success'); return doc;
}
async function docArchiveCurrent(){const dm=state.documentManager||{};if(!dm.currentId)return toast('Сначала сохраните документ в библиотеку','info');if(dm.status!=='Опубликован')return toast('В архив переводятся только опубликованные документы','info');const doc=await docDbGet(dm.currentId);if(!doc)return toast('Документ не найден','error');doc.status='Архив';doc.updatedAt=Date.now();await docDbPut(doc);dm.status='Архив';state.documentManager=dm;await docWriteJsonToNetwork(doc);await docAppendJournal({action:'archive',documentId:doc.id,number:doc.number,status:'Архив'});renderDocumentManager();saveDraft();toast('Документ перемещён в архив','success')}
async function docNewVersion(id){
 const old=await docDbGet(id||state.documentManager?.currentId);
 if(!old||old.status!=='Опубликован')return toast('Новую версию можно создать только из опубликованного СОП','info');
 const docs=await docDbGetAll();
 const versions=docs.filter(d=>Number(d.seqNo)===Number(old.seqNo)&&String(d.deptCode)===String(old.deptCode)&&Number(d.year)===Number(old.year));
 const nextVersion=Math.max(0,...versions.map(d=>Number(d.version)||0))+1;
 const d=JSON.parse(JSON.stringify(old)); d.id=docMakeId(); d.status='Черновик'; d.number='Черновик'; d.version=nextVersion; d.versionOf=old.id; d.createdAt=Date.now(); d.updatedAt=Date.now();
 // A new version has not yet been reviewed; prior remarks stay in the original published version.
 if(d.snapshot)d.snapshot.reviewState={schemaVersion:1,issues:[],summary:null,deferredIssueKeys:[]};
 if(!(await photoCloneDocumentRecords(old.id,d.id,d.snapshot?.steps||[])))return toast('Не удалось скопировать фото в новую версию СОП','error');
 docs.push(d); await docDbPut(d); await docWriteJsonToNetwork(d); await docAppendJournal({action:'new_version',documentId:d.id,versionOf:old.id,version:nextVersion}); docLoadToState(d); await restoreStepPhotos(state.steps,d.id);renderSteps();state.documentManager={...state.documentManager,currentId:d.id,status:'Черновик',seqNo:old.seqNo,deptCode:old.deptCode,year:old.year,version:nextVersion,createdAt:d.createdAt,updatedAt:d.updatedAt,createdBy:old.createdBy||'',publishedBy:'',versionOf:old.id}; state.meta.sopNumber=''; setVal('meta-sop-number',''); setVal('docVersion',nextVersion); saveDraft(); renderDocumentManager(); document.querySelector('[data-tab="editor"]')?.click(); toast(`Создан черновик новой версии. Версия ${nextVersion} будет зафиксирована только при публикации.`,'success'); return d;
}
function docLoadToState(doc){if(!doc?.snapshot)return;const s=doc.snapshot;state.meta={...state.meta,...(s.meta||{})};state.description=s.description||'';state.openQuestions=Array.isArray(s.openQuestions)?s.openQuestions:[];state.responsibles=Array.isArray(s.responsibles)&&s.responsibles.length?s.responsibles:[''];state.agreedList=Array.isArray(s.agreedList)&&s.agreedList.length?s.agreedList:[{post:'',name:''}];state.safetyIconIds=Array.isArray(s.safetyIconIds)?s.safetyIconIds:[];state.frvMeta={...state.frvMeta,...(s.frvMeta||{})};state.steps=(s.steps||[]).map(normalizeStepShape);stepIdCounter=Math.max(stepIdCounter,...state.steps.map(st=>st.id||0));state.checklist=Array.isArray(s.checklist)?s.checklist:state.checklist;state.twi={...state.twi,...(s.twi||{})};state.frvStudy=s.frvStudy||null;state.documentManager={currentId:doc.id,status:doc.status,deptCode:doc.deptCode||'',year:doc.year||new Date().getFullYear(),version:doc.version||1,seqNo:doc.seqNo||null,createdAt:doc.createdAt||Date.now(),updatedAt:doc.updatedAt||Date.now(),createdBy:doc.createdBy||'',publishedBy:doc.publishedBy||'',versionOf:doc.versionOf||null};restoreSopReviewState(s);state.stage27=stage27Normalize(s.stage27);stateToHtml();stage27ResetTransient();stage27Render();renderRestoredSopReviewState()}
let _docOpenInProgress=false;
async function docOpen(id){
  if(_docOpenInProgress)return;
  _docOpenInProgress=true;
  try{
    const doc=await docDbGet(id);
    if(!doc)return toast('Документ не найден','error');
    docLoadToState(doc);
    const restoredPhotos=await restoreStepPhotos(state.steps,doc.id);
    renderSteps();
    await renderDocumentManager();
    applyDocumentLock();
    toast(`Открыт: ${doc.number||'Черновик'} — ${doc.title}${restoredPhotos.restored?` · фото: ${restoredPhotos.restored}`:''}${restoredPhotos.lost?` · не восстановлено: ${restoredPhotos.lost}`:''}`,'success');
  }catch(e){console.error('Открытие СОП',e);toast('Не удалось открыть СОП: '+e.message,'error')}
  finally{_docOpenInProgress=false}
}
async function docNew(){
  const readOnly=['Опубликован','Архив'].includes(state.documentManager?.status);
  if(!readOnly&&(state.steps.length||state.description)&&!confirm('Создать новый документ? Сначала сохраните текущий черновик при необходимости.'))return;
  state.documentManager={currentId:null,status:'Черновик',deptCode:'',year:new Date().getFullYear(),version:1,seqNo:null,createdBy:'',publishedBy:'',versionOf:null};
  state.meta=Object.fromEntries(Object.keys(state.meta).map(key=>[key,'']));
  state.description='';state.openQuestions=[];state.steps=[];state.frvStudy=null;state.stage27=stage27Empty();
  state.responsibles=[''];state.agreedList=[{post:'',name:''}];state.safetyIconIds=[];
  state.frvMeta={observers:'',quality:'',other:'',purpose:'зафиксировать текущее исполнение операции',tOp:'',tVdc:'',tM2:'',tM1:'',tMove:'',tArea:'',tIn:'',tOut:''};
  state.checklist=JSON.parse(JSON.stringify(CHECKLIST_DEFAULT));
  state.twi={enabled:false,trainer:'',trainee:'',prepare:{purpose:'',known:'',prep:'',interest:''},present:{round1:'',round2:'',round3:''},tryOut:{perform:'',explain:'',check:'',correct:''},followUp:{help:'',control:'',observe:'',close:''}};
  restoreSopReviewState(null);stateToHtml();stage27ResetTransient();stage27Render();renderRestoredSopReviewState();renderDocumentManager();saveDraft();toast('Создан новый чистый черновик','info');
}
async function docDownloadJson(){
  try{
    const dm=state.documentManager||{},snapshot=docSnapshot();
    const payload=await docBuildPortableJson({id:dm.currentId||null,status:dm.status,number:docFormatNumber(dm),seqNo:dm.seqNo||null,deptCode:dm.deptCode||'',year:dm.year,version:dm.version,snapshot},{preferActive:true});
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${(docFormatNumber(dm)==='Черновик'?'Черновик':docFormatNumber(dm)).replace(/[^\wА-Яа-я0-9.-]+/g,'_')}_с_фотографиями.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Сохранён переносимый JSON с фотографиями и разметкой','success');
  }catch(e){toast('Не удалось создать полную копию: '+e.message,'error')}
}
let _renderDocumentManagerBusy=false;
async function renderDocumentManager(){
 if(_renderDocumentManagerBusy)return;
 _renderDocumentManagerBusy=true;
 try{
 const list=$('docLibraryList'),badge=$('docCountBadge'),info=$('docCurrentInfo');
 if(!list||!badge||!info)return;
 let docs=await docDbGetAll();
 const q=String($('docLibrarySearch')?.value||'').trim().toLowerCase();
 const sf=$('docLibraryStatusFilter')?.value||'all';
 const df=$('docLibraryDeptFilter')?.value||'all';
 const yf=$('docLibraryYearFilter')?.value||'all';
 const sort=$('docLibrarySort')?.value||'updated';
 const deptSel=$('docLibraryDeptFilter'),yearSel=$('docLibraryYearFilter');
 if(deptSel){const cur=deptSel.value;const vals=[...new Set(docs.map(d=>String(d.deptCode||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));deptSel.innerHTML='<option value="all">Все подразделения</option>'+vals.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join('');deptSel.value=vals.includes(cur)?cur:'all'}
 if(yearSel){const cur=yearSel.value;const vals=[...new Set(docs.map(d=>String(d.year||'')).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));yearSel.innerHTML='<option value="all">Все годы</option>'+vals.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join('');yearSel.value=vals.includes(cur)?cur:'all'}
 if(q)docs=docs.filter(d=>[d.title,d.number,d.deptCode,String(d.seqNo||''),String(d.year||'')].some(v=>String(v||'').toLowerCase().includes(q)));
 if(sf!=='all')docs=docs.filter(d=>d.status===sf);
 if(df!=='all')docs=docs.filter(d=>String(d.deptCode||'')===df);
 if(yf!=='all')docs=docs.filter(d=>String(d.year||'')===yf);
 docs.sort((a,b)=>sort==='number'?String(a.number||'Черновик').localeCompare(String(b.number||'Черновик'),'ru',{numeric:true}):sort==='title'?String(a.title||'').localeCompare(String(b.title||''),'ru'):((b.updatedAt||0)-(a.updatedAt||0)));
 badge.textContent=String(docs.length);
 const statusClass={Черновик:'bg-amber-100 text-amber-800',Опубликован:'bg-green-100 text-green-800',Архив:'bg-slate-200 text-slate-700'};
 if(!docs.length){list.innerHTML='<div class="text-sm text-slate-400">По заданным условиям документы не найдены.</div>'}
 else{
   list.innerHTML=docs.map(d=>{
     const versionBtn=d.status==='Опубликован'?'<button data-doc-version="'+escapeHtml(d.id)+'" class="btn-review px-2 py-1 rounded text-xs">＋ Версия</button>':'';
     return '<div class="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-xl"><div class="min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-semibold text-sm truncate">'+escapeHtml(d.title)+'</span><span class="chip '+(statusClass[d.status]||'')+'">'+escapeHtml(d.status)+'</span><span class="text-xs text-slate-500">'+escapeHtml(d.number||'Черновик')+'</span></div><div class="text-xs text-slate-500 mt-1">Подразделение: '+escapeHtml(d.deptCode||'—')+' · Создан: '+new Date(d.createdAt||d.updatedAt).toLocaleDateString('ru-RU')+' · Изменён: '+new Date(d.updatedAt).toLocaleString('ru-RU')+'</div></div><div class="flex gap-2 flex-shrink-0"><button data-doc-open="'+escapeHtml(d.id)+'" class="btn-ghost px-2 py-1 rounded border text-xs">Открыть</button><button data-doc-xlsx="'+escapeHtml(d.id)+'" class="btn-primary px-2 py-1 rounded text-xs">XLSX</button>'+versionBtn+'</div></div>';
   }).join('');
 }
 list.querySelectorAll('[data-doc-open]').forEach(b=>b.addEventListener('click',()=>docOpen(b.dataset.docOpen)));
 list.querySelectorAll('[data-doc-version]').forEach(b=>b.addEventListener('click',()=>docNewVersion(b.dataset.docVersion)));
 list.querySelectorAll('[data-doc-xlsx]').forEach(b=>b.addEventListener('click',async()=>{await docOpen(b.dataset.docXlsx);await generateExcel()}));
 const dm=state.documentManager||{};
 setVal('docDeptCode',dm.deptCode||'');setVal('docYear',dm.year||new Date().getFullYear());setVal('docVersion',dm.version||1);setVal('docCreatedBy',dm.createdBy||'');setVal('docPublishedBy',dm.publishedBy||'');
 info.innerHTML='<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2"><div><b>Название:</b> '+escapeHtml(state.meta.operation||'—')+'</div><div><b>Статус:</b> '+escapeHtml(dm.status||'Черновик')+'</div><div><b>Номер:</b> '+escapeHtml(docFormatNumber(dm))+'</div><div><b>Подразделение:</b> '+escapeHtml(dm.deptCode||'—')+'</div><div><b>Год:</b> '+escapeHtml(String(dm.year||'—'))+'</div><div><b>Версия:</b> '+escapeHtml(String(dm.version||'—'))+'</div><div><b>Создан:</b> '+(dm.createdAt?new Date(dm.createdAt).toLocaleString('ru-RU'):'—')+'</div><div><b>Изменён:</b> '+(dm.updatedAt?new Date(dm.updatedAt).toLocaleString('ru-RU'):'—')+'</div><div><b>Создал:</b> '+escapeHtml(dm.createdBy||'—')+'</div><div><b>Опубликовал:</b> '+escapeHtml(dm.publishedBy||'—')+'</div><div><b>Предыдущая версия:</b> '+escapeHtml(dm.versionOf||'—')+'</div></div>';
 const tree=$('docVersionTree');
 if(tree){tree.innerHTML='';if(dm.currentId){const all=await docDbGetAll();const current=all.find(d=>d.id===dm.currentId);const root=current?.versionOf?all.find(d=>d.id===current.versionOf):current;const seq=root?.seqNo||current?.seqNo;if(seq){const chain=all.filter(d=>Number(d.seqNo)===Number(seq)&&String(d.deptCode)===String(root?.deptCode||current?.deptCode)&&Number(d.year)===Number(root?.year||current?.year)).sort((a,b)=>Number(a.version||0)-Number(b.version||0));tree.innerHTML='<div class="text-xs font-semibold text-slate-600 mb-2">История версий</div><div class="flex flex-wrap gap-2">'+chain.map(d=>'<button data-doc-chain="'+escapeHtml(d.id)+'" class="px-2 py-1 rounded-lg border text-xs '+(d.id===dm.currentId?'bg-blue-50 border-blue-300 text-blue-700':'bg-white border-slate-200 text-slate-600')+'">v'+escapeHtml(String(d.version||'—'))+' · '+escapeHtml(d.status)+' · '+escapeHtml(d.number||'Черновик')+'</button>').join('')+'</div>';tree.querySelectorAll('[data-doc-chain]').forEach(b=>b.addEventListener('click',()=>docOpen(b.dataset.docChain)))}}}
 renderDocumentFolderStatus();
 applyDocumentLock();
 }finally{_renderDocumentManagerBusy=false}
}
async function initDocumentManager(){try{await docDbOpen();renderDocumentManager();renderDocumentFolderStatus();renderNetworkSyncInfo();setTimeout(docAutoSyncOnStart,300)}catch(e){console.warn('Библиотека СОП init',e)}}

