// Stage38: corporate TWI/SOP Reasons Why remain ONE free-text field per step.
// Optional "1. ...\n2. ..." enumerates explanations within that field.
// Do not remodel the SOP document schema, TWI JI table or worksheet columns.
function stage38ReasonText(value,max=2000){
  if(typeof value!=='string')return '';
  const raw=value.replace(/\r\n?/g,'\n').trim();
  if(!raw||STAGE29_EMPTY_MARKERS.has(raw.toLocaleLowerCase('ru')))return '';
  // Whitespace within a line is cosmetic; newline and item numbers are not.
  // Preserve numbering and line boundaries in SOP state, print and TWI JI.
  return raw.split('\n').map(s=>s.replace(/[^\S\n]+/g,' ').trim())
    .join('\n').slice(0,max);
}
function stage38StripOrdinalLabels(value){
  // Only remove enumerators at LINE START followed by whitespace.
  // "1. 15 мм" -> "15 мм" still triggers the existing factual-number gate.
  // Decimals (1.5), dates, torque or section values must NOT be removed.
  return String(value||'').replace(/^\s*[1-9]\d?[.)][ \t]+/gm,'');
}
function stage38ReasonEnumeration(value){
  const normalized=String(value||'').replace(/\r\n?/g,'\n');
  const labels=[],empty=[],mixed=[];
  for(const [i,line] of normalized.split('\n').entries()){
    const m=line.match(/^\s*(\d{1,2})[.)](?:[ \t]+(.*)|\s*)$/u);
    if(m){
      labels.push(Number(m[1]));
      if(!String(m[2]||'').trim())empty.push(Number(m[1]));
    }else if(/^\s*\d{1,2}[.)]\s*$/u.test(line))empty.push(i+1);
    else if(line.trim()&&labels.length===0)mixed.push(line.trim());
  }
  return {labels,empty,mixed};
}
function stage38ReasonIssues(value,keyPointCount,stepId){
  const text=String(value||'');
  if(!text.trim())return [];
  const {labels,empty}=stage38ReasonEnumeration(text);
  if(!labels.length&&!empty.length)return []; // one free-form common reason is valid
  const result=[],seen=new Set(),duplicates=[];
  for(const n of labels){
    if(seen.has(n))duplicates.push(n);
    seen.add(n);
  }
  const sorted=[...seen].sort((a,b)=>a-b);
  const gaps=[];
  if(sorted.length){
    // Unnumbered reasons covering several Key Points are explicitly allowed.
    // Only inspect an author-supplied enumerated sequence.
    for(let n=1;n<=Math.min(sorted[sorted.length-1],20);n++)
      if(!seen.has(n))gaps.push(n);
  }
  function add(description,suggestion,severity='info'){
    result.push({stepId,field:'reason',severity,
      type:'incomplete',status:'open',fixValue:null,thread:[],
      description,suggestion});
  }
  if(duplicates.length){
    add('Повторяются номера причин: '+[...new Set(duplicates)].join(', '),
      'Проверьте порядок нумерованных причин. Текст не изменяется автоматически.','warning');
  }
  if(gaps.length){
    add('В нумерации причин пропущены пункты: '+gaps.join(', '),
      'Исправьте нумерацию вручную, если это отдельные причины.','warning');
  }
  if(empty.length){
    add('Есть номер причины без пояснения: '+[...new Set(empty)].join(', '),
      'Укажите причину или удалите пустой номер.','warning');
  }
  if(keyPointCount>0&&sorted.some(n=>n>keyPointCount)){
    add('Номер причины больше количества ключевых моментов ('+keyPointCount+')',
      'Проверьте соответствие нумерации. Одна общая причина без списка допустима.');
  }
  if(keyPointCount>sorted.length&&sorted.length>=2&&
     !gaps.length&&!duplicates.length){
    add('Указано '+sorted.length+' пронумерованных причин для '+keyPointCount+
      ' ключевых моментов',
      'Убедитесь, что оставшиеся моменты имеют обоснование; причины могут быть общими.');
  }
  return result;
}
// Corporate SOP: one physical merged "Причина" row per group of three steps.
// Grow only the HEIGHT of that existing row for author-entered newlines.
// Worksheet columns, merged ranges, images, print area and formulas do not move.
function stage38CorporateReasonHeight(steps,cpl=30){
  const maximum=Math.max(1,...steps.map(s=>textLines(s?.reason||'',cpl)));
  if(maximum>29)throw new Error('Поле «Причины» содержит слишком много строк ('+
    maximum+'). Для печати в корпоративном XLSX сократите пояснение или разделите шаг.');
  return clamp(maximum*13+8,26,395);
}
