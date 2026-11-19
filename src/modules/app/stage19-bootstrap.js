// ============================================================
// 15. UI events / init
// ============================================================
document.addEventListener('input',e=>{if(e.target.closest('#tab-editor,#tab-frv')&&!e.target.closest('#stepsContainer')){htmlFieldToState();saveDraftDebounced()}});document.addEventListener('change',e=>{if(e.target.closest('#tab-editor,#tab-frv')&&!e.target.closest('#stepsContainer')){htmlFieldToState();saveDraftDebounced()}});
$('addStepBtn').addEventListener('click',()=>{state.steps.push(createEmptyStep());stateChanged();renderFrv();toast('Шаг добавлен','info')});$('loadDemoBtn').addEventListener('click',loadDemoData);$('generateBtn').addEventListener('click',generateExcel);$('refreshPreviewBtn').addEventListener('click',renderPreview);$('generateSopBtn').addEventListener('click',generateSOP);$('reviewSopBtn').addEventListener('click',reviewEntireSOP);$('closeReviewBtn').addEventListener('click',()=>$('sopReviewContainer').classList.add('hidden'));$('importSopBtn').addEventListener('click',()=>$('importSopInput').click());$('importSopInput').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив'){toast('Опубликованный или архивный документ нельзя изменять. Создайте новую версию.','info');return;}if(state.steps.length&&!confirm('Импортировать СОП из файла? Текущие шаги будут заменены.'))return;try{await importSopFromXlsx(f)}catch(err){toast('Не удалось импортировать: '+err.message,'error')}});
document.querySelectorAll('#tab-twi input,#tab-twi textarea').forEach(el=>el.addEventListener('input',()=>{htmlToTwi();renderTwiSummary();saveDraftDebounced()}));
$('generateTwiBtn')?.addEventListener('click',generateTwiPlan);
$('clearTwiBtn')?.addEventListener('click',clearTwi);
$('modelSelector').innerHTML=YANDEX_MODELS.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');$('modelSelector').value=currentModel;$('modelSelector').addEventListener('change',()=>{currentModel=$('modelSelector').value;try{localStorage.setItem('sop-ai-model',currentModel)}catch(e){};setAIStatus('idle','AI: не проверен');toast('Модель ИИ изменена','info')});$('aiTestBtn').addEventListener('click',testAIConnection);
$('documentLockNewVersionBtn')?.addEventListener('click',()=>docNewVersion());$('docSaveDraftBtn')?.addEventListener('click',()=>docSaveCurrent('Черновик'));$('docPublishBtn')?.addEventListener('click',docPublishCurrent);$('docArchiveBtn')?.addEventListener('click',docArchiveCurrent);$('docNewBtn')?.addEventListener('click',docNew);$('docNewVersionCurrentBtn')?.addEventListener('click',()=>docNewVersion());$('docDownloadJsonBtn')?.addEventListener('click',docDownloadJson);$('docImportJsonBtn')?.addEventListener('click',()=>$('docImportJsonInput')?.click());$('docImportJsonInput')?.addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await docImportPortableBackup(file)});$('docDownloadXlsxBtn')?.addEventListener('click',()=>generateExcel());$('docChooseFolderBtn')?.addEventListener('click',docChooseFolder);$('docSyncFolderBtn')?.addEventListener('click',docSyncFolder);$('docTestFolderBtn')?.addEventListener('click',docTestFolder);$('docIntegrityBtn')?.addEventListener('click',async()=>{const r=await docVerifyNetworkIntegrity();toast(r.ok?'Проверка целостности завершена: ошибок нет.':`Найдено повреждённых JSON: ${r.bad.length}` ,r.ok?'success':'error')});$('docBackupsBtn')?.addEventListener('click',renderBackupList);$('docHistoryBtn')?.addEventListener('click',renderDocumentHistory);$('docSelfTestBtn')?.addEventListener('click',docRunSelfTest);['docLibrarySearch','docLibraryStatusFilter','docLibraryDeptFilter','docLibraryYearFilter','docLibrarySort'].forEach(id=>$(id)?.addEventListener('input',renderDocumentManager));['docLibraryStatusFilter','docLibraryDeptFilter','docLibraryYearFilter','docLibrarySort'].forEach(id=>$(id)?.addEventListener('change',renderDocumentManager));['docDeptCode','docYear','docVersion','docCreatedBy','docPublishedBy'].forEach(id=>$(id)?.addEventListener('input',()=>{state.documentManager={...state.documentManager,deptCode:$('docDeptCode').value,year:Number($('docYear').value)||new Date().getFullYear(),version:Number($('docVersion').value)||1,createdBy:$('docCreatedBy').value,publishedBy:$('docPublishedBy').value};saveDraftDebounced()}));
document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected',String(b===btn));b.tabIndex=b===btn?0:-1});btn.classList.add('active');document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));$('tab-'+btn.dataset.tab).classList.remove('hidden');if(btn.dataset.tab==='preview')renderPreview();if(btn.dataset.tab==='frv')renderFrv();if(btn.dataset.tab==='checklist')renderChecklist();if(btn.dataset.tab==='frvstudy')renderFrvStudy();if(btn.dataset.tab==='twi')renderTwi();if(btn.dataset.tab==='documents')renderDocumentManager();if(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив')requestAnimationFrame(applyDocumentLock)}));
// Блокировка применяется явно после отрисовки. Глобальный MutationObserver удалён: он мог зациклиться с Tailwind CDN при открытии опубликованного документа.

// Desktop keyboard/screen-reader semantics for existing dynamically rendered forms.
function enhanceFormAccessibility(root=document){
  root.querySelectorAll('input,textarea,select').forEach(el=>{
    if(el.matches('[type="hidden"]')||el.hasAttribute('aria-label')||el.hasAttribute('aria-labelledby'))return;
    if(el.labels?.length)return;
    let lab=el.parentElement?.querySelector(':scope > label');
    if(!lab)lab=el.parentElement?.parentElement?.querySelector(':scope > label');
    if(lab){
      if(el.id){lab.htmlFor=el.id;return}
      const direct=String(lab.textContent||'').replace(/✨/g,'').trim();
      if(direct){el.setAttribute('aria-label',direct);return}
    }
    const stepId=el.dataset.id||el.dataset.km||el.dataset.photo||'';
    if(el.dataset.km!=null)el.setAttribute('aria-label',`Ключевой момент ${Number(el.dataset.ki)+1}, шаг ${stepId}`);
    else if(el.dataset.stepField)el.setAttribute('aria-label',`${{action:'Действие',reason:'Причина',duration:'Время'}[el.dataset.stepField]||el.dataset.stepField}, шаг ${stepId}`);
    else if(el.dataset.extra)el.setAttribute('aria-label',`${{successCriteria:'Критерий успешного выполнения',decisionPoints:'Действия при отклонении',commonPitfalls:'Типичные ошибки'}[el.dataset.extra]||el.dataset.extra}, шаг ${stepId}`);
    else if(el.dataset.resp!=null)el.setAttribute('aria-label',`ФИО участника ${Number(el.dataset.resp)+1}`);
    else if(el.dataset.agp!=null)el.setAttribute('aria-label',`Должность согласующего ${Number(el.dataset.agp)+1}`);
    else if(el.dataset.agn!=null)el.setAttribute('aria-label',`ФИО согласующего ${Number(el.dataset.agn)+1}`);
    else if(el.getAttribute('placeholder'))el.setAttribute('aria-label',el.getAttribute('placeholder'));
    else if(el.id)el.setAttribute('aria-label',el.id.replace(/[-_]/g,' '));
  });
}
function initTabAccessibility(){
  const buttons=[...document.querySelectorAll('.tab-btn')];
  for(const btn of buttons){
    const panel=$('tab-'+btn.dataset.tab);if(!panel)continue;
    btn.setAttribute('role','tab');btn.setAttribute('aria-controls',panel.id);
    btn.id='sop-tab-'+btn.dataset.tab;
    btn.setAttribute('aria-selected',btn.classList.contains('active')?'true':'false');
    btn.tabIndex=btn.classList.contains('active')?0:-1;
    panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',btn.id);panel.tabIndex=0;
    btn.addEventListener('keydown',e=>{
      const index=buttons.indexOf(btn);let next=-1;
      if(e.key==='ArrowRight')next=(index+1)%buttons.length;
      else if(e.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;
      else if(e.key==='Home')next=0;
      else if(e.key==='End')next=buttons.length-1;
      if(next>=0){e.preventDefault();buttons[next].click();buttons[next].focus()}
    });
  }
}
function initDynamicAccessibility(){
  enhanceFormAccessibility();initTabAccessibility();
  const main=document.querySelector('.max-w-7xl')||document.body;
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.addedNodes.length))queueMicrotask(()=>enhanceFormAccessibility(main));
  });
  observer.observe(main,{childList:true,subtree:true});
}
window.addEventListener('beforeunload',()=>{if(!(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив'))htmlFieldToState();saveDraft()});
(async function init(){initDynamicAccessibility();renderIconPicker();renderResponsibles();renderAgreed();renderSteps();renderFrv();renderChecklist();ensureFrvStudy();renderFrvStudy();if(!$('meta-date').value)setVal('meta-date',new Date().toISOString().slice(0,10));initDraft();initDocumentManager();pingAI()})();
function renderResponsibles(){const c=$('respContainer');c.innerHTML=state.responsibles.map((v,i)=>`<div class="flex gap-2 mb-2"><input data-resp="${i}" value="${escapeHtml(v)}" placeholder="ФИО" class="flex-1 px-3 py-2 border rounded-lg text-sm">${state.responsibles.length>1?`<button data-rm-resp="${i}" class="text-red-500 px-3">✕</button>`:''}</div>`).join('')+`<button id="addRespBtn" class="text-xs text-blue-600 font-medium">+ Добавить участника</button>`;c.querySelectorAll('[data-resp]').forEach(i=>i.addEventListener('input',e=>{state.responsibles[Number(e.target.dataset.resp)]=e.target.value;saveDraftDebounced()}));c.querySelectorAll('[data-rm-resp]').forEach(b=>b.addEventListener('click',()=>{state.responsibles.splice(Number(b.dataset.rmResp),1);renderResponsibles();stateChanged(false)}));$('addRespBtn').addEventListener('click',()=>{state.responsibles.push('');renderResponsibles();stateChanged(false)})}
function renderAgreed(){const c=$('agreedContainer');c.innerHTML=state.agreedList.map((a,i)=>`<div class="flex gap-2 mb-2"><input data-agp="${i}" value="${escapeHtml(a.post)}" placeholder="Должность" class="flex-1 px-3 py-2 border rounded-lg text-sm"><input data-agn="${i}" value="${escapeHtml(a.name)}" placeholder="ФИО" class="flex-1 px-3 py-2 border rounded-lg text-sm">${state.agreedList.length>1?`<button data-rma="${i}" class="text-red-500 px-3">✕</button>`:''}</div>`).join('')+(state.agreedList.length<3?`<button id="addAgreedBtn" class="text-xs text-blue-600 font-medium">+ Добавить согласующего</button>`:'');c.querySelectorAll('[data-agp]').forEach(i=>i.addEventListener('input',e=>{state.agreedList[Number(e.target.dataset.agp)].post=e.target.value;saveDraftDebounced()}));c.querySelectorAll('[data-agn]').forEach(i=>i.addEventListener('input',e=>{state.agreedList[Number(e.target.dataset.agn)].name=e.target.value;saveDraftDebounced()}));c.querySelectorAll('[data-rma]').forEach(b=>b.addEventListener('click',()=>{state.agreedList.splice(Number(b.dataset.rma),1);renderAgreed();stateChanged(false)}));if($('addAgreedBtn'))$('addAgreedBtn').addEventListener('click',()=>{state.agreedList.push({post:'',name:''});renderAgreed();stateChanged(false)})}
