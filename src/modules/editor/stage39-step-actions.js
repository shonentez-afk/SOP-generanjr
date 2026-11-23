// Stage39: reversible SOP step structure, preserving accepted Stage38 rendering.
// No document schema changes; undo is intentionally limited to structural actions.
const stage39UndoStack=[];
const stage39CollapsedIds=new Set();
const stage39UndoLimit=20;
let stage39ExpectedArray=null,stage39ExpectedIds='',stage39ExpectedDocument='';
let stage39Busy=false;

function stage39DocumentKey(){
  const d=state.documentManager||{};
  return JSON.stringify([d.currentId??null,d.version??1,d.status||'Черновик']);
}
function stage39Ids(){
  return state.steps.map(s=>String(s.id)).join(',');
}
function stage39HistoryCurrent(){
  return !stage39UndoStack.length||(
    state.steps===stage39ExpectedArray &&
    stage39Ids()===stage39ExpectedIds &&
    stage39DocumentKey()===stage39ExpectedDocument);
}
function stage39ForgetStale(){
  if(stage39UndoStack.length&&!stage39HistoryCurrent()){
    stage39UndoStack.length=0;
    stage39ExpectedArray=null;
  }
}
function stage39CanEdit(){
  if(stage39Busy){toast('Завершите копирование шага','info');return false;}
  if(['Опубликован','Архив'].includes(state.documentManager?.status)){
    toast('Документ защищён. Создайте новую версию для изменения шагов.','info');
    return false;
  }
  if(typeof stage37DraftDecisionPending!=='undefined'&&stage37DraftDecisionPending){
    toast('Сначала восстановите или отклоните найденный черновик.','info');
    return false;
  }
  return true;
}
function stage39Remember(before,label){
  stage39UndoStack.push({before:before.slice(),afterIds:stage39Ids(),document:stage39DocumentKey(),label});
  if(stage39UndoStack.length>stage39UndoLimit)stage39UndoStack.shift();
  stage39ExpectedArray=state.steps;
  stage39ExpectedIds=stage39Ids();
  stage39ExpectedDocument=stage39DocumentKey();
  stateChanged();
  stage39RefreshButtons();
}
function stage39FocusStep(id){
  requestAnimationFrame(()=>{
    const el=document.querySelector('#stepsContainer [data-step-field="action"][data-id="'+id+'"]');
    el?.focus({preventScroll:true});
    el?.closest('.step-card')?.scrollIntoView({block:'nearest'});
  });
}
function stage39Add(){
  if(!stage39CanEdit())return;
  stage39ForgetStale();
  const before=state.steps.slice(),step=createEmptyStep();
  state.steps=[...state.steps,step];
  stage39Remember(before,'Добавление шага');
  stage39FocusStep(step.id);
  toast('Шаг добавлен. Действие можно отменить.','info');
}
function stage39Move(id,direction){
  if(!stage39CanEdit())return;
  stage39ForgetStale();
  const index=state.steps.findIndex(s=>s.id===id),next=index+direction;
  if(index<0||next<0||next>=state.steps.length)return;
  const before=state.steps.slice();
  state.steps=before.slice();
  [state.steps[index],state.steps[next]]=[state.steps[next],state.steps[index]];
  stage39Remember(before,'Перемещение шага');
  stage39FocusStep(id);
}
function stage39Delete(id){
  if(!stage39CanEdit())return;
  stage39ForgetStale();
  const index=state.steps.findIndex(s=>s.id===id);
  if(index<0)return;
  const before=state.steps.slice();
  state.steps=before.filter(s=>s.id!==id);
  // Do NOT call idbDeletePhoto here. Structural undo must restore the same
  // IDB blob/annotations, including photos stored in a saved SOP version.
  stage39CollapsedIds.delete(id);
  stage39Remember(before,'Удаление шага');
  if(state.steps.length)stage39FocusStep(state.steps[Math.min(index,state.steps.length-1)].id);
  toast('Шаг удалён. «Отменить» вернёт его вместе с фотографией.','info');
}
async function stage39Duplicate(id){
  if(!stage39CanEdit())return;
  stage39ForgetStale();
  const source=state.steps.find(s=>s.id===id);
  if(!source)return;
  const beforeArray=state.steps,originalIds=stage39Ids(),documentKey=stage39DocumentKey();
  stage39Busy=true;stage39RefreshButtons();
  let newId=null,hasClonedPhoto=false;
  try{
    let photoRecord=null;
    if(source.hasPhoto||source.imageData){
      photoRecord=await idbGetPhoto(id);
      if(!photoRecord?.blob&&state.documentManager?.currentId){
        photoRecord=await idbGetPhoto(photoDocumentRecordKey(state.documentManager.currentId,id));
      }
      if(!photoRecord?.blob)throw new Error('Исходное фото не найдено в хранилище. Шаг не дублирован.');
    }
    if(state.steps!==beforeArray||stage39Ids()!==originalIds||
       stage39DocumentKey()!==documentKey)throw new Error('СОП изменился при копировании. Повторите действие.');
    // structuredClone is native in supported desktop Chrome/Edge.
    const copy=structuredClone(source);
    const blank=createEmptyStep();
    newId=blank.id;
    copy.id=newId;
    // FRV measurements belong to the original occurrence, not a new duplicate.
    copy.frv=blank.frv;
    delete copy.frvSource;
    if(photoRecord){
      if(!(await photoCopyRecordToKey(photoRecord,newId))){
        throw new Error('Не удалось сохранить независимую копию фото. Шаг не дублирован.');
      }
      hasClonedPhoto=true;
      if(!(await updateStepPhotoFromRecord(copy,photoRecord))){
        throw new Error('Не удалось подготовить фото копии. Шаг не дублирован.');
      }
    }
    if(state.steps!==beforeArray||stage39Ids()!==originalIds||
       stage39DocumentKey()!==documentKey)throw new Error('СОП изменился при копировании. Повторите действие.');
    const before=state.steps.slice();
    const index=state.steps.findIndex(s=>s.id===id);
    state.steps=[...before.slice(0,index+1),copy,...before.slice(index+1)];
    stage39Remember(before,'Дублирование шага');
    stage39FocusStep(newId);
    toast('Копия шага создана. Фото сохранено отдельно; замеры ФРВ не копируются.','success');
  }catch(e){
    if(hasClonedPhoto&&newId!==null)await idbDeletePhoto(newId);
    toast(e.message||'Не удалось дублировать шаг','error');
  }finally{
    stage39Busy=false;
    stage39RefreshButtons();
  }
}
function stage39Undo(){
  if(!stage39CanEdit())return;
  stage39ForgetStale();
  if(!stage39UndoStack.length){
    toast('Нет действий со структурой шагов для отмены.','info');return;
  }
  const entry=stage39UndoStack.pop();
  if(stage39Ids()!==entry.afterIds||stage39DocumentKey()!==entry.document){
    stage39UndoStack.length=0;stage39RefreshButtons();
    toast('СОП изменился: прежнюю отмену безопасно применить нельзя.','warning');
    return;
  }
  const currentIds=new Set(state.steps.map(s=>s.id));
  state.steps=entry.before.slice();
  // Keep IDB photos after undoing a duplicate: existing historical documents
  // may still reference those blobs, and later IDs never reuse the new ID.
  stage39ExpectedArray=state.steps;
  stage39ExpectedIds=stage39Ids();
  stage39ExpectedDocument=stage39DocumentKey();
  for(const s of state.steps)if(!currentIds.has(s.id))stage39CollapsedIds.delete(s.id);
  stateChanged();
  stage39RefreshButtons();
  toast(entry.label+' отменено. Текст и фотографии сохранены.','success');
}
function stage39ToggleCollapse(id){
  if(stage39CollapsedIds.has(id))stage39CollapsedIds.delete(id);
  else stage39CollapsedIds.add(id);
  // Presentation-only state: do not mutate/save SOP, FRV, TWI or draft.
  stage39DecorateCards();
}
function stage39EnsureUndo(){
  const add=document.getElementById('addStepBtn');
  if(!add||document.getElementById('stage39UndoBtn'))return;
  const btn=document.createElement('button');
  btn.type='button';btn.id='stage39UndoBtn';
  btn.className='btn-ghost px-3 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-200';
  btn.textContent='↶ Отменить';
  btn.title='Отмена последнего добавления, удаления, перемещения или копирования шага (Ctrl+Z вне поля ввода)';
  add.before(btn);
}
function stage39DecorateCards(){
  const root=document.getElementById('stepsContainer');
  if(!root)return;
  const locked=['Опубликован','Архив'].includes(state.documentManager?.status);
  const cards=root.querySelectorAll(':scope > .step-card');
  cards.forEach((card,index)=>{
    const step=state.steps[index];if(!step)return;
    const head=card.firstElementChild;
    if(!head)return;
    let controls=head.querySelector('[data-stage39-toolbar]');
    if(!controls){
      controls=document.createElement('div');
      controls.setAttribute('data-stage39-toolbar','');
      controls.className='flex items-center gap-1 flex-shrink-0 ml-2';
      const actions=[
        ['up','↑','Переместить шаг вверх'],
        ['down','↓','Переместить шаг вниз'],
        ['duplicate','⧉','Дублировать шаг'],
        ['collapse','▾','Свернуть или развернуть шаг']
      ];
      for(const action of actions){
        const b=document.createElement('button');
        b.type='button';b.dataset.stage39=action[0];
        b.dataset.id=String(step.id);
        b.textContent=action[1];b.title=action[2];
        b.setAttribute('aria-label',action[2]+' '+(index+1));
        b.className='px-2 py-1.5 text-sm rounded border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30';
        controls.appendChild(b);
      }
      const remove=head.querySelector('[data-remove]');
      if(remove)remove.before(controls);else head.appendChild(controls);
    }
    const collapsed=stage39CollapsedIds.has(step.id);
    [...card.children].slice(1).forEach(el=>el.classList.toggle('hidden',collapsed));
    card.classList.toggle('stage39-collapsed',collapsed);
    const collapse=controls.querySelector('[data-stage39="collapse"]');
    collapse.textContent=collapsed?'▸':'▾';
    collapse.setAttribute('aria-expanded',String(!collapsed));
    collapse.title=collapsed?'Развернуть шаг':'Свернуть шаг';
    controls.querySelector('[data-stage39="up"]').disabled=locked||stage39Busy||index===0;
    controls.querySelector('[data-stage39="down"]').disabled=locked||stage39Busy||index===state.steps.length-1;
    controls.querySelector('[data-stage39="duplicate"]').disabled=locked||stage39Busy;
    // Collapsing is a view-only action, including for published SOPs.
    collapse.disabled=stage39Busy;
    if(stage39Busy)collapse.setAttribute('aria-disabled','true');
    else collapse.removeAttribute('aria-disabled');
  });
}
function stage39RefreshButtons(){
  stage39ForgetStale();
  const undo=document.getElementById('stage39UndoBtn');
  if(undo){
    undo.disabled=!stage39UndoStack.length||stage39Busy||
      ['Опубликован','Архив'].includes(state.documentManager?.status);
    undo.title=stage39UndoStack.length?
      'Отменить: '+stage39UndoStack[stage39UndoStack.length-1].label:
      'Нет структурных действий для отмены';
  }
  stage39DecorateCards();
}
const stage39OriginalRenderSteps=renderSteps;
renderSteps=function stage39RenderSteps(){
  stage39OriginalRenderSteps();
  stage39EnsureUndo();
  stage39RefreshButtons();
  const label=document.getElementById('sopVersionLabel');
  if(label){
    label.textContent='· Stage39 (проверка)';
    label.title='Stage39 — управление шагами. Черновик и фотографии сохраняются локально.';
  }
};
const stage39OriginalApplyDocumentLock=applyDocumentLock;
applyDocumentLock=function stage39ApplyDocumentLock(){
  stage39OriginalApplyDocumentLock();
  stage39RefreshButtons();
};
// Capture before the accepted Stage38 direct button handlers. In particular,
// the original delete handler immediately deletes IDB photos and is unsafe
// for structural undo; it must never run for Stage39 UI clicks.
document.addEventListener('click',function stage39StepClick(e){
  const target=e.target?.closest?.('button');
  if(!target||target.disabled)return;
  const action=target.dataset.stage39;
  const remove=target.matches('#stepsContainer [data-remove]');
  if(!action&&!remove&&target.id!=='addStepBtn'&&target.id!=='stage39UndoBtn')return;
  if(action&&!target.closest('#stepsContainer'))return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(target.id==='addStepBtn')return stage39Add();
  if(target.id==='stage39UndoBtn')return stage39Undo();
  if(remove)return stage39Delete(Number(target.dataset.remove));
  const id=Number(target.dataset.id);
  if(action==='collapse')return stage39ToggleCollapse(id);
  if(action==='up')return stage39Move(id,-1);
  if(action==='down')return stage39Move(id,1);
  if(action==='duplicate')return void stage39Duplicate(id);
},true);
document.addEventListener('keydown',function stage39KeyboardUndo(e){
  if(!(e.ctrlKey||e.metaKey)||e.shiftKey||e.altKey||e.key.toLowerCase()!=='z')return;
  const el=document.activeElement;
  if(el?.matches?.('input,textarea,select,[contenteditable]'))return;
  if(document.getElementById('illustrationEditorOverlay'))return;
  if(document.getElementById('tab-editor')?.classList.contains('hidden'))return;
  if(!stage39UndoStack.length)return;
  e.preventDefault();stage39Undo();
},true);
