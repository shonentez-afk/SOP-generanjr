// Stage39.1: exact Key Point echoes are removed from AI proposals only.
// No manual button, popup, or change to existing user-authored SOP text.
function stage391CleanupNormalize(value){
  return String(value||'').toLocaleLowerCase('ru').replace(/\s+/gu,' ')
    .replace(/[.!?;:]+$/gu,'').trim();
}
function stage391CleanupReason(reason,step){
  const original=String(reason??'');
  const sources=[...(Array.isArray(step?.keyMoments)?step.keyMoments:[]),step?.action]
    .filter(v=>typeof v==='string'&&v.trim())
    .map(stage391CleanupNormalize).filter(Boolean);
  const result=[];
  let changed=0;
  let skipped=0;
  for(const line of original.replace(/\r\n?/gu,'\n').split('\n')){
    const parts=line.match(/^(\s*(?:\d{1,2}[.)][ \t]+)?)(.*)$/u);
    if(!parts||!parts[2].trim()){result.push(line);continue;}
    const label=parts[1],body=parts[2].trim();
    let next=null;
    // A candidate prefix must equal a whole, existing Key Point (or Action).
    // Do NOT use fuzzy/partial matching or cut at an arbitrary sentence stop.
    const splits=/\s*[—–]\s*|\s+-\s+|:\s+|[.!?;]\s+/gu;
    for(const delimiter of body.matchAll(splits)){
      const prefix=body.slice(0,delimiter.index).trim();
      if(!sources.includes(stage391CleanupNormalize(prefix)))continue;
      const why=body.slice(delimiter.index+delimiter[0].length).trim();
      if(!why||stage391CleanupNormalize(why).length<8)break;
      let shorter=why
        .replace(/^Это\s+(?:важно|необходимо|нужно|требуется)\s+для\s+/iu,'Для ')
        .replace(/^Это\s+(?:важно|нужно|необходимо)\s*,?\s*чтобы\s+/iu,'Чтобы ');
      if(/^(?:Это\s+(?:важно|необходимо|нужно|требуется)|Для\s+безопасности)\s*[.!?]?$/iu.test(shorter.trim()))break;
      if(!shorter.trim()||shorter===body)break;
      shorter=shorter.charAt(0).toLocaleUpperCase('ru')+shorter.slice(1);
      next=label+shorter;
      break;
    }
    if(next!==null&&next!==line){
      result.push(next);changed++;
    }else{
      result.push(line);
      skipped++;
    }
  }
  return {before:original,after:result.join('\n'),changed,skipped};
}
