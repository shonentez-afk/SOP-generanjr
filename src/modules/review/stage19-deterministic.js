function runDeterministicChecks(){const I=[],S=state.steps,P=o=>I.push({...{severity:'info',type:'incomplete',stepId:null,field:null,fixValue:null,status:'open',thread:[]},...o});if(!S.length){P({severity:'critical',type:'missing',description:'Нет ни одного шага',suggestion:'Добавьте шаги или сгенерируйте СОП'});return I}S.forEach((s,i)=>{const n=i+1;if(!s.action.trim())P({severity:'critical',field:'action',stepId:n,type:'incomplete',description:'Шаг без действия',suggestion:'Опишите действие глаголом совершенного вида'});const kms=s.keyMoments.filter(x=>x.trim());if(!kms.length)P({severity:'warning',field:'keyMoments',stepId:n,type:'incomplete',description:'Нет ключевых моментов',suggestion:'Добавьте 1–3 КМ'});if(!s.reason.trim())P({severity:'warning',field:'reason',stepId:n,type:'incomplete',description:'Нет причины почему так',suggestion:'Добавьте основание и последствие'});if(s.durationSeconds<=0)P({severity:'warning',field:'time',stepId:n,type:'incomplete',description:'Время не задано',suggestion:'Поставьте реальную длительность'});if(s.durationSeconds>300&&!s.successCriteria)P({severity:'info',field:'time',stepId:n,type:'unrealistic',description:'Длинный шаг',suggestion:'Проверьте, не стоит ли разделить ручную часть'});if(!s.imageData)P({severity:'info',field:'photo',stepId:n,type:'missing',description:'Шаг без фото',suggestion:'Добавьте фото или используйте подсказку'});if(!s.successCriteria.trim())P({severity:'info',field:'action',stepId:n,type:'incomplete',description:'Нет критерия успешного выполнения',suggestion:'Добавьте наблюдаемый результат'})});if(!/перчатк|очки|каска|щиток|маска|СИЗ|ботинки|спецодежд/i.test(state.meta.safety||''))P({severity:'warning',field:'safety',type:'missing',description:'В безопасности нет конкретных СИЗ',suggestion:'Укажите подходящие СИЗ по фактическим условиям работы'});const seen={};S.forEach((s,i)=>{const k=normText(s.action);if(!k)return;if(seen[k]!==undefined)P({severity:'warning',field:'action',stepId:i+1,type:'duplicate',description:`Повтор шага ${seen[k]+1}`,suggestion:'Объедините дублирующиеся шаги'});else seen[k]=i});return I}
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

