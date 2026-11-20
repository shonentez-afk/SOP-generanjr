// Stage33: independent, compact FRV research. Measured observations remain
// separate from SOP-linked FRV and from unmeasured AI suggestions.
const FRV_VALUE_TYPES=['VA','NVA_Necessary','NVA_Waste','WAIT','BREAK','OTHER'];
const FRV_VALUE_LABELS={
  VA:'ВДЦ — создаёт ценность',NVA_Necessary:'М2 — необходимые действия',
  NVA_Waste:'М1 — потери',WAIT:'Ожидание',
  BREAK:'Регламентированный перерыв',OTHER:'Не определено'
};
const FRV_ACTIVITY_MODES=['Manual','Auto','Walk','Wait','Setup','Other'];
const FRV_ACTIVITY_LABELS={Manual:'Ручное',Auto:'Автоматическое',Walk:'Перемещение',
  Wait:'Ожидание',Setup:'Подготовка',Other:'Другое'};
const FRV_LOSSES=['search_tool','extra_move','waiting','overprocessing','rework',
  'defect','info_wait','equipment_wait','material_wait','extra_registration',
  'manual_input','bad_location','other'];
const FRV_LOSS_LABELS={search_tool:'Поиск инструмента',extra_move:'Лишнее перемещение',
  waiting:'Ожидание',overprocessing:'Лишняя обработка',rework:'Повторная работа',
  defect:'Дефект',info_wait:'Ожидание информации',equipment_wait:'Ожидание оборудования',
  material_wait:'Ожидание материала',extra_registration:'Лишняя регистрация',
  manual_input:'Ручной ввод',bad_location:'Нерациональное размещение',other:'Другие потери'};
function frvStudyEmptyObservation(seq=1){
  return {id:'fo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),
    seqNo:seq,durationSec:null,actionRaw:'',actionNormalized:'',activityMode:'Manual',
    valueType:'OTHER',lossCode:'',causeCode:'',keyMoment:'',reason:'',
    qualityKey:'',safetyKey:'',tool:'',material:'',locationFrom:'',locationTo:'',
    distanceM:null,evidenceType:'',evidenceId:'',comment:'',confidence:'',
    standardCandidate:true,legacyM1M2:{m1:'',m2:''},source:'manual'};
}
function frvStudyEmptyCycle(no=1){
  return {id:'fc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),
    cycleNo:no,phase:'unassigned',observations:[frvStudyEmptyObservation(1)]};
}
function frvStudyEmptyData(){
  return {studyId:'',processId:'',operationId:'',operator:'',observer:'',
    workplace:'',taktSec:null,status:'Draft',version:'1.0',
    processDescription:'',cycles:[frvStudyEmptyCycle(1)],analysis:{},
    analysisNeedsReview:false,improvements:[],standardCandidate:null,
    validation:null,suggestedActions:[],actionAliases:{},
    comparisonApproved:false,archived:false};
}
function ensureFrvStudy(){
  if(!state.frvStudy)state.frvStudy=frvStudyEmptyData();
  const d=state.frvStudy;
  if(!Array.isArray(d.cycles))d.cycles=[];
  if(!d.cycles.length)d.cycles=[frvStudyEmptyCycle(1)];
  if(!Array.isArray(d.suggestedActions))d.suggestedActions=[];
  if(typeof d.processDescription!=='string')d.processDescription='';
  return d;
}
function frvStudyMeasuredDuration(o){
  const x=o&&o.durationSec;
  if(x===null||x===undefined||String(x).trim()==='')return null;
  const n=Number(x);
  return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;
}
function frvStudyDuration(o){return frvStudyMeasuredDuration(o)??0;}
function frvStudyEsc(s){return escapeHtml(String(s??''));}
function frvStudyTotal(c){
  return (c.observations||[]).reduce((n,o)=>n+frvStudyDuration(o),0);
}
function frvStudyCycleComplete(c){
  return !!(c.observations||[]).length&&(c.observations||[]).every(o=>
    String(o.actionRaw||'').trim()&&frvStudyMeasuredDuration(o)>0);
}
function frvStudyOptionList(values,labels,selected){
  return values.map(v=>'<option value="'+frvStudyEsc(v)+'"'+(v===selected?' selected':'')+
    '>'+frvStudyEsc(labels[v]||v)+'</option>').join('');
}
function frvStudyInput(o,name,ci,oi,type='text',cls='w-full'){
  const v=o[name]??'';
  const val=frvStudyEsc(v);
  const attrs=' data-fs="'+name+'" data-ci="'+ci+'" data-oi="'+oi+'"';
  if(type==='textarea')return '<textarea'+attrs+' rows="2" class="'+cls+
    ' border rounded-lg px-2 py-1.5 text-sm">'+val+'</textarea>';
  return '<input'+attrs+' type="'+type+'"'+(type==='number'?' min="0" step="0.1"':'')+
    ' value="'+val+'" class="'+cls+' border rounded-lg px-2 py-1.5 text-sm">';
}
function frvStudyAdvancedFields(o,ci,oi){
  return '<details class="mt-1 frvs-more"><summary class="text-xs cursor-pointer text-blue-700">Подробнее</summary>'+
    '<div class="grid md:grid-cols-3 gap-2 mt-2 p-2 bg-slate-50 rounded-lg">'+
    '<label class="text-xs">Нормализованное действие'+frvStudyInput(o,'actionNormalized',ci,oi,'textarea')+'</label>'+
    '<label class="text-xs">Режим<select data-fs="activityMode" data-ci="'+ci+'" data-oi="'+oi+
      '" class="block w-full border rounded p-1.5">'+frvStudyOptionList(FRV_ACTIVITY_MODES,FRV_ACTIVITY_LABELS,o.activityMode)+'</select></label>'+
    '<label class="text-xs">Тип потери<select data-fs="lossCode" data-ci="'+ci+'" data-oi="'+oi+
      '" class="block w-full border rounded p-1.5"><option value="">—</option>'+
      frvStudyOptionList(FRV_LOSSES,FRV_LOSS_LABELS,o.lossCode)+'</select></label>'+
    ['causeCode','keyMoment','reason','qualityKey','safetyKey','tool','material',
     'locationFrom','locationTo','evidenceId'].map((field)=>
       '<label class="text-xs">'+frvStudyEsc({
         causeCode:'Причина потери',keyMoment:'Ключевой момент',
         reason:'Почему важно',qualityKey:'Качество',safetyKey:'Безопасность',
         tool:'Инструмент',material:'Материал',locationFrom:'Откуда',
         locationTo:'Куда',evidenceId:'Доказательство'}[field])+
       frvStudyInput(o,field,ci,oi,'text')+'</label>').join('')+
    '<button data-frvs-suggest="'+ci+':'+oi+'" type="button" class="text-xs border rounded-lg p-2 text-blue-700">🤖 Подсказать для строки</button>'+
    '</div></details>';
}
function frvStudyCycleMarkup(c,ci,d){
  return '<section class="border rounded-xl mb-3 p-3" data-frvs-cycle="'+ci+'">'+
    '<div class="flex flex-wrap justify-between items-center gap-2 mb-2"><div><b>Цикл '+c.cycleNo+
    '</b><span class="text-xs text-slate-500 ml-2">Записано: '+
    frvStudyEsc(frvStudyTotal(c).toFixed(1))+' сек'+
    (frvStudyCycleComplete(c)?' · все замеры заполнены':' · есть незаполненные замеры')+
    '</span><label class="ml-3 text-xs text-slate-600">Сравнение <select data-frvs-phase="'+ci+
    '" class="border rounded p-1 text-xs"><option value="unassigned"'+
    ((!c.phase||c.phase==='unassigned')?' selected':'')+'>Без группы</option>'+
    '<option value="baseline"'+(c.phase==='baseline'?' selected':'')+'>До улучшения</option>'+
    '<option value="improved"'+(c.phase==='improved'?' selected':'')+
    '>После улучшения</option></select></label></div><div class="flex gap-2">'+
    '<button type="button" data-frvs-repeat="'+ci+
    '" class="text-xs px-2 py-1 border rounded">Повторить действия</button>'+
    '<button type="button" data-frvs-add="'+ci+
    '" class="text-xs px-2 py-1 border rounded">+ Действие</button>'+
    (d.cycles.length>1?'<button type="button" data-frvs-rmcycle="'+ci+
    '" class="text-xs text-red-600 px-2 py-1 border rounded">Удалить цикл</button>':'')+
    '</div></div>'+
    '<div class="overflow-x-auto"><table class="w-full min-w-[950px] text-sm">'+
    '<thead><tr class="bg-slate-100 text-xs"><th class="p-2 text-left w-10">№</th>'+
    '<th class="p-2 text-left">Наблюдаемое действие</th><th class="p-2 w-24">Сек</th>'+
    '<th class="p-2 w-44">Тип времени</th><th class="p-2 w-40">Комментарий</th>'+
    '<th class="p-2 w-24">Метры</th><th class="p-2 w-20">В СОП</th><th class="p-2 w-24"></th>'+
    '</tr></thead><tbody>'+
    c.observations.map((o,oi)=>'<tr class="border-t align-top">'+
       '<td class="p-1 pt-3">'+(oi+1)+'</td>'+
       '<td class="p-1">'+frvStudyInput(o,'actionRaw',ci,oi,'textarea')+
          frvStudyAdvancedFields(o,ci,oi)+'</td>'+
       '<td class="p-1">'+frvStudyInput(o,'durationSec',ci,oi,'number','w-24')+'</td>'+
       '<td class="p-1"><select data-fs="valueType" data-ci="'+ci+'" data-oi="'+oi+
         '" class="w-full border rounded-lg px-1 py-1.5 text-xs">'+
          frvStudyOptionList(FRV_VALUE_TYPES,FRV_VALUE_LABELS,o.valueType)+'</select></td>'+
       '<td class="p-1">'+frvStudyInput(o,'comment',ci,oi,'textarea')+'</td>'+
       '<td class="p-1">'+frvStudyInput(o,'distanceM',ci,oi,'number','w-20')+'</td>'+
       '<td class="p-2 text-center"><input aria-label="Включить действие в проект СОП" type="checkbox" data-fs="standardCandidate" data-ci="'+ci+
         '" data-oi="'+oi+'"'+(o.standardCandidate?' checked':'')+'></td>'+
       '<td class="p-2 text-center"><button type="button" data-frvs-rm="'+ci+':'+oi+
         '" class="text-red-600" title="Удалить наблюдение">✕</button></td>'+
    '</tr>').join('')+'</tbody></table></div></section>';
}
function frvStudySuggestionsMarkup(d){
  const container=$('frvStudySuggestions');if(!container)return;
  if(!d.suggestedActions.length){container.innerHTML='';return;}
  container.innerHTML='<div class="border rounded-xl p-3 bg-blue-50"><div class="flex flex-wrap items-center justify-between gap-2">'+
    '<b class="text-sm">Черновые действия от ИИ — не измерены</b>'+
    '<div class="flex gap-2"><button type="button" id="frvs-acceptSuggestions" class="text-xs px-3 py-2 bg-blue-700 text-white rounded-lg">Добавить как незамеренные</button>'+
    '<button type="button" id="frvs-clearSuggestions" class="text-xs px-3 py-2 border rounded-lg">Отклонить</button></div></div>'+
    '<ol class="list-decimal ml-5 mt-2 text-xs">'+d.suggestedActions.map(o=>
      '<li>'+frvStudyEsc(o.actionRaw)+'</li>').join('')+'</ol></div>';
  $('frvs-acceptSuggestions').onclick=()=>{
    const cycle=d.cycles[0];
    const initialEmpty=cycle.observations.length===1&&
      !String(cycle.observations[0].actionRaw||'').trim()&&
      frvStudyMeasuredDuration(cycle.observations[0])===null;
    if(initialEmpty)cycle.observations=[];
    d.suggestedActions.forEach(x=>{
      const row=frvStudyEmptyObservation(cycle.observations.length+1);
      Object.assign(row,{actionRaw:String(x.actionRaw||''),actionNormalized:String(x.actionNormalized||''),
        activityMode:FRV_ACTIVITY_MODES.includes(x.activityMode)?x.activityMode:'Manual',
        valueType:FRV_VALUE_TYPES.includes(x.valueType)?x.valueType:'OTHER',
        tool:String(x.tool||''),material:String(x.material||''),
        qualityKey:String(x.qualityKey||''),safetyKey:String(x.safetyKey||''),
        durationSec:null,source:'AI-draft',standardCandidate:false});
      cycle.observations.push(row);
    });
    d.suggestedActions=[];d.analysisNeedsReview=true;
    d.validation=null;saveDraft();frvStudyQueuePersist();renderFrvStudy();
    toast('Действия добавлены в наблюдения без выдуманных замеров. Введите фактическое время.','success');
  };
  $('frvs-clearSuggestions').onclick=()=>{d.suggestedActions=[];saveDraft();frvStudyQueuePersist();renderFrvStudy()};
}
function frvStudyStandardPreview(d){
  const c=$('frvStudyDraftSteps');if(!c)return;
  const draft=d.standardCandidate;
  if(!Array.isArray(draft?.steps)||!draft.steps.length){c.innerHTML='';return;}
  c.innerHTML='<div class="border rounded-xl p-3 mt-3"><div class="flex justify-between flex-wrap gap-2">'+
    '<b class="text-sm">Проект шагов СОП · '+draft.steps.length+'</b>'+
    (draft.outdated?'<span class="text-amber-700 text-xs">Замеры изменились — обновите проект шагов</span>':'')+
    '</div><p class="text-xs text-slate-500 my-2">Время — на основе измерений, не норматив. Его можно изменить только в проекте СОП.</p>'+
    draft.steps.map((x,i)=>'<div class="grid md:grid-cols-[2fr_110px_2fr] gap-2 border-t py-2">'+
      '<label class="text-xs">Действие<input class="w-full p-2 border rounded" data-frvs-step="action" data-si="'+i+
       '" value="'+frvStudyEsc(x.action)+'"></label>'+
      '<label class="text-xs">Проект, сек<input type="number" min="0.1" step="0.1" class="w-full p-2 border rounded" data-frvs-step="plannedTimeSec" data-si="'+i+
       '" value="'+frvStudyEsc(x.plannedTimeSec??x.observedTimeSec??'')+'"></label>'+
      '<label class="text-xs">Ключевой момент<input class="w-full p-2 border rounded" data-frvs-step="keyMoment" data-si="'+i+
       '" value="'+frvStudyEsc(x.keyMoment||'')+'"></label></div>').join('')+
    '<p class="text-xs text-slate-500 mt-2">Сначала проверьте шаги, затем нажмите «Создать новый проект СОП». Текущий СОП будет сохранён для восстановления.</p>'+
    '</div>';
  c.querySelectorAll('[data-frvs-step]').forEach(el=>el.addEventListener('input',()=>{
    const item=d.standardCandidate.steps[+el.dataset.si];
    if(!item)return;
    const key=el.dataset.frvsStep;
    item[key]=key==='plannedTimeSec'?(el.value===''?null:Number(el.value)):el.value;
    d.standardCandidate.approved=false;saveDraftDebounced();frvStudyQueuePersist();
  }));
}
function renderFrvStudy(){
  const d=ensureFrvStudy();
  const fields={studyId:'frvs-studyId',processId:'frvs-processId',
    operationId:'frvs-operationId',operator:'frvs-operator',observer:'frvs-observer',
    workplace:'frvs-workplace',taktSec:'frvs-takt',status:'frvs-status',
    processDescription:'frvs-processDescription'};
  Object.entries(fields).forEach(([key,id])=>{
    const el=$(id);if(el&&document.activeElement!==el)el.value=d[key]??'';
  });
  const imp=$('frvs-improvement'),std=$('frvs-standard');
  if(imp&&document.activeElement!==imp)imp.value=d.improvements?.[0]?.countermeasure||'';
  if(std&&document.activeElement!==std)std.value=d.standardCandidate?.text||'';
  const cycles=$('frvStudyCycles');
  if(!cycles)return;
  cycles.innerHTML=d.cycles.map((c,ci)=>frvStudyCycleMarkup(c,ci,d)).join('');
  cycles.querySelectorAll('[data-fs]').forEach(el=>
    el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',()=>{
      const cycle=d.cycles[Number(el.dataset.ci)],o=cycle?.observations[Number(el.dataset.oi)];
      if(!o)return;
      const field=el.dataset.fs;
      const value=el.type==='checkbox'?el.checked:el.type==='number'?
        (el.value===''?null:Number(el.value)):el.value;
      o[field]=value;
      if(field==='valueType'&&['NVA_Waste','WAIT','BREAK'].includes(value)&&o.standardCandidate){
        o.standardCandidate=false;
        const check=cycles.querySelector('[data-fs="standardCandidate"][data-ci="'+
          el.dataset.ci+'"][data-oi="'+el.dataset.oi+'"]');
        if(check)check.checked=false;
      }
      if(d.analysis&&Object.keys(d.analysis).length)d.analysisNeedsReview=true;
      if(d.standardCandidate)d.standardCandidate.outdated=true;
      d.validation=null;
      saveDraftDebounced();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
    })
  );
  cycles.querySelectorAll('[data-frvs-phase]').forEach(el=>el.onchange=()=>{
    d.cycles[Number(el.dataset.frvsPhase)].phase=el.value;
    d.comparisonApproved=false;
    d.analysisNeedsReview=true;
    saveDraftDebounced();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
  });
  cycles.querySelectorAll('[data-frvs-repeat]').forEach(b=>b.onclick=()=>{
    const original=d.cycles[Number(b.dataset.frvsRepeat)];
    const copy=frvStudyEmptyCycle(d.cycles.length+1);
    copy.phase=original.phase||'unassigned';
    copy.observations=original.observations.map((o,i)=>({
      ...frvStudyEmptyObservation(i+1),actionRaw:o.actionRaw,
      actionNormalized:o.actionNormalized,
      activityMode:o.activityMode,valueType:o.valueType,
      lossCode:o.lossCode,standardCandidate:o.standardCandidate,
      durationSec:null,distanceM:null,source:'manual',comment:''
    }));
    d.cycles.push(copy);d.analysisNeedsReview=true;
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  cycles.querySelectorAll('[data-frvs-add]').forEach(b=>b.onclick=()=>{
    const cycle=d.cycles[+b.dataset.frvsAdd];
    cycle.observations.push(frvStudyEmptyObservation(cycle.observations.length+1));
    d.analysisNeedsReview=true;if(d.standardCandidate)d.standardCandidate.outdated=true;
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  cycles.querySelectorAll('[data-frvs-rm]').forEach(b=>b.onclick=()=>{
    const [ci,oi]=b.dataset.frvsRm.split(':').map(Number);
    d.cycles[ci].observations.splice(oi,1);
    if(!d.cycles[ci].observations.length)d.cycles[ci].observations.push(frvStudyEmptyObservation(1));
    d.cycles[ci].observations.forEach((o,i)=>o.seqNo=i+1);
    d.analysisNeedsReview=true;if(d.standardCandidate)d.standardCandidate.outdated=true;
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  cycles.querySelectorAll('[data-frvs-rmcycle]').forEach(b=>b.onclick=()=>{
    d.cycles.splice(+b.dataset.frvsRmcycle,1);
    if(!d.cycles.length)d.cycles.push(frvStudyEmptyCycle(1));
    d.cycles.forEach((c,i)=>c.cycleNo=i+1);
    d.analysisNeedsReview=true;if(d.standardCandidate)d.standardCandidate.outdated=true;
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  cycles.querySelectorAll('[data-frvs-suggest]').forEach(b=>
    b.onclick=()=>frvStudySuggestRow(...b.dataset.frvsSuggest.split(':').map(Number)));
  frvStudySuggestionsMarkup(d);frvStudyStandardPreview(d);
  renderFrvStudyDashboardOnly();
  const back=$('frvStudyRestoreBtn');
  if(back)back.classList.toggle('hidden',!frvStudyHasBackup());
}
function frvStudyInsights(d=ensureFrvStudy()){
  const cycles=d.cycles||[],all=cycles.flatMap(c=>c.observations||[]),
    valid=all.filter(o=>frvStudyMeasuredDuration(o)>0),
    total=valid.reduce((n,o)=>n+frvStudyDuration(o),0);
  const by={};
  FRV_VALUE_TYPES.forEach(t=>by[t]=valid.filter(o=>o.valueType===t)
    .reduce((n,o)=>n+frvStudyDuration(o),0));
  const complete=cycles.filter(frvStudyCycleComplete);
  const lengths=complete.map(frvStudyTotal);
  const mean=lengths.length?lengths.reduce((a,b)=>a+b,0)/lengths.length:null;
  const cv=lengths.length>=2&&mean?
    Math.sqrt(lengths.reduce((sum,v)=>sum+(v-mean)**2,0)/lengths.length)/mean:null;
  return {total,by,all,valid,missing:all.length-valid.length,
    completeCycles:complete.length,mean,cv,
    ranking:[...valid].sort((a,b)=>frvStudyDuration(b)-frvStudyDuration(a)).slice(0,5),
    distance:valid.reduce((n,o)=>n+(Number(o.distanceM)||0),0)};
}
function renderFrvStudyDashboardOnly(){
  const d=ensureFrvStudy(),ins=frvStudyInsights(d);
  const fmt=n=>(Number(n)||0).toFixed(1).replace(/\.0$/,'');
  const percent=n=>ins.total?Math.round(100*n/ins.total)+'%':'—';
  const cards=[['Замерено всего',fmt(ins.total)+' сек'],
    ['ВДЦ',fmt(ins.by.VA)+' сек · '+percent(ins.by.VA)],
    ['М2',fmt(ins.by.NVA_Necessary)+' сек · '+percent(ins.by.NVA_Necessary)],
    ['М1',fmt(ins.by.NVA_Waste)+' сек · '+percent(ins.by.NVA_Waste)],
    ['Ожидание',fmt(ins.by.WAIT)+' сек'],
    ['Перемещение',fmt(ins.distance)+' м']];
  const dash=$('frvStudyDashboard');
  if(dash)dash.innerHTML=cards.map(([k,v])=>
    '<div class="border rounded-lg p-2 bg-slate-50"><div class="text-[10px] text-slate-500">'+
      frvStudyEsc(k)+'</div><b>'+frvStudyEsc(v)+'</b></div>').join('');
  const view=$('frvStudyAnalysis');if(!view)return;
  const missingActions=ins.all.filter(o=>!String(o.actionRaw||'').trim()).length;
  let html='';
  if(ins.missing||missingActions||ins.by.OTHER){
    html+='<div class="text-xs p-2 border border-amber-200 bg-amber-50 rounded-lg">'+
      (ins.missing?'Нет фактического времени: '+ins.missing+'. ':'')+
      (missingActions?'Нет названия действия: '+missingActions+'. ':'')+
      (ins.by.OTHER?'Неклассифицированного времени: '+fmt(ins.by.OTHER)+' сек.':'')+
      '</div>';
  }
  if(d.analysisNeedsReview&&d.analysis&&Object.keys(d.analysis).length)
    html+='<div class="text-xs p-2 border rounded-lg text-amber-700 mt-2">Результат ИИ устарел после изменения замеров. Запустите ИИ повторно при необходимости.</div>';
  html+='<div class="grid md:grid-cols-2 gap-3 mt-2">'+
    '<div class="border rounded-lg p-3"><b class="text-sm">Самые длительные действия</b>'+
      (ins.ranking.length?'<ol class="list-decimal ml-5 mt-2 text-xs space-y-1">'+
      ins.ranking.map(o=>'<li>'+frvStudyEsc(o.actionRaw||'Действие')+
      ' — '+fmt(frvStudyDuration(o))+' сек · '+frvStudyEsc(FRV_VALUE_LABELS[o.valueType]||'—')+'</li>').join('')+
      '</ol>':'<p class="text-xs mt-2">Внесите реальные замеры для расчёта.</p>')+'</div>'+
    '<div class="border rounded-lg p-3"><b class="text-sm">Повторные измерения</b><div class="text-xs mt-2">'+
      'Полностью замеренных циклов: '+ins.completeCycles+' из '+d.cycles.length+
      (ins.mean!==null?'<div>Среднее по полным циклам: '+fmt(ins.mean)+' сек</div>':'')+
      (ins.cv!==null?'<div>Разброс (CV): '+fmt(ins.cv*100)+'%</div>':'')+
      '</div></div></div>';
  const a=d.analysis||{};
  if(!d.analysisNeedsReview&&(a.summary||a.losses?.length||a.risks?.length)){
    html+='<div class="border rounded-xl p-3 mt-3"><b class="text-sm">Дополнительные рекомендации ИИ (не изменяют замеры)</b>'+
      (a.summary?'<p class="text-sm mt-2">'+frvStudyEsc(a.summary)+'</p>':'')+
      (Array.isArray(a.losses)?a.losses.slice(0,8).map(x=>
        '<div class="text-xs p-2 border rounded mt-2"><b>'+frvStudyEsc(FRV_LOSS_LABELS[x.lossCode]||'Потеря')+
        '</b> · '+frvStudyEsc(x.cause||'Причина не установлена')+
        '<div>Предложение: '+frvStudyEsc(x.countermeasure||'—')+'</div></div>').join(''):'')+
      (Array.isArray(a.risks)&&a.risks.length?'<p class="text-xs mt-2">Требует проверки: '+
        a.risks.map(x=>frvStudyEsc(typeof x==='string'?x:(x.message||x.reason||''))).join('; ')+'</p>':'')+
      '</div>';
  }
  view.innerHTML=html;
  frv34RenderAnalytics(d,ins,view);
}
