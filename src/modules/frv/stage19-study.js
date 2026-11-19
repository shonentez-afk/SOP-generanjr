// ============================================================
// 10. Generate SOP via AI / photo hint
// ============================================================

// ============================================================
// МОДУЛЬ АНАЛИЗА ФРВ — независимый структурированный слой
// ============================================================
const FRV_VALUE_TYPES=['VA','NVA_Necessary','NVA_Waste','WAIT','BREAK','OTHER'];
const FRV_VALUE_LABELS={VA:'Ценность (VA)',NVA_Necessary:'Необходимое без добавления ценности',NVA_Waste:'Потери',WAIT:'Ожидание',BREAK:'Регламентированный перерыв',OTHER:'Не классифицировано'};
const FRV_ACTIVITY_MODES=['Manual','Auto','Walk','Wait','Setup','Other'];
const FRV_ACTIVITY_LABELS={Manual:'Ручное действие',Auto:'Автоматическое',Walk:'Перемещение',Wait:'Ожидание',Setup:'Подготовка / настройка',Other:'Другое'};
const FRV_LOSSES=['search_tool','extra_move','waiting','overprocessing','rework','defect','info_wait','equipment_wait','material_wait','extra_registration','manual_input','bad_location','other'];
const FRV_LOSS_LABELS={search_tool:'Поиск инструмента',extra_move:'Лишнее перемещение',waiting:'Ожидание',overprocessing:'Лишняя обработка',rework:'Повторная работа',defect:'Дефект',info_wait:'Ожидание информации',equipment_wait:'Ожидание оборудования',material_wait:'Ожидание материала',extra_registration:'Лишняя регистрация',manual_input:'Ручной ввод',bad_location:'Нерациональное размещение',other:'Другие потери'};
function frvStudyEmptyObservation(seq=1){return{id:'fo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),seqNo:seq,durationSec:null,actionRaw:'',actionNormalized:'',activityMode:'Manual',valueType:'OTHER',lossCode:'',causeCode:'',keyMoment:'',reason:'',qualityKey:'',safetyKey:'',tool:'',material:'',locationFrom:'',locationTo:'',distanceM:null,evidenceType:'',evidenceId:'',comment:'',confidence:'',standardCandidate:false,legacyM1M2:{m1:'',m2:''}}}
function frvStudyEmptyCycle(no=1){return{id:'fc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),cycleNo:no,observations:[frvStudyEmptyObservation(1)]}}
function ensureFrvStudy(){if(!state.frvStudy)state.frvStudy={studyId:'',processId:'',operationId:'',operator:'',observer:'',workplace:'',taktSec:null,status:'Draft',version:'1.0',cycles:[],analysis:{},improvements:[],standardCandidate:null,validation:null};if(!Array.isArray(state.frvStudy.cycles))state.frvStudy.cycles=[];if(!state.frvStudy.cycles.length)state.frvStudy.cycles=[frvStudyEmptyCycle(1)];return state.frvStudy}
function frvStudyDuration(o){const n=Number(o.durationSec);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:0}
function frvStudyEsc(s){return escapeHtml(String(s??''))}
function renderFrvStudy(){const d=ensureFrvStudy();const ids={studyId:'frvs-studyId',processId:'frvs-processId',operationId:'frvs-operationId',operator:'frvs-operator',observer:'frvs-observer',workplace:'frvs-workplace',taktSec:'frvs-takt',status:'frvs-status'};Object.entries(ids).forEach(([k,id])=>{const el=$(id);if(el&&document.activeElement!==el)el.value=d[k]??''});const imp=$('frvs-improvement'),std=$('frvs-standard');if(imp&&document.activeElement!==imp)imp.value=d.improvements?.[0]?.countermeasure||'';if(std&&document.activeElement!==std)std.value=d.standardCandidate?.text||'';const cc=$('frvStudyCycles');if(!cc)return;cc.innerHTML=d.cycles.map((cy,ci)=>`<div class="border border-slate-200 rounded-xl p-3 mb-4"><div class="flex items-center justify-between mb-2"><b class="text-sm">Цикл ${cy.cycleNo}</b><div class="flex gap-2"><button data-frvs-add="${ci}" class="text-xs px-2 py-1 rounded border">＋ Наблюдение</button>${d.cycles.length>1?`<button data-frvs-rmcycle="${ci}" class="text-xs px-2 py-1 rounded border text-red-600">Удалить цикл</button>`:''}</div></div><div class="overflow-x-auto"><table class="w-full text-xs min-w-[1700px]"><thead><tr class="bg-slate-50"><th>№</th><th>Длительность, сек</th><th>Фактическое действие</th><th>Нормализованное действие</th><th>Способ выполнения</th><th>Ценность</th><th>Потеря</th><th>Причина</th><th>Ключевой момент</th><th>Причина для ключевого момента</th><th>Качество</th><th>Безопасность</th><th>Инструмент</th><th>Материал</th><th>Откуда → куда</th><th>м</th><th>Доказательство</th><th>Кандидат в стандарт</th><th></th></tr></thead><tbody>${cy.observations.map((o,oi)=>`<tr class="border-t align-top"><td>${oi+1}</td><td><input type="number" min="0" step="0.1" data-fs="durationSec" data-ci="${ci}" data-oi="${oi}" value="${o.durationSec??''}" class="w-24 px-2 py-1 border rounded"></td><td><textarea data-fs="actionRaw" data-ci="${ci}" data-oi="${oi}" rows="2" class="w-56 px-2 py-1 border rounded">${frvStudyEsc(o.actionRaw)}</textarea></td><td><textarea data-fs="actionNormalized" data-ci="${ci}" data-oi="${oi}" rows="2" class="w-56 px-2 py-1 border rounded">${frvStudyEsc(o.actionNormalized)}</textarea><button data-frvs-suggest="${ci}:${oi}" class="mt-1 text-[11px] text-blue-600">🤖 Подсказать</button></td><td><select data-fs="activityMode" data-ci="${ci}" data-oi="${oi}" class="px-2 py-1 border rounded">${FRV_ACTIVITY_MODES.map(x=>`<option value="${x}" ${x===o.activityMode?'selected':''}>${FRV_ACTIVITY_LABELS[x]}</option>`).join('')}</select></td><td><select data-fs="valueType" data-ci="${ci}" data-oi="${oi}" class="px-2 py-1 border rounded">${FRV_VALUE_TYPES.map(x=>`<option value="${x}" ${x===o.valueType?'selected':''}>${FRV_VALUE_LABELS[x]}</option>`).join('')}</select></td><td><select data-fs="lossCode" data-ci="${ci}" data-oi="${oi}" class="px-2 py-1 border rounded"><option value="">—</option>${FRV_LOSSES.map(x=>`<option value="${x}" ${x===o.lossCode?'selected':''}>${FRV_LOSS_LABELS[x]}</option>`).join('')}</select></td><td><input data-fs="causeCode" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.causeCode)}" class="w-40 px-2 py-1 border rounded"></td><td><textarea data-fs="keyMoment" data-ci="${ci}" data-oi="${oi}" rows="2" class="w-44 px-2 py-1 border rounded">${frvStudyEsc(o.keyMoment||'')}</textarea></td><td><textarea data-fs="reason" data-ci="${ci}" data-oi="${oi}" rows="2" class="w-44 px-2 py-1 border rounded">${frvStudyEsc(o.reason||'')}</textarea></td><td><input data-fs="qualityKey" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.qualityKey)}" class="w-36 px-2 py-1 border rounded"></td><td><input data-fs="safetyKey" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.safetyKey)}" class="w-36 px-2 py-1 border rounded"></td><td><input data-fs="tool" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.tool)}" class="w-32 px-2 py-1 border rounded"></td><td><input data-fs="material" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.material)}" class="w-32 px-2 py-1 border rounded"></td><td><input data-fs="locationFrom" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.locationFrom)}" class="w-28 px-2 py-1 border rounded mb-1"><input data-fs="locationTo" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.locationTo)}" class="w-28 px-2 py-1 border rounded"></td><td><input type="number" min="0" step="0.1" data-fs="distanceM" data-ci="${ci}" data-oi="${oi}" value="${o.distanceM??''}" class="w-20 px-2 py-1 border rounded"></td><td><input data-fs="evidenceId" data-ci="${ci}" data-oi="${oi}" value="${frvStudyEsc(o.evidenceId)}" class="w-28 px-2 py-1 border rounded"></td><td class="text-center"><input type="checkbox" data-fs="standardCandidate" data-ci="${ci}" data-oi="${oi}" ${o.standardCandidate?'checked':''}></td><td><button data-frvs-rm="${ci}:${oi}" class="text-red-500">✕</button></td></tr>`).join('')}</tbody></table></div><div class="mt-2 text-xs text-slate-500">Итого цикл: <b>${frvStudyDuration({durationSec:cy.observations.reduce((n,o)=>n+frvStudyDuration(o),0)})} сек</b></div></div>`).join('');cc.querySelectorAll('[data-fs]').forEach(el=>el.addEventListener('input',()=>{const o=d.cycles[+el.dataset.ci].observations[+el.dataset.oi];o[el.dataset.fs]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):el.value;saveDraftDebounced();renderFrvStudyDashboardOnly()}));cc.querySelectorAll('[data-frvs-add]').forEach(b=>b.onclick=()=>{const c=d.cycles[+b.dataset.frvsAdd];c.observations.push(frvStudyEmptyObservation(c.observations.length+1));saveDraft();renderFrvStudy()});cc.querySelectorAll('[data-frvs-rm]').forEach(b=>b.onclick=()=>{const [ci,oi]=b.dataset.frvsRm.split(':').map(Number);d.cycles[ci].observations.splice(oi,1);if(!d.cycles[ci].observations.length)d.cycles[ci].observations.push(frvStudyEmptyObservation(1));saveDraft();renderFrvStudy()});cc.querySelectorAll('[data-frvs-rmcycle]').forEach(b=>b.onclick=()=>{d.cycles.splice(+b.dataset.frvsRmcycle,1);d.cycles.forEach((c,i)=>c.cycleNo=i+1);if(!d.cycles.length)d.cycles.push(frvStudyEmptyCycle(1));saveDraft();renderFrvStudy()});cc.querySelectorAll('[data-frvs-suggest]').forEach(b=>b.onclick=()=>frvStudySuggestRow(...b.dataset.frvsSuggest.split(':').map(Number)));renderFrvStudyDashboardOnly();}
function frvStudyTotal(c){return (c.observations||[]).reduce((n,o)=>n+frvStudyDuration(o),0)}
function renderFrvStudyDashboardOnly(){
  const d=ensureFrvStudy(),obs=d.cycles.flatMap(c=>c.observations),total=obs.reduce((n,o)=>n+frvStudyDuration(o),0),by=t=>obs.filter(o=>o.valueType===t).reduce((n,o)=>n+frvStudyDuration(o),0),dist=obs.reduce((n,o)=>n+Number(o.distanceM||0),0);
  const c=$('frvStudyDashboard');
  if(c)c.innerHTML=[["Общее время, сек",total],["Ценность, сек",by('VA')],["Необходимое без ценности, сек",by('NVA_Necessary')],["Потери, сек",by('NVA_Waste')],["Ожидание, сек",by('WAIT')],["Перемещения, м",Math.round(dist*10)/10]].map(([a,v])=>`<div class="border rounded-lg p-2 bg-slate-50"><div class="text-[10px] text-slate-500">${a}</div><div class="font-semibold">${v}</div></div>`).join('');
  const an=$('frvStudyAnalysis');
  if(!an)return;
  const missing=obs.filter(o=>!String(o.actionRaw||'').trim()).length,unknown=obs.filter(o=>o.valueType==='OTHER').length,untimed=obs.filter(o=>frvStudyDuration(o)<=0).length;
  const a=d.analysis||{};
  const candidates=Array.isArray(a.standardCandidates)?a.standardCandidates:[];
  const losses=Array.isArray(a.losses)?a.losses:[];
  const risks=Array.isArray(a.risks)?a.risks:[];
  const esc=frvStudyEsc;
  let html=`<div class="grid md:grid-cols-3 gap-2 mb-3"><div class="text-xs ${missing?'text-red-600':'text-green-700'}">${missing?'⚠':'✓'} Пустых действий: ${missing}</div><div class="text-xs ${untimed?'text-red-600':'text-green-700'}">${untimed?'⚠':'✓'} Неназначенных длительностей: ${untimed}</div><div class="text-xs ${unknown?'text-amber-600':'text-green-700'}">${unknown?'⚠':'✓'} Не классифицировано: ${unknown}</div></div>`;
  if(a.summary||candidates.length||losses.length||risks.length||a.nextMeasurement){
    html+=`<div class="border rounded-xl p-3 bg-slate-50"><div class="font-semibold text-sm mb-2">Результат анализа ИИ</div>${a.summary?`<div class="text-sm mb-3"><b>Итог:</b> ${esc(a.summary)}</div>`:''}`;
    if(losses.length){html+=`<div class="font-medium text-sm mb-1">Потери и причины</div><div class="space-y-1 mb-3">${losses.map(x=>`<div class="text-xs border rounded-lg bg-white p-2"><b>${esc(x.lossCode||'Потеря')}</b>${x.observationId?` · наблюдение ${esc(x.observationId)}`:''}<br>Причина: ${esc(x.cause||'—')}<br>Мероприятие: ${esc(x.countermeasure||'—')}${x.expectedReductionSec!=null?`<br>Ожидаемое сокращение: ${esc(x.expectedReductionSec)} сек`:''}</div>`).join('')}</div>`}
    if(candidates.length){html+=`<div class="font-medium text-sm mb-1">Кандидаты в стандарт</div><div class="space-y-2">${candidates.map((x,i)=>`<div class="border rounded-lg bg-white p-3"><div class="flex items-start justify-between gap-2"><b class="text-sm">${i+1}. ${esc(x.action||'Без названия')}</b><span class="text-[11px] text-slate-500">${x.observationId?`Источник: ${esc(x.observationId)}`:''}</span></div><div class="grid md:grid-cols-2 gap-2 mt-2 text-xs"><div><b>Время:</b> ${x.standardTimeSec??'—'} сек</div><div><b>Цикл:</b> ${x.sourceCycleNo??'—'}</div><div><b>Ключевой момент:</b> ${esc(x.keyMoment||'—')}</div><div><b>Причина:</b> ${esc(x.reason||'—')}</div><div><b>Качество:</b> ${esc(x.quality||'—')}</div><div><b>Безопасность:</b> ${esc(x.safety||'—')}</div></div></div>`).join('')}</div>`}
    if(risks.length)html+=`<div class="mt-3 text-xs"><b>Требует уточнения:</b> ${risks.map(x=>esc(typeof x==='string'?x:(x.message||x.reason||JSON.stringify(x)))).join('; ')}</div>`;
    if(a.nextMeasurement)html+=`<div class="mt-2 text-xs"><b>Следующий замер:</b> ${esc(a.nextMeasurement)}</div>`;
    html+='</div>';
  } else {
    html+=`<div class="text-xs text-slate-500 border border-dashed rounded-lg p-3">Анализ ещё не выполнен. После нажатия «Анализировать ФРВ» здесь появится результат анализа, кандидаты в стандарт и рекомендации по потерям.</div>`;
  }
  an.innerHTML=html;
}
function frvStudyValidate(){const d=ensureFrvStudy(),errors=[],warnings=[];for(const c of d.cycles){for(const o of c.observations){const dur=Number(o.durationSec);if(!Number.isFinite(dur)||dur<=0)errors.push(`Цикл ${c.cycleNo}, наблюдение ${o.seqNo}: укажите длительность больше 0 секунд`);if(!String(o.actionRaw||'').trim())errors.push(`Цикл ${c.cycleNo}, наблюдение ${o.seqNo}: отсутствует фактическое действие`);if(o.valueType==='OTHER')warnings.push(`Цикл ${c.cycleNo}, наблюдение ${o.seqNo}: действие не классифицировано`);if(o.standardCandidate&&!String(o.actionNormalized||o.actionRaw||'').trim())errors.push(`Кандидат в стандарт без действия: цикл ${c.cycleNo}, №${o.seqNo}`)}}const times=d.cycles.map(frvStudyTotal).filter(x=>x>0);if(times.length>1){const mean=times.reduce((a,b)=>a+b,0)/times.length,variance=times.reduce((a,b)=>a+(b-mean)**2,0)/times.length,cv=mean?Math.sqrt(variance)/mean:0;if(cv>.1)warnings.push(`Разброс циклов высокий: CV ${(cv*100).toFixed(1)}%`)}if(!d.studyId)warnings.push('Не задан ID исследования');if(!d.operator)warnings.push('Не указан исполнитель');if(!d.observer)warnings.push('Не указан наблюдатель');if(d.taktSec&&times.some(t=>t>d.taktSec))warnings.push('Есть цикл дольше времени такта');d.validation={errors,warnings,checkedAt:new Date().toISOString()};d.status=errors.length?'Analyzed':'Validated';saveDraft();renderFrvStudy();const v=$('frvStudyValidation');if(v)v.innerHTML=`<div class="p-3 rounded-lg border ${errors.length?'bg-red-50 border-red-200':'bg-green-50 border-green-200'} text-sm"><b>${errors.length?'Есть ошибки':'Проверка пройдена'}</b><div class="text-xs mt-1">${[...errors,...warnings].map(x=>`• ${frvStudyEsc(x)}`).join('<br>')||'Математическая целостность и обязательные поля в норме.'}</div></div>`;return !errors.length}
function frvStudyExport(){const d=ensureFrvStudy(),times=d.cycles.map(frvStudyTotal).filter(x=>x>0),mean=times.length?times.reduce((a,b)=>a+b,0)/times.length:null,sorted=[...times].sort((a,b)=>a-b),median=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):null;return{schemaVersion:'FRV-1.1',study:{studyId:d.studyId,processId:d.processId,operationId:d.operationId,operator:d.operator,observer:d.observer,workplace:d.workplace,taktSec:d.taktSec,status:d.status,version:d.version},cycles:d.cycles.map(c=>({cycleNo:c.cycleNo,observations:c.observations.map(o=>({...o,durationSec:frvStudyDuration(o)})),cycleDurationSec:frvStudyTotal(c)})),analysis:{...d.analysis,statistics:{cycles:times.length,meanSec:mean,medianSec:median,minSec:times.length?Math.min(...times):null,maxSec:times.length?Math.max(...times):null}},improvements:d.improvements,standard:d.standardCandidate,validation:d.validation}}
function frvStudySchema(){return{$schema:'https://json-schema.org/draft/2020-12/schema',title:'Фотография рабочего времени',type:'object',required:['schemaVersion','study','cycles'],properties:{schemaVersion:{type:'string'},study:{type:'object'},cycles:{type:'array',items:{type:'object',required:['cycleNo','observations'],properties:{cycleNo:{type:'integer'},observations:{type:'array',items:{type:'object',required:['id','seqNo','actionRaw','durationSec'],properties:{id:{type:'string'},seqNo:{type:'integer'},durationSec:{type:'number'},actionRaw:{type:'string'},actionNormalized:{type:'string'},activityMode:{enum:FRV_ACTIVITY_MODES},valueType:{enum:FRV_VALUE_TYPES},lossCode:{type:'string'},causeCode:{type:'string'},keyMoment:{type:'string'},reason:{type:'string'},qualityKey:{type:'string'},safetyKey:{type:'string'},tool:{type:'string'},material:{type:'string'},distanceM:{type:['number','null']},evidenceId:{type:'string'},comment:{type:'string'},standardCandidate:{type:'boolean'}}}}}}},analysis:{type:'object'},improvements:{type:'array'},standard:{type:['object','null']},validation:{type:['object','null']}}}}
function frvStudyDownloadJson(){const blob=new Blob([JSON.stringify(frvStudyExport(),null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(ensureFrvStudy().studyId||'frv-study')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function frvStudySyncFields(){const d=ensureFrvStudy();[['studyId','frvs-studyId'],['processId','frvs-processId'],['operationId','frvs-operationId'],['operator','frvs-operator'],['observer','frvs-observer'],['workplace','frvs-workplace'],['taktSec','frvs-takt'],['status','frvs-status']].forEach(([k,id])=>{const el=$(id);if(el)d[k]=el.type==='number'?(el.value===''?null:Number(el.value)):el.value});const imp=$('frvs-improvement'),std=$('frvs-standard');if(imp){const prev=d.improvements?.[0]||{id:'IMP1',problem:'',owner:'',status:'Open',expectedReductionSec:null,actualReductionSec:null};d.improvements=[{...prev,countermeasure:imp.value}]};if(std){d.standardCandidate=d.standardCandidate||{text:'',approved:false,sourceObservationIds:[],steps:[]};d.standardCandidate.text=std.value}saveDraft()}
function parseFrvAIJson(raw){
  let s=String(raw??'').trim();
  s=s.replace(/```(?:json|JSON)?/g,'').replace(/```/g,'').trim();
  // Частая ошибка моделей: экранированные двоеточия вне строк (\:).
  s=s.replace(/\\:/g,':');
  // Берём первый полноценный JSON-объект, игнорируя пояснения модели до/после него.
  const first=s.indexOf('{');
  if(first<0) throw new Error('ИИ не вернул JSON-объект');
  let depth=0,inString=false,escaped=false,end=-1;
  for(let i=first;i<s.length;i++){
    const ch=s[i];
    if(inString){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0){end=i+1;break;}
    }
  }
  if(end<0) throw new Error('ИИ вернул незавершённый JSON');
  let json=s.slice(first,end)
    .replace(/,\s*([}\]])/g,'$1')
    .replace(/\u00a0/g,' ');
  try{
    const obj=JSON.parse(json);
    if(!obj || typeof obj!=='object' || Array.isArray(obj)) throw new Error('Ожидался JSON-объект');
    return obj;
  }catch(firstErr){
    // Безопасный второй проход только для типовых артефактов вывода модели.
    json=json.replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g,'$1"$2":');
    try{
      const obj=JSON.parse(json);
      if(!obj || typeof obj!=='object' || Array.isArray(obj)) throw new Error('Ожидался JSON-объект');
      return obj;
    }catch(e){
      throw new Error('ИИ вернул некорректный JSON: '+firstErr.message);
    }
  }
}
async function frvStudyBuild(){frvStudySyncFields();const d=ensureFrvStudy(),desc=String(state.description||'').trim();if(!desc)return toast('Сначала заполните «Описание процесса» в редакторе','info');const btn=$('frvStudyBuildBtn');if(btn){btn.disabled=true;btn.textContent='⏳ Строю ФРВ…'}try{const sys=`Ты инженер по фотографии рабочего времени и стандартизированной работе. На основании описания работы выдели только реально наблюдаемые действия, которые можно увидеть или измерить при выполнении операции. Не пиши СОП и не придумывай факты, время, инструменты или требования, которых нет в описании. Одно действие — одна строка наблюдения. Объединяй тесно связанные действия, если они являются одной наблюдаемой операцией. Не дроби предложение на микродвижения.

Верни ТОЛЬКО валидный JSON без markdown, комментариев и пояснений. Главный и единственный массив называется sequence. Для каждой строки обязательно заполни actionRaw и actionNormalized. Остальные поля заполняй только если они прямо следуют из описания, иначе оставляй пустыми или null. durationSec всегда null, если длительность прямо не указана. Формат:
{"sequence":[{"actionRaw":"","actionNormalized":"","activityMode":"Manual|Auto|Walk|Wait|Setup|Other","valueType":"VA|NVA_Necessary|NVA_Waste|WAIT|BREAK|OTHER","qualityKey":"","safetyKey":"","tool":"","material":"","comment":"","lossCode":"","causeCode":"","durationSec":null}]}`;const payload={description:desc};const raw=await aiAsk(sys,JSON.stringify(payload),{model:currentModel,temperature:.1,maxTokens:3500,task:'frv_study_build'});const out=parseFrvAIJson(raw);let seq=Array.isArray(out?.sequence)?out.sequence:(Array.isArray(out?.rows)?out.rows:(Array.isArray(out?.observations)?out.observations:[]));if(!seq.length&&out?.data){seq=Array.isArray(out.data.sequence)?out.data.sequence:(Array.isArray(out.data.rows)?out.data.rows:[])}seq=seq.filter(x=>x&&String(x.actionRaw??x.action??x.actionNormalized??'').trim());if(!seq.length)throw new Error('ИИ не вернул наблюдаемых действий. Повторите запрос или проверьте описание работы.');d.cycles=[{...frvStudyEmptyCycle(1),observations:seq.map((x,i)=>{const actionRaw=String(x.actionRaw??x.action??x.actionNormalized??'').trim(),actionNormalized=String(x.actionNormalized??x.action??actionRaw).trim();return {...frvStudyEmptyObservation(i+1),...x,actionRaw,actionNormalized,seqNo:i+1,durationSec:x.durationSec==null||x.durationSec===''?null:Number(x.durationSec)}})}];d.status='Observed';saveDraft();renderFrvStudy();toast('ФРВ построена. Проверьте действия и внесите фактическую длительность по замеру.','success')}catch(e){console.error('[ФРВ] Построение:',e);toast(diagnoseAIError(e),'error')}finally{if(btn){btn.disabled=false;btn.textContent='🤖 Построить ФРВ из описания'}}}
async function frvStudySuggestRow(ci,oi){
  frvStudySyncFields();
  const d=ensureFrvStudy(),o=d.cycles[ci]?.observations[oi];
  if(!o)return;
  const b=document.querySelector(`[data-frvs-suggest="${ci}:${oi}"]`);
  const old=b?.textContent;
  if(b){b.disabled=true;b.textContent='⏳ Подсказка…';}
  try{
    const system=`Ты помощник аналитика ФРВ производственного предприятия. Анализируй только переданное фактическое действие. Не изменяй RAW и фактическую длительность. Не придумывай отсутствующие факты. Верни ТОЛЬКО один валидный JSON-объект без markdown, пояснений и комментариев.
Поля:
{"actionNormalized":"","valueType":"VA|NVA_Necessary|NVA_Waste|WAIT|BREAK|OTHER","activityMode":"Manual|Auto|Walk|Wait|Setup|Other","lossCode":"","causeCode":"","qualityKey":"","safetyKey":"","keyMoment":"","reason":"","standardCandidate":false}
keyMoment — только действительно важная деталь выполнения шага. reason — кратко почему эта деталь важна. Если оснований недостаточно, оставь поля пустыми. Не придумывай нормативы, значения, СИЗ или требования.`;
    const raw=await aiAsk(system,JSON.stringify({actionRaw:String(o.actionRaw||''),durationSec:o.durationSec==null?null:Number(o.durationSec)}),{model:currentModel,temperature:.1,maxTokens:1000,task:'frv_study_row_suggest'});
    const x=parseFrvAIJson(raw);
    if(!x.actionNormalized && !x.valueType && !x.activityMode && !x.keyMoment && !x.reason)throw new Error('ИИ не вернул полезную подсказку для этой строки');
    ['actionNormalized','valueType','activityMode','lossCode','causeCode','qualityKey','safetyKey','keyMoment','reason'].forEach(k=>{
      if(Object.prototype.hasOwnProperty.call(x,k) && String(x[k]??'').trim()!=='')o[k]=String(x[k]).trim();
    });
    if(typeof x.standardCandidate==='boolean')o.standardCandidate=x.standardCandidate;
    saveDraft();renderFrvStudy();
    toast('Подсказка применена: действие, анализ, ключевой момент и причина обновлены.','success');
  }catch(e){console.error('[ФРВ] Подсказка строки:',e);toast(diagnoseAIError(e),'error')}
  finally{if(b){b.disabled=false;b.textContent=old||'🤖 Подсказать';}}
}
async function frvStudyAnalyze(){
  frvStudySyncFields();
  const d=ensureFrvStudy();
  try{
    const observations=d.cycles.flatMap(c=>c.observations.map(o=>({id:o.id,cycleNo:c.cycleNo,seqNo:o.seqNo,actionRaw:o.actionRaw,actionNormalized:o.actionNormalized,durationSec:frvStudyDuration(o),activityMode:o.activityMode,valueType:o.valueType,lossCode:o.lossCode,causeCode:o.causeCode,qualityKey:o.qualityKey,safetyKey:o.safetyKey,tool:o.tool,material:o.material,comment:o.comment,standardCandidate:o.standardCandidate,evidenceId:o.evidenceId})));
    if(!observations.length)return toast('Нет наблюдений для анализа','info');
    const sys=`Ты аналитик ФРВ и стандартизированной работы. Анализируй только переданные наблюдения. RAW и фактическую длительность не изменяй и не придумывай отсутствующие факты. Не дроби действия и не создавай новые действия, которых нет в наблюдениях. Для каждого наблюдения, которое пригодно для стандарта, сформируй рекомендацию. Ключевой момент и причина должны быть заполнены только когда они обоснованы самим наблюдением или переданными данными. Потери анализируй отдельно: потеря → причина → мероприятие → ожидаемое сокращение времени. observationId ОБЯЗАТЕЛЬНО должен точно совпадать с id исходного наблюдения. Если данных недостаточно, оставь поле пустым и укажи это в risks.
Верни ТОЛЬКО валидный JSON без markdown:
{"summary":"","losses":[{"observationId":"","lossCode":"","cause":"","countermeasure":"","expectedReductionSec":null}],"standardCandidates":[{"observationId":"","action":"","standardTimeSec":null,"keyMoment":"","reason":"","quality":"","safety":"","tool":"","material":"","sourceCycleNo":null}],"risks":[],"nextMeasurement":""}`;
    const raw=await aiAsk(sys,JSON.stringify({study:frvStudyExport(),observations}),{model:currentModel,temperature:.1,maxTokens:3000,task:'frv_study_analyze'});
    const a=parseFrvAIJson(raw);
    if(!a||typeof a!=='object')throw new Error('ИИ не вернул структуру анализа');
    a.standardCandidates=Array.isArray(a.standardCandidates)?a.standardCandidates.filter(x=>x&&String(x.observationId||'').trim()):[];
    const validIds=new Set(observations.map(x=>String(x.id)));
    a.standardCandidates=a.standardCandidates.filter(x=>validIds.has(String(x.observationId)));
    a.losses=Array.isArray(a.losses)?a.losses.filter(x=>x&&(!x.observationId||validIds.has(String(x.observationId)))):[];
    d.analysis=a;
    // Результат анализа переносится в строки только как AI-предложение; RAW и длительность остаются неизменными.
    const byId=new Map(a.standardCandidates.map(x=>[String(x.observationId),x]));
    d.cycles.forEach(c=>c.observations.forEach(o=>{
      const x=byId.get(String(o.id));
      if(!x)return;
      if(String(x.action||'').trim())o.actionNormalized=String(x.action).trim();
      if(String(x.keyMoment||'').trim())o.keyMoment=String(x.keyMoment).trim();
      if(String(x.reason||'').trim())o.reason=String(x.reason).trim();
      if(String(x.quality||'').trim())o.qualityKey=String(x.quality).trim();
      if(String(x.safety||'').trim())o.safetyKey=String(x.safety).trim();
      if(String(x.tool||'').trim())o.tool=String(x.tool).trim();
      if(String(x.material||'').trim())o.material=String(x.material).trim();
    }));
    d.status='Analyzed';
    saveDraft();
    renderFrvStudy();
    toast(`Анализ ФРВ завершён: кандидатов — ${a.standardCandidates.length}`,'success');
  }catch(e){console.error('[ФРВ] Анализ:',e);toast(diagnoseAIError(e),'error')}
}
function frvStudyStandardMap(d){const map=new Map((d.analysis?.standardCandidates||[]).map(x=>[String(x.observationId),x]));return map}
function frvStudyMakeSok(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),analysisMap=frvStudyStandardMap(d);
  let obs=d.cycles.flatMap(c=>c.observations.filter(o=>o.standardCandidate&&String(o.actionNormalized||o.actionRaw||'').trim()));
  if(!obs.length)return toast('Сначала отметьте подтверждённые кандидаты в стандарт','info');
  if(!d.analysis?.standardCandidates?.length)return toast('Сначала нажмите «Анализировать ФРВ» — СОК строится из результата анализа','info');
  const selected=obs.map(o=>({o,a:analysisMap.get(String(o.id))})).filter(x=>x.a);
  if(!selected.length)return toast('Для отмеченных строк нет результатов анализа. Повторите анализ ФРВ.','info');
  const steps=selected.map((x,i)=>{const o=x.o,a=x.a;return {sourceObservationId:o.id,sourceCycleNo:a.sourceCycleNo??null,action:a.action||o.actionNormalized||o.actionRaw,standardTimeSec:Number.isFinite(Number(a.standardTimeSec))?Number(a.standardTimeSec):frvStudyDuration(o),keyMoment:a.keyMoment||o.keyMoment||'',reason:a.reason||o.reason||'',quality:a.quality||o.qualityKey||'',safety:a.safety||o.safetyKey||'',tool:a.tool||o.tool||'',material:a.material||o.material||''}});
  d.standardCandidate={...(d.standardCandidate||{}),text:steps.map((x,i)=>`Шаг ${i+1}: ${x.action}. Время: ${x.standardTimeSec} сек. ${x.keyMoment?'Ключевой момент: '+x.keyMoment+'. ':''}${x.reason?'Причина: '+x.reason+'. ':''}${x.quality?'Качество: '+x.quality+'. ':''}${x.safety?'Безопасность: '+x.safety+'. ':''}`).join('\n'),sourceObservationIds:steps.map(x=>x.sourceObservationId),approved:false,steps};
  saveDraft();renderFrvStudy();toast(`СОК-кандидат сформирован: ${steps.length} шагов`,'success');
}
function frvStudySendSop(){
  frvStudySyncFields();
  const d=ensureFrvStudy();
  const steps=Array.isArray(d.standardCandidate?.steps)?d.standardCandidate.steps:[];
  if(!steps.length)return toast('Сначала сформируйте СОК-кандидат из подтверждённых строк','info');
  state.steps=[];
  steps.forEach(x=>{const s=createEmptyStep();s.action=x.action||'';s.durationSeconds=Number.isFinite(Number(x.standardTimeSec))?Number(x.standardTimeSec):0;s.keyMoments=x.keyMoment?[x.keyMoment]:[];s.reason=x.reason||'';s.successCriteria=x.quality||'';s.decisionPoints=[];s.commonPitfalls=[];s.visualMarkers=[];s.photoHint='';s.frv={vdc:false,m2:'',m1:'',move:'',comment:''};s.frvSource={studyId:d.studyId||'',observationId:x.sourceObservationId||'',cycleNo:x.sourceCycleNo??null};if(x.safety)s.keyMoments.push(`Безопасность: ${x.safety}`);state.steps.push(s)});
  d.status='Approved';d.standardCandidate={...d.standardCandidate,approved:true};
  stateChanged();document.querySelector('[data-tab="editor"]')?.click();toast(`В СОП передано шагов: ${state.steps.length}. Ключевые моменты и причины перенесены.`,'success');
}
(function bindFrvStudy(){['frvs-studyId','frvs-processId','frvs-operationId','frvs-operator','frvs-observer','frvs-workplace','frvs-takt','frvs-status'].forEach(id=>$(id)?.addEventListener('change',frvStudySyncFields));$('frvs-improvement')?.addEventListener('input',saveDraftDebounced);$('frvs-standard')?.addEventListener('input',saveDraftDebounced);$('frvStudyAddCycleBtn')?.addEventListener('click',()=>{const d=ensureFrvStudy();d.cycles.push(frvStudyEmptyCycle(d.cycles.length+1));saveDraft();renderFrvStudy()});$('frvStudyBuildBtn')?.addEventListener('click',frvStudyBuild);$('frvStudyAnalyzeBtn')?.addEventListener('click',frvStudyAnalyze);$('frvStudyValidateBtn')?.addEventListener('click',frvStudyValidate);$('frvStudyMakeSokBtn')?.addEventListener('click',frvStudyMakeSok);$('frvStudySendSopBtn')?.addEventListener('click',frvStudySendSop)})();

