// Stage40: inline, non-modal comparison inside the EXISTING full-SOP review.
// This is an overlay: accepted Stage39.1 prompts, Reason star, XLSX and FRV
// source modules remain unchanged.
const stage40IssueSnapshots=new WeakMap();

function stage40RawValue(fix){
  if(fix.scope==='meta')return state.meta?.[fix.field]??'';
  const step=state.steps?.[fix.index];
  if(!step)return undefined;
  if(fix.field==='time')return step.durationSeconds??null;
  if(fix.field==='keyMoments')return Array.isArray(step.keyMoments)?step.keyMoments.slice():[];
  return step[fix.field]??'';
}
function stage40NormalizedValue(field,value){
  if(field==='keyMoments')return Array.isArray(value)?value.map(x=>String(x??'')):[];
  if(field==='time')return value==null?null:Number(value);
  return String(value??'');
}
function stage40ValueKey(field,value){
  return JSON.stringify(stage40NormalizedValue(field,value));
}
function stage40SourceFromReview(fix){
  let base=stage40RawValue(fix);
  const meta=stage28ReviewMeta;
  if(!meta?.aiComplete)return base;
  try{
    if(fix.scope==='step'){
      const entry=meta.stepSignatures?.[fix.index];
      const step=state.steps?.[fix.index];
      if(!entry||!step||entry.id!==step.id)return base;
      const record=JSON.parse(entry.content);
      const key=fix.field==='time'?'durationSeconds':fix.field;
      if(Object.prototype.hasOwnProperty.call(record,key))base=record[key];
    }else{
      const record=JSON.parse(meta.contextSignature);
      if(Object.prototype.hasOwnProperty.call(record,fix.field))base=record[fix.field];
    }
  }catch(_){/* A damaged saved snapshot never grants permission to overwrite. */}
  return base;
}
function stage40Snapshot(issue,fix){
  if(!issue||!fix)return null;
  const checkedAt=stage28ReviewMeta?.checkedAt||0;
  const existing=stage40IssueSnapshots.get(issue);
  if(existing&&existing.checkedAt===checkedAt)return existing;
  const step=fix.scope==='step'?state.steps?.[fix.index]:null;
  const raw=stage40SourceFromReview(fix);
  const snapshot={
    checkedAt,
    documentId:state.documentManager?.currentId??null,
    contextSignature:stage28ReviewMeta?.aiComplete?
      stage28ReviewMeta.contextSignature:stage28DocumentSignature(state),
    scope:fix.scope,field:fix.field,index:fix.index,
    stepId:step?.id??null,raw,key:stage40ValueKey(fix.field,raw)
  };
  stage40IssueSnapshots.set(issue,snapshot);
  return snapshot;
}
function stage40SnapshotFresh(snapshot,fix){
  if(!snapshot||!fix)return false;
  if(['Опубликован','Архив'].includes(state.documentManager?.status))return false;
  if(snapshot.documentId!==(state.documentManager?.currentId??null))return false;
  if(snapshot.contextSignature!==stage28DocumentSignature(state))return false;
  if(snapshot.field!==fix.field||snapshot.scope!==fix.scope||
     snapshot.index!==fix.index)return false;
  if(fix.scope==='step'&&state.steps?.[fix.index]?.id!==snapshot.stepId)return false;
  if(fix.scope==='meta'){
    const control=$('meta-'+fix.field);
    if(control&&control.value!==String(state.meta?.[fix.field]??''))return false;
  }
  return stage40ValueKey(fix.field,stage40RawValue(fix))===snapshot.key;
}
function stage40DisplayValue(field,value){
  if(field==='keyMoments')
    return Array.isArray(value)&&value.length?
      value.map((s,i)=>(i+1)+'. '+String(s??'')).join('\n'):'—';
  if(field==='time')return value==null?'—':String(value)+' сек';
  const text=String(value??'').trim();
  return text||'—';
}
function stage40ProposedValue(snapshot,fix){
  if(fix.field!=='keyMoments')return fix.value;
  const before=Array.isArray(snapshot.raw)?snapshot.raw.slice():[];
  before.push(fix.value);
  return before;
}
function stage40ComparisonCard(snapshot,fix,idx){
  const host=document.createElement('div');
  host.setAttribute('data-stage40-compare',String(idx));
  host.style.cssText='background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;margin:6px 0 8px;font-size:12px;color:#334155;min-width:0;';
  const heading=document.createElement('div');
  heading.textContent='Изменение: '+(STAGE28_FIELDS[fix.field]||fix.field);
  heading.style.cssText='font-weight:700;margin-bottom:8px;';
  host.appendChild(heading);
  const cols=document.createElement('div');
  cols.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:8px;';
  const panel=(label,value,background)=>{
    const box=document.createElement('div');
    box.style.cssText='min-width:0;border:1px solid #e2e8f0;border-radius:6px;padding:8px;background:'+background+';';
    const title=document.createElement('div');
    title.textContent=label;
    title.style.cssText='font-weight:700;margin-bottom:5px;';
    const content=document.createElement('div');
    content.textContent=value;
    content.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:144px;overflow:auto;line-height:1.45;';
    box.append(title,content);
    return box;
  };
  cols.append(
    panel('Сейчас',stage40DisplayValue(fix.field,snapshot.raw),'#fff'),
    panel('После применения',stage40DisplayValue(fix.field,stage40ProposedValue(snapshot,fix)),'#f0fdf4')
  );
  host.appendChild(cols);
  return host;
}
function stage40MarkVersion(){
  const label=$('sopVersionLabel');
  if(label){
    label.textContent='· Stage40 (проверка)';
    label.title='Встроенное сравнение проверенных ИИ-исправлений; Stage39.1 сохранена';
  }
}
const stage40PreviousRenderSteps=renderSteps;
renderSteps=function stage40RenderSteps(){
  stage40PreviousRenderSteps();
  stage40MarkVersion();
};
const stage40PreviousRenderReview=renderReviewResults;
renderReviewResults=function stage40RenderReview(review){
  const result=stage40PreviousRenderReview(review);
  const target=$('sopReviewIssues');
  if(!target)return result;
  target.querySelectorAll('button[data-apply]').forEach(button=>{
    const idx=Number(button.dataset.apply);
    const issue=reviewIssues?.[idx];
    const fix=reviewGetApplicableFix(issue);
    if(!fix)return;
    const snapshot=stage40Snapshot(issue,fix);
    const card=button.closest('.review-issue');
    if(!card||!snapshot)return;
    const preview=stage40ComparisonCard(snapshot,fix,idx);
    const old=card.querySelector('div.text-xs.bg-emerald-50');
    if(old)old.replaceWith(preview);
    else button.parentElement?.insertAdjacentElement('beforebegin',preview);
    if(!stage40SnapshotFresh(snapshot,fix)){
      button.disabled=true;
      button.title='СОП изменился. Повторите проверку перед применением.';
      const warning=document.createElement('p');
      warning.textContent='Поле изменено после проверки. Сначала повторите проверку СОП.';
      warning.style.cssText='color:#9a3412;font-weight:600;margin-top:7px;';
      preview.appendChild(warning);
    }
  });
  return result;
};
const stage40PreviousApplyIssueFix=applyIssueFix;
applyIssueFix=function stage40ApplyReviewFix(idx){
  const issue=reviewIssues?.[idx];
  const fix=reviewGetApplicableFix(issue);
  if(fix){
    const snapshot=stage40Snapshot(issue,fix);
    if(!stage40SnapshotFresh(snapshot,fix)){
      toast('СОП изменился после проверки. Исправление не применено; повторите проверку.','warning');
      renderReviewResults(reviewSummary||{});
      return;
    }
  }
  return stage40PreviousApplyIssueFix(idx);
};
