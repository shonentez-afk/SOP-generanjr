// Stage25 A4: explicit review before overwriting existing SOP or measured FRV.
// New drafts are created from SOP/description only; no extra compulsory forms.
function aiSopHasMeaningfulSteps(){
  return (state.steps||[]).some(step=>
    !!String(step.action||'').trim()||
    !!String(step.reason||'').trim()||
    !!String(step.successCriteria||'').trim()||
    !!String(step.photoHint||'').trim()||
    !!Number(step.durationSeconds)||
    !!step.hasPhoto||!!step.imageData||!!step.imageBuffer||
    (Array.isArray(step.keyMoments)&&step.keyMoments.some(x=>String(x||'').trim()))
  );
}
function aiFrvHasMeaningfulObservations(study){
  return (study?.cycles||[]).some(c=>(c.observations||[]).some(o=>
    !!String(o.actionRaw||'').trim()||
    !!String(o.actionNormalized||'').trim()||
    !!String(o.comment||'').trim()||
    !!String(o.keyMoment||'').trim()||
    !!String(o.reason||'').trim()||
    (o.durationSec!==null&&o.durationSec!==''&&o.durationSec!==undefined&&
      Number.isFinite(Number(o.durationSec))&&Number(o.durationSec)>0)
  ));
}
function aiReviewChoiceModal({id,title,intro,details,choices}){
  return new Promise(resolve=>{
    const backdrop=document.createElement('div');
    backdrop.id=id;
    backdrop.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.7);padding:14px;';
    const dialog=document.createElement('section');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-label',title);
    dialog.style.cssText='background:white;color:#0f172a;width:min(980px,100%);max-height:92vh;overflow:auto;border-radius:14px;padding:20px;box-shadow:0 25px 60px #0005;';
    const h=document.createElement('h2');
    h.textContent=title;
    h.style.cssText='font-weight:700;font-size:19px;margin:0 0 10px;';
    dialog.appendChild(h);
    const description=document.createElement('p');
    description.style.cssText='font-size:14px;line-height:1.5;margin:0 0 12px;';
    description.textContent=intro;
    dialog.appendChild(description);
    const content=document.createElement('div');
    content.style.cssText='max-height:56vh;overflow:auto;margin-bottom:12px;';
    content.innerHTML=details;
    dialog.appendChild(content);
    const footer=document.createElement('div');
    footer.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding-top:12px;border-top:1px solid #cbd5e1;';
    for(const choice of choices){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.aiPreviewAction=choice.action;
      button.textContent=choice.label;
      button.style.cssText='padding:10px 14px;border-radius:8px;border:1px solid #94a3b8;font-size:14px;font-weight:600;'+
        (choice.danger?'background:#b91c1c;color:white;border-color:#b91c1c;':
         choice.primary?'background:#047857;color:white;border-color:#047857;':'background:white;color:#0f172a;');
      button.addEventListener('click',()=>close(choice.action));
      footer.appendChild(button);
    }
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);
    const previous=document.activeElement;
    const onKeyDown=event=>{
      if(event.key==='Escape'){event.preventDefault();close('cancel');}
      if(event.key==='Tab'){
        const enabled=[...footer.querySelectorAll('button:not([disabled])')];
        const a=enabled[0],b=enabled[enabled.length-1];
        if(!a||!b)return;
        if(event.shiftKey&&document.activeElement===a){event.preventDefault();b.focus();}
        else if(!event.shiftKey&&document.activeElement===b){event.preventDefault();a.focus();}
      }
    };
    let closed=false;
    function close(result){
      if(closed)return;closed=true;
      document.removeEventListener('keydown',onKeyDown);
      backdrop.remove();
      if(previous&&typeof previous.focus==='function')previous.focus();
      resolve(result);
    }
    document.body.appendChild(backdrop);
    document.addEventListener('keydown',onKeyDown);
    footer.querySelector('[data-ai-preview-action="cancel"]')?.focus();
  });
}
function aiSopPlanPreview(sop){
  const existing=state.steps||[];
  const count=existing.filter(s=>s.hasPhoto||s.imageData||s.imageBuffer).length;
  const oldRows=existing.slice(0,20).map((s,i)=>
    '<li>Шаг '+(i+1)+': '+escapeHtml(s.action||'(пустой)')+
    (s.hasPhoto||s.imageData||s.imageBuffer?' · 📷 фото':'')+'</li>').join('');
  const newRows=(sop.steps||[]).slice(0,20).map((s,i)=>
    '<li>Шаг '+(i+1)+': '+escapeHtml(s.action||'(пустой)')+'</li>').join('');
  const details='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;">'+
    '<div style="padding:12px;background:#f1f5f9;border-radius:9px;"><b>Текущий СОП ('+existing.length+' шагов)</b>'+
    '<ol style="padding-left:20px;margin-top:8px;font-size:13px;line-height:1.6;">'+oldRows+'</ol></div>'+
    '<div style="padding:12px;background:#ecfdf5;border-radius:9px;"><b>Предложение ИИ ('+sop.steps.length+' шагов)</b>'+
    '<ol style="padding-left:20px;margin-top:8px;font-size:13px;line-height:1.6;">'+newRows+'</ol></div></div>'+
    (count?'<p style="margin-top:10px;color:#b91c1c;font-weight:600;">При полной замене будет утрачена привязка '+count+' фотографий к старым шагам. Файлы фото могут сохраняться отдельно, но восстановить их в новом СОП автоматически нельзя.</p>':'');
  return aiReviewChoiceModal({
    id:'sopReplacementPreview',title:'Как использовать новые шаги СОП?',
    intro:'В документе уже есть шаги. «Добавить» сохраняет существующие шаги, фотографии и сведения документа. «Заменить» полностью заменяет шаги и подтверждённые данные текущего СОП. Пока вы не выбрали действие, ничего не меняется.',
    details,choices:[
      {action:'cancel',label:'Оставить текущий СОП'},
      {action:'append',label:'Добавить новые шаги',primary:true},
      {action:'replace',label:'Заменить весь СОП',danger:true}
    ]
  });
}
function aiFrvAppendPreview(study,rows){
  const cycles=study.cycles||[];
  const existing=cycles.reduce((n,c)=>n+(c.observations||[]).filter(o=>
    String(o.actionRaw||o.actionNormalized||'').trim()).length,0);
  const measured=cycles.reduce((n,c)=>n+(c.observations||[]).filter(o=>
    o.durationSec!==null&&o.durationSec!==''&&o.durationSec!==undefined&&
    Number.isFinite(Number(o.durationSec))&&Number(o.durationSec)>0).length,0);
  const names=rows.slice(0,20).map((o,i)=>'<li>'+(i+1)+'. '+escapeHtml(o.actionRaw||'')+'</li>').join('');
  const details='<p style="padding:10px;background:#eff6ff;border-radius:8px;">'+
    'Существующих циклов: <b>'+cycles.length+'</b>. Наблюдений: <b>'+existing+
    '</b>. Замеренных длительностей: <b>'+measured+'</b>.</p>'+
    '<div style="padding:10px;background:#ecfdf5;border-radius:8px;margin-top:10px;">'+
    '<b>Новые наблюдения ИИ ('+rows.length+')</b><ol style="padding-left:20px;line-height:1.7;font-size:13px;">'+
    names+'</ol><p style="margin-top:8px;">Длительность новых предложений не считается фактическим замером и остаётся пустой.</p></div>';
  return aiReviewChoiceModal({
    id:'frvBuildPreview',title:'Добавить предложения в ФРВ?',
    intro:'Исходные фактические наблюдения, длительности и комментарии остаются без изменений. ИИ может только добавить новый черновой цикл, который затем можно проверить и измерить. Отмена не изменяет исследование.',
    details,choices:[
      {action:'cancel',label:'Оставить текущую ФРВ'},
      {action:'append',label:'Добавить новый цикл',primary:true}
    ]
  });
}
