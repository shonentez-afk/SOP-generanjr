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
    const canApply=!!iss.fixValue && !applied && !withdrawn && !deferred;
    const disputeOpen=!!iss.disputeOpen;
    return `<div class="review-issue ${cssFor(iss.severity)}" style="${deferred?'opacity:.72;':''}">
      <div class="flex items-center gap-2 flex-wrap mb-1">
        <span class="review-badge ${cssFor(iss.severity)}">${cssFor(iss.severity)==='critical'?'Безопасность/критично':cssFor(iss.severity)==='warning'?'Улучшить':'Вопрос'}</span>
        ${applied?'<span class="review-badge info">✅ Применено</span>':''}
        ${withdrawn?'<span class="review-badge" style="background:#dcfce7;color:#166534;">🤝 Снято наставником</span>':''}
        ${deferred?'<span class="review-badge info">⏸ Отложено</span>':''}
        ${iss.stepId?`<span class="review-step-link" data-goto-step="${iss.stepId}">→ Шаг ${iss.stepId}</span>`:''}
      </div>
      <div class="text-sm text-slate-800 mb-1">${escapeHtml(iss.description)}</div>
      ${iss.why?`<div class="text-xs text-slate-700 mb-1">❓ <b>Почему:</b> ${escapeHtml(iss.why)}</div>`:''}
      ${iss.suggestion?`<div class="text-xs bg-white p-2 rounded border mb-1">💡 <b>${iss.field==='decisionPoints' && !iss.fixValue ? 'Что нужно уточнить:' : 'Предложение:'}</b> ${escapeHtml(iss.suggestion)}</div>`:''}
      ${iss.fixValue&&!applied&&!deferred?`<div class="text-xs bg-emerald-50 p-2 rounded border border-emerald-200 mb-1">✅ <b>Готовое исправление:</b> ${escapeHtml(iss.fixValue)}</div>`:''}${withdrawn?'<div class="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 mb-1">🤝 Наставник согласился снять это замечание. История диалога сохранена.</div>':''}
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
function applyIssueFix(idx){
  const iss=reviewIssues[idx];
  if(!iss?.fixValue)return toast('Для этого замечания нет готового текста исправления','info');
  if(iss.stepId){
    const s=state.steps[iss.stepId-1];
    if(!s)return;
    if(iss.field==='action')s.action=iss.fixValue;
    else if(iss.field==='reason')s.reason=iss.fixValue;
    else if(iss.field==='time')s.durationSeconds=parseDuration(iss.fixValue);
    else if(iss.field==='keyMoments')s.keyMoments=[...s.keyMoments.filter(Boolean),iss.fixValue].slice(0,3);
    else if(iss.field==='successCriteria')s.successCriteria=iss.fixValue;
  }else if(iss.field&&$('meta-'+iss.field)){
    $('meta-'+iss.field).value=iss.fixValue;
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
