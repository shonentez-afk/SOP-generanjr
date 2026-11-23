// Stage39.1: one conservative AI proposal gate for Stage38 Reasons and Key Points.
// Never rewrite the corporate SOP schema or silently repair an AI answer.
// This module intentionally does not run for ordinary manual text edits.
function stage391FactCorpus(step){
  const m=state.meta||{};
  return [
    state.description||'',m.operation||'',m.safety||'',m.tools||'',
    m.material||'',m.workplace||'',
    step?.action||'',...(step?.keyMoments||[]),step?.reason||'',
    step?.successCriteria||'',...(step?.decisionPoints||[]),
    ...(step?.commonPitfalls||[])
  ].map(String).join('\n');
}
function stage391ReasonLabels(value){
  const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');
  const labels=[],invalid=[];
  for(const [index,line] of lines.entries()){
    const match=line.match(/^\s*(\d{1,2})[.)][ \t]+(\S.*)$/u);
    if(match)labels.push(Number(match[1]));
    else if(line.trim())invalid.push(index+1);
  }
  return {labels,invalid,lines};
}
function stage391ReasonShape(value){
  const e=stage391ReasonLabels(value);
  if(e.labels.length){
    if(e.invalid.length)return {ok:false,message:'В списке причин каждая непустая строка должна иметь свой номер.'};
    if(e.labels.some((n,i)=>n!==i+1))
      return {ok:false,message:'В списке причин есть пропуск или повтор номера.'};
  }else if(/^\s*\d+[.)]\s*/m.test(String(value||''))){
    return {ok:false,message:'Некорректный номер или пустая нумерованная причина.'};
  }
  return {ok:true};
}
function stage391FrvFacts(row,study){
  return [study?.processDescription,study?.operationId,study?.workplace,
    row?.actionRaw,row?.actionNormalized,row?.keyMoment,row?.reason,
    row?.qualityKey,row?.safetyKey,row?.tool,row?.material,row?.comment,
    row?.durationSec].map(x=>String(x??'')).join('\n');
}
function stage391ValidateReasonProposal(previous,candidate,step,sourceOverride){
  if(typeof candidate!=='string'||!candidate.trim())
    return {ok:false,message:'ИИ вернул пустую причину — прежний текст сохранён.'};
  if(candidate.length>2000)
    return {ok:false,message:'Предложенная причина слишком длинная для поля СОП.'};
  const value=stage38ReasonText(candidate,2000);
  if(!value||/^(?:null|undefined|none|keep|n\/a)$/iu.test(value))
    return {ok:false,message:'ИИ вернул служебное значение вместо причины.'};
  const old=stage391ReasonLabels(previous);
  const incoming=stage391ReasonLabels(value);
  if(incoming.labels.length){
    if(incoming.invalid.length)
      return {ok:false,message:'В нумерованной причине каждая строка должна начинаться с 1., 2. и т. д.'};
    if(incoming.labels.some((n,i)=>n!==i+1))
      return {ok:false,message:'ИИ нарушил порядок или полноту нумерации причин. Исходное поле сохранено.'};
  }else if(/^\s*\d+[.)]\s*/m.test(value)){
    return {ok:false,message:'ИИ оставил некорректный или пустой номер причины.'};
  }
  if(old.labels.length&&!old.invalid.length&&
     JSON.stringify(incoming.labels)!==JSON.stringify(old.labels)){
    return {ok:false,message:'ИИ изменил число или номера уже записанных причин. Исправьте вручную после проверки.'};
  }
  const unconfirmed=stage29HasUnconfirmedNumber(
    stage38StripOrdinalLabels(value),sourceOverride??stage391FactCorpus(step),0);
  if(unconfirmed.length)
    return {ok:false,message:'ИИ предложил неподтверждённые числовые параметры: '+unconfirmed.join(', ')+'.'};
  return {ok:true,value};
}
function stage391ValidateKeyPointProposal(candidate,step){
  const raw=String(candidate??'').trim();
  if(!raw||/^(?:null|undefined|none|keep|n\/a)$/iu.test(raw))
    return {ok:false,message:'ИИ не вернул корректный ключевой момент.'};
  if(raw.length>900||/[\r\n]/.test(raw))
    return {ok:false,message:'ИИ должен вернуть только один ключевой момент без списка.'};
  const unconfirmed=stage29HasUnconfirmedNumber(raw,stage391FactCorpus(step),0);
  if(unconfirmed.length)
    return {ok:false,message:'Новый ключевой момент содержит неподтверждённые числа: '+unconfirmed.join(', ')+'.'};
  return {ok:true,value:raw};
}
function stage391RejectInvalidReason(previous,proposed,step){
  const checked=stage391ValidateReasonProposal(previous,proposed,step);
  if(!checked.ok)toast(checked.message,'warning');
  return checked;
}
