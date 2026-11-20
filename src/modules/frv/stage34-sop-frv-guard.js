// Stage34.1: SOP-export FRV preflight. Independent FRV studies must never
// silently affect a different SOP, and invalid optional classification must
// not silently corrupt or prevent exporting the SOP and photos.
function sopFrvExportIssues(steps){
  const errors=[];
  (steps||[]).forEach((s,index)=>{
    const f=s.frv||{},dur=Number(s.durationSeconds);
    const m1=frvClassifiedPart(f.m1),m2=frvClassifiedPart(f.m2),
      move=frvClassifiedPart(f.move);
    const invalidDuration=!Number.isFinite(dur)||dur<0;
    const invalidParts=!Number.isFinite(m1)||!Number.isFinite(m2)||
      (Number.isFinite(m1)&&Number.isFinite(m2)&&m1+m2>dur+.0001);
    const invalidMove=!Number.isFinite(move);
    if(!invalidDuration&&!invalidParts&&!invalidMove) return;
    const reasons=[];
    if(invalidDuration) reasons.push('длительность не определена');
    if(!Number.isFinite(m1)||!Number.isFinite(m2)) reasons.push('М1/М2 не являются корректными числами');
    else if(m1+m2>dur+.0001) reasons.push('М1 + М2 = '+(m1+m2)+' с, длительность = '+dur+' с');
    if(invalidMove) reasons.push('некорректное значение перемещения');
    errors.push({index,id:s.id,action:String(s.action||''),duration:dur,
      m1:f.m1??'',m2:f.m2??'',move:f.move??'',invalidParts,
      invalidMove,invalidDuration,reason:reasons.join('; ')});
  });
  return errors;
}
function sopFrvRefreshProjectedPart(step,previousDuration){
  const f=step?.frv;
  if(!step?.frvSource||!f||f.autoFullStep!==true)return false;
  const duration=Number(step.durationSeconds);
  if(!Number.isFinite(duration)||duration<0)return false;
  const old=Number(previousDuration);
  // Only an automatically assigned, whole-step project classification may be
  // updated. Real observedTimeSec and manual FRV splits are never touched.
  if(Number.isFinite(old)&&f.m1!==''&&Number(f.m1)===old&&
     (f.m2===''||Number(f.m2)===0)){
    f.m1=duration;return true;
  }
  if(Number.isFinite(old)&&f.m2!==''&&Number(f.m2)===old&&
     (f.m1===''||Number(f.m1)===0)){
    f.m2=duration;return true;
  }
  f.autoFullStep=false;
  return false;
}
async function sopFrvCheckBeforeExcel(exportData){
  const invalid=sopFrvExportIssues(exportData.steps);
  if(!invalid.length)return {proceed:true,excluded:[]};
  const detail='<div class="text-sm space-y-2">'+
    '<p class="text-amber-800">Обнаружено '+invalid.length+
    ' несоответствий только в ФРВ шагов <b>текущего СОП</b>. '+
    'Данные отдельного «Анализа ФРВ» не проверяются и не меняются.</p>'+
    '<div class="border rounded p-2 max-h-60 overflow-y-auto">'+
    invalid.map(x=>'<div class="border-b py-2"><b>Шаг '+(x.index+1)+
      ': '+escapeHtml(x.action||'Без названия')+'</b>'+
      '<div>'+escapeHtml(x.reason)+'</div>'+
      '<div class="text-xs text-slate-500">М1: '+escapeHtml(String(x.m1))+
      ' с · М2: '+escapeHtml(String(x.m2))+
      ' с · Длительность: '+escapeHtml(String(x.duration))+' с</div></div>').join('')+
    '</div><p class="text-xs">При исключении для этой выгрузки невалидные М1/М2 '+
    'будут пустыми в копии отчёта, а соответствующие строки получат явное '+
    'предупреждение «ФРВ не подтверждена». Исходные значения в редакторе '+
    'СОП и исследования ФРВ останутся неизменными.</p></div>';
  const choices=[
    {action:'cancel',label:'Отмена'},
    {action:'edit',label:'Перейти в ФРВ и исправить'},
    ...(invalid.every(x=>!x.invalidDuration)?[
      {action:'export',label:'Скачать СОП с пометками ФРВ',primary:true}
    ]:[])
  ];
  const decision=await aiReviewChoiceModal({
    id:'sopFrvExportValidationPreview',
    title:'Проверьте время ФРВ перед экспортом СОП',
    intro:'Экспорт не будет обрывать всю работу без объяснения. Выберите, как поступить с противоречивыми данными.',
    details:detail,choices
  });
  if(decision==='edit'){
    document.querySelector('[data-tab="frv"]')?.click();
    const target=invalid[0];
    setTimeout(()=>{
      const el=document.querySelector('#frvRowsContainer [data-frv="m1"][data-id="'+target.id+'"]');
      if(el){el.scrollIntoView({block:'center',behavior:'smooth'});el.focus()}
    },100);
    return {proceed:false,excluded:[]};
  }
  if(decision!=='export')return {proceed:false,excluded:[]};
  for(const issue of invalid){
    const step=exportData.steps[issue.index];
    if(!step)continue;
    step.frv={...(step.frv||{})};
    if(issue.invalidParts){
      step.frv.m1='';step.frv.m2='';step.frv.vdc=false;
    }
    if(issue.invalidMove)step.frv.move='';
    step._sopFrvExportWarning='ФРВ не подтверждена: '+issue.reason+
      '. Неверные значения исключены только из выгруженного отчёта.';
  }
  return {proceed:true,excluded:invalid};
}
