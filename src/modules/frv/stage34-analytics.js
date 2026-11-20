// Stage34: deterministic Pareto, cycle comparisons, human-approved matching.
// Computations never infer a duration from missing data or AI output.
function frv34NormalizeAction(s){
  return String(s||'').toLocaleLowerCase('ru-RU')
    .replace(/[.,;:!?()[\]{}"'«»]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function frv34CanonicalKey(o,d){
  return frv34NormalizeAction(d.actionAliases?.[o.id]||o.actionNormalized||o.actionRaw);
}
function frv34AnalyticsData(d=ensureFrvStudy()){
  const obs=(d.cycles||[]).flatMap(c=>(c.observations||[]).map(o=>({
    ...o,cycleNo:c.cycleNo,phase:c.phase||'unassigned'})));
  const measured=obs.filter(o=>frvStudyMeasuredDuration(o)>0);
  const kinds={};
  for(const key of FRV_VALUE_TYPES)kinds[key]=0;
  for(const o of measured)kinds[o.valueType]!==undefined?
    kinds[o.valueType]+=frvStudyMeasuredDuration(o):
    kinds.OTHER+=frvStudyMeasuredDuration(o);
  const total=measured.reduce((sum,o)=>sum+frvStudyMeasuredDuration(o),0);
  // Loss Pareto excludes value-adding time, necessary work and breaks.
  const losses=measured.filter(o=>['NVA_Waste','WAIT'].includes(o.valueType));
  const groups=new Map();
  for(const o of losses){
    const key=o.lossCode|| (o.valueType==='WAIT'?'waiting':'unclassified');
    if(!groups.has(key))groups.set(key,{key,label:FRV_LOSS_LABELS[key]||
      (key==='unclassified'?'М1 — причина не определена':'Ожидание'),
      durationSec:0,count:0,ids:[]});
    const g=groups.get(key);
    g.durationSec+=frvStudyMeasuredDuration(o);g.count++;g.ids.push(o.id);
  }
  const totalLosses=losses.reduce((s,o)=>s+frvStudyMeasuredDuration(o),0);
  let running=0;
  const pareto=[...groups.values()].sort((a,b)=>b.durationSec-a.durationSec)
    .map(g=>{running+=g.durationSec;return {...g,
      sharePct:totalLosses?100*g.durationSec/totalLosses:0,
      cumulativePct:totalLosses?100*running/totalLosses:0}});
  const repeats=new Map();
  for(const o of measured){
    const k=frv34CanonicalKey(o,d);
    if(!k)continue;
    if(!repeats.has(k))repeats.set(k,{action:o.actionNormalized||o.actionRaw,
      key:k,durations:[],ids:[]});
    const g=repeats.get(k);g.durations.push(frvStudyMeasuredDuration(o));g.ids.push(o.id);
  }
  const stats=[...repeats.values()].filter(g=>g.durations.length>1).map(g=>{
    const x=g.durations,mean=x.reduce((a,b)=>a+b,0)/x.length;
    const sorted=[...x].sort((a,b)=>a-b),m=sorted.length>>1;
    const median=sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;
    const std=Math.sqrt(x.reduce((sum,v)=>sum+(v-mean)**2,0)/x.length);
    return {...g,samples:x.length,meanSec:mean,medianSec:median,
      minSec:sorted[0],maxSec:sorted.at(-1),cvPct:mean?100*std/mean:null};
  }).sort((a,b)=>(b.cvPct||0)-(a.cvPct||0));
  const complete=(d.cycles||[]).filter(frvStudyCycleComplete);
  const before=complete.filter(c=>c.phase==='baseline').map(frvStudyTotal),
    after=complete.filter(c=>c.phase==='improved').map(frvStudyTotal);
  const mean=xs=>xs.length?xs.reduce((sum,x)=>sum+x,0)/xs.length:null;
  const baseline=mean(before),improved=mean(after);
  const comparable=d.comparisonApproved&&baseline!==null&&improved!==null;
  return {total,measured:measured.length,
    missing:obs.length-measured.length,by:kinds,lossSec:totalLosses,
    pareto,repeatStats:stats,
    comparison:{baselineCount:before.length,improvedCount:after.length,
      baselineSec:baseline,improvedSec:improved,approved:!!d.comparisonApproved,
      comparable,deltaSec:comparable?baseline-improved:null,
      deltaPct:comparable&&baseline?100*(baseline-improved)/baseline:null}};
}
function frv34MatchCandidates(d=ensureFrvStudy()){
  const cycles=d.cycles||[];
  const candidates=[];
  for(let ci=1;ci<cycles.length;ci++){
    const prior=cycles[ci-1],current=cycles[ci];
    current.observations.forEach((o,idx)=>{
      const p=prior.observations[idx];if(!p||!o||!o.actionRaw||!p.actionRaw)return;
      if(d.actionAliases?.[o.id])return;
      const left=frv34NormalizeAction(p.actionRaw),right=frv34NormalizeAction(o.actionRaw);
      if(!left||!right||left===right) return;
      const al=new Set(left.split(' ')),ar=new Set(right.split(' '));
      const common=[...al].filter(w=>ar.has(w)).length;
      const similarity=common/Math.max(1,new Set([...al,...ar]).size);
      if(similarity>=.4&&similarity<1)
        candidates.push({id:o.id,proposed:p.actionRaw,original:o.actionRaw,
          cycleNo:current.cycleNo,similarity});
    });
  }
  return candidates.slice(0,12);
}
function frv34RenderAnalytics(d,ins,view){
  const a=frv34AnalyticsData(d),fmt=n=>Number.isFinite(n)?n.toFixed(1).replace(/\.0$/,''):'—';
  const section=document.createElement('div');
  section.className='mt-3 space-y-3';
  const pareto=a.pareto.length?
    '<table class="w-full text-xs"><thead><tr class="text-left"><th>Потеря</th><th>Сек</th><th>Доля</th><th>Накоплено</th></tr></thead><tbody>'+
    a.pareto.map(x=>'<tr class="border-t"><td class="py-1">'+frvStudyEsc(x.label)+'</td>'+
      '<td>'+fmt(x.durationSec)+'</td><td>'+fmt(x.sharePct)+'%</td>'+
      '<td>'+fmt(x.cumulativePct)+'%'+
      '<div class="h-1.5 bg-slate-100 rounded"><div class="h-1.5 bg-amber-500 rounded" style="width:'+
        Math.max(0,Math.min(100,x.cumulativePct)).toFixed(1)+'%"></div></div></td></tr>').join('')+
    '</tbody></table>':
    '<p class="text-xs text-slate-500">Пока нет измеренных М1/ожиданий для анализа Парето.</p>';
  const stats=a.repeatStats.length?'<div class="text-xs space-y-1">'+
    a.repeatStats.slice(0,6).map(x=>
      '<div class="border-t py-1">'+frvStudyEsc(x.action)+' · '+x.samples+
      ' замера · медиана '+fmt(x.medianSec)+' с · разброс '+fmt(x.cvPct)+'%'+
      (x.cvPct>10?' · проверьте условия':'')+'</div>').join('')+'</div>':
    '<p class="text-xs text-slate-500">Сравнение появится после нескольких реальных замеров одного действия.</p>';
  const c=a.comparison;
  section.innerHTML='<div class="grid md:grid-cols-2 gap-3">'+
    '<div class="border rounded-lg p-3"><b class="text-sm">Парето потерь · '+fmt(a.lossSec)+' с</b>'+
      '<p class="text-xs text-slate-500 my-2">Только подтверждённые М1 и ожидания, без повторного подсчёта.</p>'+
      pareto+'</div>'+
    '<div class="border rounded-lg p-3"><b class="text-sm">Стабильность действий</b>'+
      '<p class="text-xs text-slate-500 my-2">Совпадения по подтверждённым названиям.</p>'+
      stats+'</div></div>'+
    '<details class="border rounded-lg p-3"><summary class="text-sm font-semibold cursor-pointer">Сравнение «до / после» и сопоставление циклов</summary>'+
      '<p class="text-xs text-slate-500 my-2">Отметьте реально измеренные циклы «До» или «После». '+
      'Подтвердите сравнимость условий, иначе программа не объявит экономию времени.</p>'+
      '<label class="flex gap-2 items-center text-xs"><input type="checkbox" id="frv34CompareApproved"'+
         (d.comparisonApproved?' checked':'')+
       '>Я проверил, что границы операции и условия обоих наборов сравнимы</label>'+
      '<p class="text-xs mt-2">До: '+c.baselineCount+' циклов, '+fmt(c.baselineSec)+
      ' сек в среднем · После: '+c.improvedCount+' циклов, '+fmt(c.improvedSec)+' сек.</p>'+
      (c.comparable?
        '<p class="text-sm font-medium mt-1">Реально измеренная разница: '+
        fmt(c.deltaSec)+' сек · '+fmt(c.deltaPct)+'%</p>':
        '<p class="text-xs text-amber-700 mt-1">Сравнение не рассчитано: нужны реальные полные циклы обеих групп и подтверждение условий.</p>')+
      '<div id="frv34MatchSuggestions" class="text-xs mt-3"></div>'+
    '</details>'+
    '<div id="frv34AiClassifications" class="text-xs"></div>';
  view.appendChild(section);
  const approval=section.querySelector('#frv34CompareApproved');
  if(approval)approval.onchange=()=>{
    d.comparisonApproved=approval.checked;
    saveDraftDebounced();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
  };
  const suggestions=frv34MatchCandidates(d),el=section.querySelector('#frv34MatchSuggestions');
  if(el&&suggestions.length){
    el.innerHTML='<b>Похожие действия: подтверждение соответствия</b>'+
      suggestions.map(x=>'<div class="flex flex-wrap gap-2 border-t py-1 items-center">'+
        '<span>'+frvStudyEsc(x.original)+' → '+frvStudyEsc(x.proposed)+'</span>'+
        '<button type="button" data-frv34-match="'+frvStudyEsc(x.id)+
        '" class="border px-2 py-1 rounded">Сопоставить</button></div>').join('');
    el.querySelectorAll('[data-frv34-match]').forEach(b=>b.onclick=()=>{
      const entry=suggestions.find(x=>x.id===b.dataset.frv34Match);
      if(!entry)return;
      d.actionAliases=d.actionAliases||{};
      d.actionAliases[entry.id]=entry.proposed;d.analysisNeedsReview=true;
      if(d.standardCandidate)d.standardCandidate.outdated=true;
      saveDraftDebounced();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
    });
  }
  frv34RenderClassifications(d,section.querySelector('#frv34AiClassifications'));
}
function frv34RenderClassifications(d,el){
  if(!el)return;
  const entries=Array.isArray(d.aiClassifications)?d.aiClassifications:[];
  if(!entries.length){el.innerHTML='';return}
  el.innerHTML='<div class="border rounded-lg p-3"><b class="text-sm">Предложения ИИ по категориям — ещё не подтверждены</b>'+
    '<p class="text-xs text-slate-500 mt-1">ИИ не изменяет сырые действия и время. Подтвердите нужные категории отдельно.</p>'+
    entries.map(x=>'<div class="border-t py-2 flex flex-wrap gap-2 items-center">'+
      '<span>'+frvStudyEsc(x.action)+' → '+frvStudyEsc(FRV_VALUE_LABELS[x.valueType]||x.valueType)+
      (x.reason?' · '+frvStudyEsc(x.reason):'')+'</span>'+
      '<button data-frv34-classify="'+frvStudyEsc(x.observationId)+
      '" class="border px-2 py-1 rounded">Подтвердить</button>'+
      '<button data-frv34-reject="'+frvStudyEsc(x.observationId)+
      '" class="border px-2 py-1 rounded">Отклонить</button></div>').join('')+'</div>';
  el.querySelectorAll('[data-frv34-classify]').forEach(b=>b.onclick=()=>{
    const x=entries.find(x=>x.observationId===b.dataset.frv34Classify);
    const o=d.cycles.flatMap(c=>c.observations).find(o=>o.id===x?.observationId);
    if(!x||!o)return;
    o.valueType=x.valueType;o.lossCode=x.lossCode||'';o.causeCode=x.causeCode||'';
    if(['NVA_Waste','WAIT','BREAK'].includes(o.valueType))o.standardCandidate=false;
    d.aiClassifications=d.aiClassifications.filter(y=>y.observationId!==x.observationId);
    d.analysisNeedsReview=true;if(d.standardCandidate)d.standardCandidate.outdated=true;
    saveDraft();frvStudyQueuePersist();renderFrvStudy();
  });
  el.querySelectorAll('[data-frv34-reject]').forEach(b=>b.onclick=()=>{
    d.aiClassifications=d.aiClassifications.filter(x=>x.observationId!==b.dataset.frv34Reject);
    saveDraft();frvStudyQueuePersist();renderFrvStudyDashboardOnly();
  });
}
