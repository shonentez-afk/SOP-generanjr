// Stage33: ordinary SOP-linked FRV and Excel remain independent from
// research->SOP. Never double count VA, M1 and M2 within a step.
function getFrvMeta(){return JSON.parse(JSON.stringify(state.frvMeta))}
function frvClassifiedPart(raw){
  if(raw===null||raw===undefined||String(raw).trim()==='')return 0;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0?n:NaN;
}
function computeFrv(steps=state.steps){
  let cum=0,sumV=0,sumM2=0,sumM1=0,sumMove=0;
  const errors=[],warnings=[];
  const rows=(steps||[]).map((s,index)=>{
    const f=s.frv||{},dur=Number(s.durationSeconds)||0;
    const m2=frvClassifiedPart(f.m2),m1=frvClassifiedPart(f.m1),
      move=frvClassifiedPart(f.move);
    const tag='Шаг '+(index+1);
    if(!Number.isFinite(dur)||dur<0)errors.push(tag+': некорректная длительность');
    if(!Number.isFinite(m2)||!Number.isFinite(m1)||!Number.isFinite(move))
      errors.push(tag+': М1, М2 и расстояние должны быть неотрицательными числами');
    if(Number.isFinite(m1)&&Number.isFinite(m2)&&m1+m2>dur+.0001)
      errors.push(tag+': сумма М1 + М2 больше длительности шага');
    const partM1=Number.isFinite(m1)?m1:0,
      partM2=Number.isFinite(m2)?m2:0;
    // VDC checkbox means "remaining measured duration is value adding":
    // it cannot include seconds already classified as M1 or M2.
    const vdc=f.vdc?Math.max(0,dur-partM1-partM2):0;
    const remaining=Math.max(0,dur-vdc-partM1-partM2);
    const row={startSec:cum,start:formatHMS(cum),durSec:dur,
      action:s.action,vdcSec:vdc,m2:partM2,m1:partM1,
      mv:Number.isFinite(move)?move:0,unclassifiedSec:remaining,
      comment:f.comment?.trim()||s.keyMoments?.filter(Boolean).join('; ')||''};
    cum+=dur;sumV+=vdc;sumM2+=partM2;sumM1+=partM1;sumMove+=row.mv;
    if(remaining>.0001)warnings.push(tag+': '+remaining.toFixed(1)+' сек не классифицировано');
    return row;
  });
  return {rows,cum,sumV,sumM2,sumM1,sumMove,errors,warnings};
}
function renderFrv(){
  const c=$('frvRowsContainer');if(!c)return;
  if(!state.steps.length){
    c.innerHTML='<div class="text-center py-8 text-slate-400 text-sm">Сначала добавьте шаги в редакторе СОП. Для исследования с нуля откройте «Анализ ФРВ».</div>';
    return;
  }
  c.innerHTML='<div class="min-w-[950px]"><table class="w-full text-sm">'+
    '<thead class="bg-slate-100"><tr>'+[
      '№','Действие','Время','ВДЦ (остаток)','М2, сек','М1, сек','Перемещ., м','Комментарий'
    ].map(t=>'<th class="px-2 py-2 text-left">'+escapeHtml(t)+'</th>').join('')+
    '</tr></thead><tbody>'+state.steps.map((s,i)=>{
      const f=s.frv||{},id=String(s.id),td=(html)=>'<td class="px-2 py-1">'+html+'</td>';
      const input=(name,type,value)=>'<input data-frv="'+name+'" data-id="'+id+
        '" type="'+type+'"'+(type==='number'?' min="0" step="0.1"':'')+
        ' value="'+escapeHtml(String(value??''))+
        '" class="w-full min-w-[90px] px-1 py-1 border rounded text-xs">';
      return '<tr class="border-t">'+
        td(String(i+1))+td(escapeHtml(s.action||'—'))+
        td('<span class="font-mono">'+formatDuration(s.durationSeconds)+'</span>')+
        td('<input aria-label="ВДЦ — остаток времени" type="checkbox" data-frv="vdc" data-id="'+id+'"'+(f.vdc?' checked':'')+'>')+
        td(input('m2','number',f.m2||''))+td(input('m1','number',f.m1||''))+
        td(input('move','number',f.move||''))+td(input('comment','text',f.comment||''))+
        '</tr>';
    }).join('')+'</tbody></table></div>'+
    '<p class="text-xs text-slate-500 mt-2">ВДЦ = остаток времени действия после М1 и М2, если установлена галочка. '+
    'М1 + М2 не могут превышать продолжительность шага.</p>'+
    '<div id="frvWarnings" class="text-xs mt-2"></div>';
  const renderIssues=()=>{
    const r=computeFrv();
    const box=$('frvWarnings');
    if(box)box.innerHTML=(r.errors.length?'<div class="text-red-700 p-2 border border-red-200 rounded">'+
      r.errors.map(escapeHtml).join('; ')+'</div>':'')+
      (r.warnings.length?'<div class="text-amber-700 mt-1">Не распределено: '+
      r.warnings.slice(0,8).map(escapeHtml).join('; ')+'</div>':'');
  };
  c.querySelectorAll('[data-frv]').forEach(el=>
    el.addEventListener(el.type==='checkbox'?'change':'input',e=>{
      const s=state.steps.find(x=>x.id===Number(el.dataset.id));if(!s)return;
      s.frv=s.frv||{};
      s.frv[el.dataset.frv]=el.type==='checkbox'?el.checked:e.target.value;
      // A manual FRV edit ends automatic project-time tracking. Later SOP
      // duration changes must not invent an updated measured M1/M2.
      if(['m1','m2','vdc'].includes(el.dataset.frv))s.frv.autoFullStep=false;
      stateChanged(false);renderIssues();
    }));
  renderIssues();
}
function pctEffect(cur,tgt){
  if(cur===null||cur===''||!Number.isFinite(Number(cur))||
     tgt===null||tgt===''||!Number.isFinite(Number(tgt))||Number(cur)===0)
    return {effect:'',pct:''};
  const diff=Number(cur)-Number(tgt);
  const pct=Math.round((Number(cur)-Number(tgt))/Number(cur)*100);
  return {effect:diff,pct:pct+'%'};
}
