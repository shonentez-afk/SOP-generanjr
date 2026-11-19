function renderReviewResults(review){
  const cont=$('sopReviewContainer');
  cont.classList.remove('hidden');
  const all=reviewIssues;
  const deferredCount=all.filter(i=>i.status==='deferred'||isDeferredIssue(i)).length;
  const visible=all.map((iss,idx)=>({iss,idx})).filter(x=>showDeferredReviewIssues || (x.iss.status!=='deferred' && !isDeferredIssue(x.iss)));
  const active=all.filter(i=>i.status!=='deferred'&&!isDeferredIssue(i));
  const crit=active.filter(i=>(i.severity==='critical'||i.severity==='safety_gap')&&i.status!=='withdrawn').length;
  const warn=active.filter(i=>(i.severity==='warning'||i.severity==='improvement')&&i.status!=='withdrawn').length;
  const info=active.filter(i=>(i.severity==='info'||i.severity==='question')&&i.status!=='withdrawn').length;
  const labels={excellent:'✅ Отличное качество СОП',good:'👍 Хорошее качество',needs_improvement:'⚠️ Есть точки роста',poor:'🛠 Требует доработки'};
  $('sopReviewSummary').innerHTML=`<div class="flex items-center justify-between flex-wrap gap-2"><div class="text-sm font-semibold">${labels[review.overall_quality]||'Проверка завершена'}</div><div class="flex gap-2 flex-wrap">${crit?`<span class="review-badge critical">🔴 ${crit}</span>`:''}${warn?`<span class="review-badge warning">🟡 ${warn}</span>`:''}${info?`<span class="review-badge info">🔵 ${info}</span>`:''}${deferredCount?`<button type="button" data-toggle-deferred class="px-2 py-1 rounded border border-slate-300 text-slate-600 text-xs font-medium">${showDeferredReviewIssues?'Скрыть':'Показать'} отложенные (${deferredCount})</button>`:''}</div></div>${review.summary?`<div class="text-xs text-slate-600 mt-2">${escapeHtml(review.summary)}</div>`:''}`;
  stage28EnhanceReviewSummary();
  const target=$('sopReviewIssues');
  if(!visible.length){
    target.innerHTML=deferredCount&&!showDeferredReviewIssues?'<div class="text-center py-4 text-slate-500 bg-slate-50 rounded">Все отложенные замечания скрыты из текущего списка. Они не учитываются при повторной проверке.</div>':'<div class="text-center py-4 text-green-700 font-semibold bg-green-50 rounded">✓ Замечаний не найдено</div>';
    $('sopReviewSummary').querySelector('[data-toggle-deferred]')?.addEventListener('click',toggleDeferredReview);
    return;
  }
  target.innerHTML=visible.map(({iss,idx})=>{
    const deferred=iss.status==='deferred'||isDeferredIssue(iss);
    const applied=iss.status==='applied';
    const withdrawn=iss.status==='withdrawn';
    const canApply=!!reviewGetApplicableFix(iss);
    const disputeOpen=!!iss.disputeOpen;
    const evidenceView=iss.evidenceKind?
      '<div class="text-xs rounded border p-2 mb-1 '+
      (iss.evidenceVerified?'border-indigo-200 bg-indigo-50 text-indigo-900':'border-amber-200 bg-amber-50 text-amber-900')+'">'+
      '<b>'+(iss.evidenceKind==='observed'?'📎 Основание по СОП':
      iss.evidenceKind==='hypothesis'?'⚠ Гипотеза — проверить':'❔ Требует уточнения')+':</b> '+
      escapeHtml(iss.evidenceSource||'Поля СОП')+
      (iss.evidence?' — «'+escapeHtml(iss.evidence)+'»':'')+
      '. '+escapeHtml(iss.evidenceNote||'')+'</div>':'';
    return `<div class="review-issue ${cssFor(iss.severity)}" style="${deferred?'opacity:.72;':''}">
      <div class="flex items-center gap-2 flex-wrap mb-1">
        <span class="review-badge ${cssFor(iss.severity)}">${cssFor(iss.severity)==='critical'?'Безопасность/критично':cssFor(iss.severity)==='warning'?'Улучшить':'Вопрос'}</span>
        ${applied?'<span class="review-badge info">✅ Применено</span>':''}
        ${withdrawn?'<span class="review-badge" style="background:#dcfce7;color:#166534;">🤝 Снято наставником</span>':''}
        ${deferred?'<span class="review-badge info">⏸ Отложено</span>':''}
        ${iss.stepId?`<span class="review-step-link" data-goto-step="${iss.stepId}">→ Шаг ${iss.stepId}</span>`:''}
      </div>
      <div class="text-sm text-slate-800 mb-1">${escapeHtml(iss.description)}</div>
      ${evidenceView}
      ${iss.why?`<div class="text-xs text-slate-700 mb-1">❓ <b>Почему:</b> ${escapeHtml(iss.why)}</div>`:''}
      ${iss.suggestion?`<div class="text-xs bg-white p-2 rounded border mb-1">💡 <b>${iss.field==='decisionPoints' && !reviewNormalizeFixValue(iss.fixValue) ? 'Что нужно уточнить:' : 'Предложение:'}</b> ${escapeHtml(iss.suggestion)}</div>`:''}
      ${canApply?`<div class="text-xs bg-emerald-50 p-2 rounded border border-emerald-200 mb-1">✅ <b>Готовое исправление:</b> ${escapeHtml(reviewNormalizeFixValue(iss.fixValue))}</div>`:''}${withdrawn?'<div class="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 mb-1">🤝 Наставник согласился снять это замечание. История диалога сохранена.</div>':''}
      ${(iss.thread||[]).map(m=>`<div class="mt-2 text-xs p-2 rounded ${m.role==='user'?'bg-blue-50 border border-blue-200':m.role==='system'?'bg-amber-50 border border-amber-200':'bg-emerald-50 border border-emerald-200'}"><b>${m.role==='user'?'👷 Вы':m.role==='system'?'⚠️ Система':'🧑‍ Наставник'}</b>: ${escapeHtml(m.role==='mentor'?mentorCleanDisputeReply(m.text):m.text)}</div>`).join('')}
      <div class="flex gap-2 mt-2 flex-wrap">
        ${canApply?`<button data-apply="${idx}" class="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-semibold">✅ Применить</button>`:''}
        ${!applied&&!withdrawn&&!deferred?`<button data-dispute="${idx}" class="px-2 py-1 rounded border border-slate-300 text-slate-600 text-xs">💬 ${disputeOpen?'Скрыть спор':'Оспорить'}</button>`:''}
        ${!applied&&!withdrawn&&!deferred?`<button data-defer="${idx}" class="px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 text-xs font-medium">⏸ Отложить</button>`:''}
        ${deferred?`<button data-restore-deferred="${idx}" class="px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium">↩ Вернуть</button>`:''}
      </div>
      <div id="dispute-${idx}" class="${disputeOpen?'':'hidden'} mt-2">
        <textarea data-dispute-input="${idx}" rows="2" class="w-full px-2 py-1 border rounded text-xs" placeholder="Почему вы не согласны?">${escapeHtml(iss.pendingDraft||'')}</textarea>
        <div class="flex gap-2 mt-1">
          <button data-dispute-send="${idx}" ${iss.pending?'disabled':''} class="px-2 py-1 rounded bg-violet-600 text-white text-xs disabled:opacity-50">${iss.pending?'⏳ Наставник отвечает…':'Отправить наставнику'}</button>
          <button data-dispute-close="${idx}" type="button" class="px-2 py-1 rounded border border-slate-300 text-slate-600 text-xs">Закрыть</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $('sopReviewSummary').querySelector('[data-toggle-deferred]')?.addEventListener('click',toggleDeferredReview);
  target.querySelectorAll('[data-goto-step]').forEach(el=>el.addEventListener('click',()=>{document.querySelector('[data-tab="editor"]').click();const card=document.querySelectorAll('.step-card')[Number(el.dataset.gotoStep)-1];if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('highlight-ring');setTimeout(()=>card.classList.remove('highlight-ring'),2400)}}));
  target.querySelectorAll('[data-apply]').forEach(b=>b.addEventListener('click',()=>applyIssueFix(Number(b.dataset.apply))));
  target.querySelectorAll('[data-defer]').forEach(b=>b.addEventListener('click',()=>deferIssue(Number(b.dataset.defer))));
  target.querySelectorAll('[data-restore-deferred]').forEach(b=>b.addEventListener('click',()=>restoreDeferredIssue(Number(b.dataset.restoreDeferred))));
  target.querySelectorAll('[data-dispute]').forEach(b=>b.addEventListener('click',()=>{const iss=reviewIssues[Number(b.dataset.dispute)];if(iss){iss.disputeOpen=!iss.disputeOpen;renderReviewResults(reviewSummary||{})}}));
  target.querySelectorAll('[data-dispute-close]').forEach(b=>b.addEventListener('click',()=>{const iss=reviewIssues[Number(b.dataset.disputeClose)];if(iss){iss.disputeOpen=false;iss.pendingDraft='';renderReviewResults(reviewSummary||{})}}));
  target.querySelectorAll('[data-dispute-send]').forEach(b=>b.addEventListener('click',async()=>sendDispute(Number(b.dataset.disputeSend))));
  target.querySelectorAll('[data-dispute-input]').forEach(ta=>ta.addEventListener('input',e=>{const iss=reviewIssues[Number(e.target.dataset.disputeInput)];if(iss)iss.pendingDraft=e.target.value}));
}
function stage28StatusText(){
  if(!stage28ReviewMeta?.aiComplete){
    return 'Последняя проверка: только правила либо старый формат; для выборочной проверки сначала проверьте весь СОП.';
  }
  const diff=stage28CurrentDiff();
  if(diff.full)return 'Изменились общие условия, порядок или состав шагов — требуется полная проверка.';
  if(!diff.changed.length)return 'СОП не менялся с последней проверки. Замечания и история актуальны для этой редакции.';
  return 'Изменено шагов: '+diff.changed.length+
    '. Перепроверка охватит '+diff.affected.length+' шагов с соседними контекстами.';
}
function stage28UpdateReviewIndicator(){
  const status=$('stage28ReviewStatus');
  if(!status)return;
  status.textContent=stage28StatusText();
  const btn=$('stage28CheckChanged');
  if(!btn)return;
  const diff=stage28CurrentDiff();
  btn.disabled=!stage28ReviewMeta.aiComplete||!diff.changed.length&&!diff.full;
  btn.textContent=diff.full?'Проверить весь СОП':
    'Проверить изменённые шаги'+(diff.changed.length?' ('+diff.changed.length+')':'');
}
function stage28EnhanceReviewSummary(){
  const summary=$('sopReviewSummary');
  if(!summary)return;
  const safe=(stage28ReviewMeta?.aiComplete||reviewIssues.length)>0;
  const photo=stage28PhotoGuidance(state.steps);
  if(safe){
    const ui=document.createElement('div');
    ui.className='border-t border-slate-200 pt-2 mt-2 text-xs text-slate-600 flex items-center gap-2 flex-wrap';
    ui.innerHTML='<span id="stage28ReviewStatus" class="flex-1"></span>'+
      '<button type="button" id="stage28CheckChanged" class="btn-ghost px-3 py-1.5 border border-purple-200 rounded-lg text-purple-700 font-semibold">Проверить изменённые шаги</button>';
    summary.appendChild(ui);
    $('stage28CheckChanged')?.addEventListener('click',stage28ReviewChanged);
    stage28UpdateReviewIndicator();
  }
  if(photo.length){
    const detail=document.createElement('details');
    detail.className='mt-2 text-xs text-slate-700 border-t border-slate-100 pt-2';
    const attached=photo.filter(p=>p.hasPhoto).length;
    const missing=photo.length-attached;
    const head=document.createElement('summary');
    head.className='cursor-pointer font-semibold text-indigo-700';
    head.textContent='📷 Фото по текстовым подсказкам: '+attached+
      ' прикреплено, '+missing+' возможных кадров (не обязательны)';
    detail.appendChild(head);
    for(const p of photo){
      const item=document.createElement('div');
      item.className='mt-1 pl-3 text-slate-600';
      item.textContent='Шаг '+p.stepId+': '+p.message;
      detail.appendChild(item);
    }
    summary.appendChild(detail);
  }
}
if(typeof document!=='undefined'){
  document.addEventListener('input',event=>{
    if(!event.target?.closest?.('#tab-editor'))return;
    if(!$('sopReviewSummary')||!stage28ReviewMeta.aiComplete)return;
    requestAnimationFrame(stage28UpdateReviewIndicator);
  });
  document.addEventListener('change',event=>{
    if(!event.target?.closest?.('#tab-editor'))return;
    if(!$('sopReviewSummary')||!stage28ReviewMeta.aiComplete)return;
    requestAnimationFrame(stage28UpdateReviewIndicator);
  });
}

function applyIssueFix(idx){
  const iss=reviewIssues[idx];
  const fix=reviewGetApplicableFix(iss);
  if(!fix){
    toast('Готового безопасного исправления нет. Проверьте рекомендацию и измените поле вручную.','info');
    return;
  }
  if(fix.scope==='step'){
    const step=state.steps[fix.index];
    if(fix.field==='keyMoments'){
      step.keyMoments=[...step.keyMoments.filter(x=>String(x??'').trim()),fix.value];
    }else if(fix.field==='time'){
      step.durationSeconds=fix.value;
    }else{
      step[fix.field]=fix.value;
    }
  }else{
    const control=$('meta-'+fix.field);
    if(!control){
      toast('Не найдено поле для исправления. СОП не изменён.','error');
      return;
    }
    control.value=fix.value;
    htmlFieldToState();
  }
  iss.status='applied';
  iss.disputeOpen=false;
  iss.pendingDraft='';
  stateChanged();
  saveDraftDebounced();
  renderReviewResults(reviewSummary||{});
  toast('Применено ✅');
}
// Stage 17: repair AI mentor disputes without changing proxy, models or prompts.
// JSON received from the model (or an incomplete JSON HTTP response) is not
// always valid. Retry a format failure once, never invent a "withdraw" verdict.
