function runDeterministicChecks(){
  const issues=[],steps=Array.isArray(state.steps)?state.steps:[];
  const add=issue=>issues.push({
    severity:'info',type:'incomplete',stepId:null,field:null,
    fixValue:null,status:'open',thread:[],...issue
  });
  if(!steps.length){
    add({severity:'critical',type:'missing',description:'Нет ни одного шага',
      suggestion:'Добавьте шаги или сгенерируйте СОП'});
    return issues;
  }
  steps.forEach((step,i)=>{
    const s=step||{},number=i+1;
    const action=String(s.action||'').trim();
    const kms=(Array.isArray(s.keyMoments)?s.keyMoments:[])
      .map(x=>String(x??'').trim()).filter(Boolean);
    const reason=String(s.reason||'').trim();
    const success=String(s.successCriteria||'').trim();
    if(!action)add({severity:'critical',field:'action',stepId:number,
      description:'Шаг без действия',suggestion:'Опишите конкретное наблюдаемое действие'});
    // Key Points are 0..3 by the approved prompt; do not invent them to fill cells.
    if(!kms.length && reason)add({severity:'info',field:'keyMoments',stepId:number,
      description:'Есть пояснение, но ключевые моменты не выделены',
      suggestion:'Проверьте, есть ли действительно критичные детали выполнения. Если нет — поле можно оставить пустым.'});
    if(kms.length&&!reason)add({severity:'warning',field:'reason',stepId:number,
      description:'Не объяснены ключевые моменты',
      suggestion:'Для критичных ключевых моментов укажите, почему они важны.'});
    if(!Number.isFinite(Number(s.durationSeconds))||Number(s.durationSeconds)<=0)
      add({severity:'warning',field:'time',stepId:number,
        description:'Время не задано',
        suggestion:'Укажите фактическую или обоснованно рассчитанную длительность.'});
    if(Number(s.durationSeconds)>300&&!success)
      add({severity:'info',field:'time',stepId:number,type:'unrealistic',
        description:'Длинный шаг без критерия выполнения',
        suggestion:'Проверьте длительность и возможность разделения по самостоятельным действиям.'});
    const hasPhoto=!!(s.imageData||s.imageBuffer||s.hasPhoto||
      (Array.isArray(s.photoAnnotations)&&s.photoAnnotations.length));
    // Only recommend evidence when there is an explicit visual marker/photo hint.
    if(!hasPhoto && ((Array.isArray(s.visualMarkers)&&s.visualMarkers.some(Boolean))||
      String(s.photoHint||'').trim())){
      add({severity:'info',field:'photo',stepId:number,type:'missing',
        description:'В СОП есть визуальная подсказка, но фото не приложено',
        suggestion:'При необходимости добавьте фото. Для этого шага фотография не является обязательной.'});
    }
    if(!success)add({severity:'info',field:'action',stepId:number,
      description:'Не указан критерий успешного выполнения',
      suggestion:'Если результат можно проверить, опишите наблюдаемый критерий.'});
  });
  const safety=String(state.meta?.safety||'').trim();
  if(!safety){
    add({severity:'warning',field:'safety',type:'missing',
      description:'Не указаны условия безопасности',
      suggestion:'Уточните применимые риски, меры защиты и СИЗ по фактическим условиям работы.'});
  }else if(!/перчатк|очки|каска|щиток|маска|СИЗ|ботинки|спецодежд/i.test(safety)){
    add({severity:'info',field:'safety',type:'incomplete',
      description:'СИЗ в условиях безопасности не перечислены',
      suggestion:'Проверьте необходимость СИЗ для этой операции. Не добавляйте их без фактических оснований.'});
  }
  const seen=new Map();
  steps.forEach((s,i)=>{
    const key=normText(s?.action);
    if(!key)return;
    if(seen.has(key))add({severity:'warning',field:'action',stepId:i+1,
      type:'duplicate',description:'Повтор шага '+(seen.get(key)+1),
      suggestion:'Проверьте, являются ли действия дубликатами.'});
    else seen.set(key,i);
  });
  return issues;
}
function cssFor(sev){return sev==='critical'||sev==='safety_gap'?'critical':sev==='warning'||sev==='improvement'?'warning':'info'}
function renderChecklist(){const t=$('checklistTable');let h='<thead class="bg-slate-100"><tr><th class="px-2 py-1">№</th><th class="px-2 py-1 text-left">Требования</th><th class="px-2 py-1">Оценка</th><th class="px-2 py-1">Вес</th><th class="px-2 py-1">Балл</th><th class="px-2 py-1 text-left">Комментарий</th></tr></thead><tbody>';state.checklist.forEach(it=>{h+=`<tr><td class="px-2 py-1">${it.id}</td><td class="px-2 py-1">${escapeHtml(it.req)}</td><td class="px-2 py-1"><select data-score="${it.id}" class="border rounded px-1 py-0.5 text-xs w-full">${[0,.3,.7,1].map(v=>`<option value="${v}" ${it.score===v?'selected':''}>${v}</option>`).join('')}</select></td><td class="px-2 py-1 text-center">${it.weight}</td><td class="px-2 py-1 font-semibold text-blue-700">${(it.score*it.weight).toFixed(2)}</td><td class="px-2 py-1"><input data-comment="${it.id}" value="${escapeHtml(it.comment)}" class="w-full px-1 py-0.5 border rounded text-xs"></td></tr>`});const total=state.checklist.reduce((a,i)=>a+i.score*i.weight,0),weight=state.checklist.reduce((a,i)=>a+i.weight,0);h+=`</tbody><tfoot><tr class="bg-slate-100 font-semibold"><td colspan="3" class="px-2 py-2 text-right">ИТОГО:</td><td colspan="3" class="px-2 py-2 text-center">${(total/weight).toFixed(2)} (${total.toFixed(2)}/${weight})</td></tr></tfoot>`;t.innerHTML=h;t.querySelectorAll('[data-score]').forEach(s=>s.addEventListener('change',e=>{const it=state.checklist.find(x=>x.id===Number(e.target.dataset.score));if(it){it.score=Number(e.target.value);it.scoreSource='manual';renderChecklist();stateChanged()}}));t.querySelectorAll('[data-comment]').forEach(i=>i.addEventListener('input',e=>{const it=state.checklist.find(x=>x.id===Number(e.target.dataset.comment));if(it)it.comment=e.target.value;stateChanged(false)}))}
function issueFingerprint(issue){
  const step = issue?.stepId ? state.steps[issue.stepId-1] : null;
  return [
    Number(issue?.stepId)||0,
    normText(issue?.field||''),
    normText(step?.action||''),
    normText(issue?.description||'')
  ].join('|');
}
function isDeferredIssue(issue){return deferredIssueKeys.has(issueFingerprint(issue));}
function deferIssue(idx){
  const iss=reviewIssues[idx]; if(!iss) return;
  const key=issueFingerprint(iss);
  deferredIssueKeys.add(key);
  iss.status='deferred';
  iss.deferredAt=Date.now();
  showDeferredReviewIssues=false;
  saveDraftDebounced();
  renderReviewResults(reviewSummary||{});
  toast('Замечание отложено — повторная проверка его не покажет','info');
}
function restoreDeferredIssue(idx){
  const iss=reviewIssues[idx]; if(!iss) return;
  deferredIssueKeys.delete(issueFingerprint(iss));
  iss.status='open';
  delete iss.deferredAt;
  saveDraftDebounced();
  renderReviewResults(reviewSummary||{});
  toast('Замечание снова участвует в проверке','success');
}
function toggleDeferredReview(){
  showDeferredReviewIssues=!showDeferredReviewIssues;
  renderReviewResults(reviewSummary||{});
}

