// Stage39.1: manual, preview-first cleanup of duplicate Key Points in Reasons Why.
// This module does NOT change the ✨ AI handler, generation, FRV, or XLSX.
// Data is modified ONLY by a deliberate click on "Применить" in the preview.
function stage391CleanupNormalize(value){
  return String(value||'').toLocaleLowerCase('ru').replace(/\s+/gu,' ')
    .replace(/[.!?;:]+$/gu,'').trim();
}
function stage391CleanupReason(reason,step){
  const original=String(reason??'');
  const sources=[...(Array.isArray(step?.keyMoments)?step.keyMoments:[]),step?.action]
    .filter(v=>typeof v==='string'&&v.trim())
    .map(stage391CleanupNormalize).filter(Boolean);
  const result=[];
  let changed=0;
  let skipped=0;
  for(const line of original.replace(/\r\n?/gu,'\n').split('\n')){
    const parts=line.match(/^(\s*(?:\d{1,2}[.)][ \t]+)?)(.*)$/u);
    if(!parts||!parts[2].trim()){result.push(line);continue;}
    const label=parts[1],body=parts[2].trim();
    let next=null;
    // A candidate prefix must equal a whole, existing Key Point (or Action).
    // Do NOT use fuzzy/partial matching or cut at an arbitrary sentence stop.
    const splits=/\s*[—–]\s*|\s+-\s+|:\s+|[.!?;]\s+/gu;
    for(const delimiter of body.matchAll(splits)){
      const prefix=body.slice(0,delimiter.index).trim();
      if(!sources.includes(stage391CleanupNormalize(prefix)))continue;
      const why=body.slice(delimiter.index+delimiter[0].length).trim();
      if(!why||stage391CleanupNormalize(why).length<8)break;
      let shorter=why
        .replace(/^Это\s+(?:важно|необходимо|нужно|требуется)\s+для\s+/iu,'Для ')
        .replace(/^Это\s+(?:важно|нужно|необходимо)\s*,?\s*чтобы\s+/iu,'Чтобы ');
      if(/^(?:Это\s+(?:важно|необходимо|нужно|требуется)|Для\s+безопасности)\s*[.!?]?$/iu.test(shorter.trim()))break;
      if(!shorter.trim()||shorter===body)break;
      shorter=shorter.charAt(0).toLocaleUpperCase('ru')+shorter.slice(1);
      next=label+shorter;
      break;
    }
    if(next!==null&&next!==line){
      result.push(next);changed++;
    }else{
      result.push(line);
      skipped++;
    }
  }
  return {before:original,after:result.join('\n'),changed,skipped};
}
function stage391CleanupElement(tag,classes,textValue){
  const el=document.createElement(tag);
  if(classes)el.className=classes;
  if(textValue!==undefined)el.textContent=textValue;
  return el;
}
function stage391CloseReasonCleanup(){
  document.getElementById('stage391CleanupOverlay')?.remove();
}
function stage391ShowReasonCleanup(stepId){
  const step=state.steps.find(s=>s.id===stepId);
  if(!step){toast('Шаг не найден','warning');return;}
  if(!String(step.reason||'').trim()){
    toast('Сначала заполните причины. Удалять повтор нечего.','info');return;
  }
  const preview=stage391CleanupReason(step.reason,step);
  if(!preview.changed){
    toast('Точных повторов ключевых моментов в причинах не найдено. Текст сохранён.','info');
    return;
  }
  stage391CloseReasonCleanup();
  const fingerprint=JSON.stringify([step.action,step.keyMoments]);
  const overlay=stage391CleanupElement('div',
    'fixed inset-0 z-[1000] bg-slate-900/60 flex items-center justify-center p-4');
  overlay.id='stage391CleanupOverlay';
  const dialog=stage391CleanupElement('section',
    'bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5');
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','stage391CleanupTitle');
  const title=stage391CleanupElement('h3','font-bold text-lg text-slate-800',
    'Предпросмотр: убрать повтор КМ');
  title.id='stage391CleanupTitle';
  dialog.appendChild(title);
  dialog.appendChild(stage391CleanupElement('p','text-sm text-slate-600 mt-2',
    'Найдено повторов: '+preview.changed+
    (preview.skipped?' · Строк без точного совпадения: '+preview.skipped:'')+
    '. Эти строки будут оставлены без изменений.'));
  const compare=stage391CleanupElement('div','grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4');
  const makePanel=(label,value)=>{
    const panel=stage391CleanupElement('div','min-w-0');
    panel.appendChild(stage391CleanupElement('p','font-semibold text-sm mb-1',label));
    const content=stage391CleanupElement('pre',
      'whitespace-pre-wrap break-words text-sm bg-slate-50 border border-slate-200 p-3 rounded-lg min-h-24',
      value);
    content.style.fontFamily='inherit';
    panel.appendChild(content);
    return panel;
  };
  compare.appendChild(makePanel('Было',preview.before));
  compare.appendChild(makePanel('Стало',preview.after));
  dialog.appendChild(compare);
  dialog.appendChild(stage391CleanupElement('p','text-xs text-amber-700 mt-3',
    'Изменяется только оформление текста причин. Техническая правильность объяснений не подтверждается автоматически.'));
  const actions=stage391CleanupElement('div','flex flex-wrap justify-end gap-2 mt-5');
  const cancel=stage391CleanupElement('button',
    'px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50',
    'Отмена');
  cancel.type='button';
  cancel.id='stage391CleanupCancel';
  const apply=stage391CleanupElement('button',
    'px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700',
    'Применить');
  apply.type='button';
  apply.id='stage391CleanupApply';
  actions.append(cancel,apply);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const close=()=>stage391CloseReasonCleanup();
  cancel.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
  apply.addEventListener('click',()=>{
    // Snapshot protection: never apply a proposal to a different or edited step.
    if(typeof stage39CanEdit==='function'&&!stage39CanEdit())return;
    const current=state.steps.find(s=>s.id===stepId);
    if(!current||current.reason!==preview.before||
       JSON.stringify([current.action,current.keyMoments])!==fingerprint){
      close();
      toast('Шаг или причины изменились. Откройте предпросмотр заново.','warning');
      return;
    }
    if(['Опубликован','Архив'].includes(state.documentManager?.status)){
      toast('Документ защищён от редактирования.','warning');return;
    }
    current.reason=preview.after;
    close();
    stateChanged();
    renderSteps();
    toast('Удалены только точные повторы КМ. Причины и номера сохранены.','success');
  });
  cancel.focus();
}
function stage391DecorateReasonCleanup(){
  const locked=['Опубликован','Архив'].includes(state.documentManager?.status);
  document.querySelectorAll('#stepsContainer [data-step-field="reason"]').forEach(field=>{
    const id=Number(field.dataset.id);
    const label=field.parentElement?.querySelector('label');
    if(!label)return;
    let button=label.querySelector('[data-stage391-cleanup]');
    if(!button){
      button=stage391CleanupElement('button',
        'ml-1 mt-1 px-2 py-1 rounded text-xs font-medium border border-blue-200 text-blue-700 hover:bg-blue-50',
        'Убрать повтор КМ');
      button.type='button';
      button.title='Сравнить причины с ключевыми моментами и показать результат до применения';
      button.setAttribute('data-stage391-cleanup',String(id));
      label.appendChild(button);
    }
    button.disabled=locked;
    button.classList.toggle('opacity-50',locked);
  });
}
const stage391RenderBeforeCleanup=renderSteps;
renderSteps=function stage391RenderStepsWithCleanup(){
  stage391CloseReasonCleanup();
  stage391RenderBeforeCleanup();
  stage391DecorateReasonCleanup();
};
const stage391ApplyLockBeforeCleanup=applyDocumentLock;
applyDocumentLock=function stage391LockWithCleanup(){
  stage391ApplyLockBeforeCleanup();
  stage391DecorateReasonCleanup();
};
document.addEventListener('click',e=>{
  const button=e.target?.closest?.('button[data-stage391-cleanup]');
  if(!button||button.disabled)return;
  e.preventDefault();
  e.stopPropagation();
  stage391ShowReasonCleanup(Number(button.dataset.stage391Cleanup));
},true);
