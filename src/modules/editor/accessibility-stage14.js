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
