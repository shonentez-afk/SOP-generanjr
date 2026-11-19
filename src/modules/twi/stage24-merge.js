// Stage24 A4: explicit provenance for SOP-derived TWI fields.
// The first generation requires no manual TWI form. Manual edits remain owned by the user.
const TWI_GENERATED_FIELDS=[
  {section:'prepare',field:'purpose',label:'Цель обучения',group:'Подготовка'},
  {section:'prepare',field:'known',label:'Опыт обучаемого',group:'Подготовка'},
  {section:'prepare',field:'prep',label:'Подготовка рабочего места',group:'Подготовка'},
  {section:'prepare',field:'interest',label:'Мотивация обучаемого',group:'Подготовка'},
  {section:'present',field:'round1',label:'Первый показ',group:'Представление'},
  {section:'present',field:'round2',label:'Ключевые моменты',group:'Представление'},
  {section:'present',field:'round3',label:'Причины и пояснения',group:'Представление'},
  {section:'tryOut',field:'perform',label:'Пробное выполнение',group:'Практика'},
  {section:'tryOut',field:'explain',label:'Объяснение работником',group:'Практика'},
  {section:'tryOut',field:'check',label:'Проверка выполнения',group:'Практика'},
  {section:'tryOut',field:'correct',label:'Коррекция ошибок',group:'Практика'},
  {section:'followUp',field:'help',label:'Куда обращаться за помощью',group:'Сопровождение'},
  {section:'followUp',field:'control',label:'Частота контроля',group:'Сопровождение'},
  {section:'followUp',field:'observe',label:'Наблюдение',group:'Сопровождение'},
  {section:'followUp',field:'close',label:'Завершение обучения',group:'Сопровождение'}
];
function twiFieldId(entry){return entry.section+'.'+entry.field;}
function twiGetText(plan,entry){return String(plan?.[entry.section]?.[entry.field]??'');}
function twiSopInput(){
  const meta=state.meta||{};
  return {
    operation:meta.operation,executor:meta.executor,
    workplace:meta.workplace,safety:meta.safety,
    steps:(state.steps||[]).map((s,i)=>({
      stepNumber:i+1,action:s.action,
      keyPoints:Array.isArray(s.keyMoments)?s.keyMoments.filter(Boolean):[],
      reason:s.reason,successCriteria:s.successCriteria,
      decisionPoints:s.decisionPoints
    }))
  };
}
function twiSourceSignature(){
  // Two independent 32-bit checksums over exact SOP input fields, without photos.
  // This is only an informative "review required" marker, not a security proof.
  const raw=JSON.stringify(twiSopInput());
  let a=2166136261,b=0;
  for(let i=0;i<raw.length;i++){
    const n=raw.charCodeAt(i);
    a=Math.imul(a^n,16777619)>>>0;
    b=(b+n)>>>0;b=(b+((b<<10)>>>0))>>>0;b^=b>>>6;
  }
  b=(b+((b<<3)>>>0))>>>0;b^=b>>>11;b=(b+((b<<15)>>>0))>>>0;
  return 'sop1:'+raw.length+':'+a.toString(16)+':'+(b>>>0).toString(16);
}
function twiHasGeneratedContent(plan){
  return TWI_GENERATED_FIELDS.some(e=>twiGetText(plan,e).trim()!=='');
}
function twiHasAnyContent(plan){
  return twiHasGeneratedContent(plan)||
    !!String(plan?.trainer??'').trim()||!!String(plan?.trainee??'').trim();
}
function twiManualCount(plan){
  if(!plan?.generatedBaseline)return 0;
  return TWI_GENERATED_FIELDS.filter(e=>
    twiGetText(plan,e)!==twiGetText(plan.generatedBaseline,e)).length;
}
function twiProposalDiff(current,proposed){
  const baseline=current?.generatedBaseline||null;
  return TWI_GENERATED_FIELDS.map(entry=>{
    const value=twiGetText(current,entry),newValue=twiGetText(proposed,entry);
    const initial=baseline?twiGetText(baseline,entry):'';
    const manuallyEdited=baseline?value!==initial:!!value.trim();
    const clearsExisting=!!value.trim()&&!newValue.trim();
    return {
      id:twiFieldId(entry),label:entry.label,group:entry.group,
      entry,current:value,proposed:newValue,
      manual:manuallyEdited,clearing:clearsExisting,
      changed:value!==newValue,
      checked:value!==newValue&&!manuallyEdited&&!clearsExisting
    };
  }).filter(item=>item.changed);
}
function twiCommitProposal(current,proposed,chosen){
  const existing=current||{};
  const result={
    ...existing,enabled:true,
    trainer:String(existing.trainer??''),trainee:String(existing.trainee??''),
    generatedBaseline:{},
    sourceSignature:twiSourceSignature()
  };
  for(const section of ['prepare','present','tryOut','followUp']){
    result[section]={...(existing[section]||{})};
    result.generatedBaseline[section]={};
  }
  for(const entry of TWI_GENERATED_FIELDS){
    const id=twiFieldId(entry);
    const proposedValue=twiGetText(proposed,entry);
    if(chosen.has(id))result[entry.section][entry.field]=proposedValue;
    else result[entry.section][entry.field]=twiGetText(existing,entry);
    result.generatedBaseline[entry.section][entry.field]=proposedValue;
  }
  return result;
}
