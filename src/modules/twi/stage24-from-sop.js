function twiToHtml(){
  const t=state.twi||{};
  setVal('twi-trainer',t.trainer);setVal('twi-trainee',t.trainee);
  const p=t.prepare||{},pr=t.present||{},tr=t.tryOut||{},f=t.followUp||{};
  setVal('twi-purpose',p.purpose);setVal('twi-known',p.known);setVal('twi-prep',p.prep);setVal('twi-interest',p.interest);
  setVal('twi-round1',pr.round1);setVal('twi-round2',pr.round2);setVal('twi-round3',pr.round3);
  setVal('twi-tryout',tr.perform);setVal('twi-explain',tr.explain);setVal('twi-check',tr.check);setVal('twi-correct',tr.correct);
  setVal('twi-help',f.help);setVal('twi-frequency',f.control || f.frequency || '');setVal('twi-observe',f.observe);setVal('twi-close',f.close);
  renderTwiSummary();
}
function htmlToTwi(){
  state.twi={...(state.twi||{}),enabled:true,trainer:$('twi-trainer')?.value||'',trainee:$('twi-trainee')?.value||'',prepare:{purpose:$('twi-purpose')?.value||'',known:$('twi-known')?.value||'',prep:$('twi-prep')?.value||'',interest:$('twi-interest')?.value||''},present:{round1:$('twi-round1')?.value||'',round2:$('twi-round2')?.value||'',round3:$('twi-round3')?.value||''},tryOut:{perform:$('twi-tryout')?.value||'',explain:$('twi-explain')?.value||'',check:$('twi-check')?.value||'',correct:$('twi-correct')?.value||''},followUp:{help:$('twi-help')?.value||'',control:$('twi-frequency')?.value||'',observe:$('twi-observe')?.value||'',close:$('twi-close')?.value||''}};
}
function renderTwiSummary(){
  const c=$('twiSummary');if(!c)return;
  const t=state.twi||{};
  const vals=[
    ['Подготовка работника',t.prepare?.purpose||'Цель не задана'],
    ['Представление работы',t.present?.round2?'Готово':'Не заполнено'],
    ['Пробное выполнение',t.tryOut?.check?'Критерии заданы':'Не заполнено'],
    ['Сопровождение',t.followUp?.help?'Наставник указан':'Не заполнено']
  ];
  c.innerHTML=vals.map(([k,v])=>
    '<div class="p-2 bg-white rounded border border-slate-200">'+
    '<div class="text-[11px] font-semibold text-slate-500">'+escapeHtml(k)+'</div>'+
    '<div class="mt-1">'+escapeHtml(v)+'</div></div>'
  ).join('');
  if(t.enabled&&t.sourceSignature&&t.sourceSignature!==twiSourceSignature()){
    c.insertAdjacentHTML('afterbegin',
      '<div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm" style="grid-column:1/-1;" data-twi-outdated>'+
      '⚠️ СОП изменился после создания TWI. Проверьте план обучения и при необходимости нажмите «Сформировать TWI» для сравнения изменений.</div>');
  }
  const manual=twiManualCount(t);
  if(manual){
    c.insertAdjacentHTML('beforeend',
      '<div class="text-xs text-blue-700" data-twi-manual-count style="grid-column:1/-1;">'+
      'Ручные изменения полей TWI: '+manual+'. При повторной генерации они сохраняются по умолчанию.</div>');
  }
}
async function generateTwiPlan(){
  const btn=$('generateTwiBtn');if(!btn)return;
  if(['Опубликован','Архив'].includes(state.documentManager?.status)){
    toast('Для изменения опубликованного СОП сначала создайте новую версию.','info');
    return;
  }
  if(!state.steps.some(s=>String(s.action||'').trim())){
    toast('Добавьте шаги СОП перед формированием TWI.','info');
    return;
  }
  const old=btn.innerHTML;
  btn.disabled=true;btn.innerHTML='⏳ Наставник готовит план…';
  try{
    const src=twiSopInput();
    const guard=aiGuardCapture({twi:true});
    const raw=await aiAsk(AI_SYS.twiGenerate,'DATA BEGIN\n'+JSON.stringify(src,null,2)+'\nDATA END',
      {model:currentModel,temperature:.25,maxTokens:1800,task:'twi_generate'});
    const proposal=aiReadTwiPlan(raw);
    if(!aiGuardCanApply(guard))return;
    const current=state.twi||{};
    const changes=twiProposalDiff(current,proposal);
    if(!twiHasGeneratedContent(current)){
      state.twi=twiCommitProposal(current,proposal,new Set(TWI_GENERATED_FIELDS.map(twiFieldId)));
      twiToHtml();saveDraft();toast('План TWI сформирован из СОП','success');
      return;
    }
    if(!changes.length){
      state.twi=twiCommitProposal(current,proposal,new Set());
      twiToHtml();saveDraft();toast('Новый план TWI совпадает с текущим','info');
      return;
    }
    const selected=await twiShowPreview(changes);
    if(selected===null){
      toast('Обновление TWI отменено. Текущий план сохранён.','info');
      return;
    }
    if(!aiGuardCanApply(guard))return;
    if(!selected.size){
      toast('Предложения не выбраны. Текущий TWI сохранён без изменений.','info');
      return;
    }
    state.twi=twiCommitProposal(current,proposal,selected);
    twiToHtml();saveDraft();
    toast('TWI обновлён: применены выбранные предложения, ручные исправления сохранены.','success');
  }catch(e){
    toast('Не удалось сформировать TWI: '+diagnoseAIError(e),'error');
  }finally{
    btn.disabled=false;btn.innerHTML=old;
  }
}
function clearTwi(){
  htmlToTwi();
  if(twiHasAnyContent(state.twi)&&
    !confirm('Очистить весь заполненный блок TWI? Отменить очистку нельзя.'))return;
  state.twi={
    enabled:false,trainer:'',trainee:'',
    prepare:{purpose:'',known:'',prep:'',interest:''},
    present:{round1:'',round2:'',round3:''},
    tryOut:{perform:'',explain:'',check:'',correct:''},
    followUp:{help:'',control:'',observe:'',close:''}
  };
  twiToHtml();saveDraft();toast('Блок TWI очищен','info');
}
function renderTwi(){twiToHtml()}
