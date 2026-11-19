// Stage24 A3: a typed JSON boundary for structured AI tasks.
// Prompts, model selection, transport and retry behavior are unchanged.
function aiTaskSchemaError(task, kind, detail){
  const label=task==='twi_generate'?'TWI':task==='generate_sop'?'СОП':
    task==='review'?'проверки СОП':String(task||'ИИ');
  const err=new Error(kind==='incomplete'
    ?'ИИ вернул неполный результат '+label+'. Действующие данные сохранены.'
    :'ИИ вернул некорректный JSON для '+label+'. Действующие данные сохранены.');
  err.code=kind==='incomplete'?'AI_TASK_INCOMPLETE':'AI_TASK_JSON_FORMAT';
  err.task=task;
  err.detail=String(detail||'').slice(0,300);
  return err;
}
function aiReadTaskObject(raw,task){
  if(typeof raw!=='string'||!raw.trim())throw aiTaskSchemaError(task,'format','empty response');
  let result;
  try{result=JSON.parse(extractJson(raw));}
  catch(err){throw aiTaskSchemaError(task,'format',err?.message);}
  if(!result||typeof result!=='object'||Array.isArray(result)){
    throw aiTaskSchemaError(task,'format','expected JSON object');
  }
  return result;
}
function aiTwiString(raw){
  if(typeof raw!=='string')return '';
  const value=raw.trim();
  if(!value)return '';
  if(typeof reviewNormalizeFixValue==='function'&&!reviewNormalizeFixValue(value))return '';
  return value.slice(0,4000);
}
function aiReadTwiPlan(raw){
  const x=aiReadTaskObject(raw,'twi_generate');
  const get=(section,key,alias)=>{
    const src=x[section];
    if(!src||typeof src!=='object'||Array.isArray(src))return '';
    const direct=aiTwiString(src[key]);
    return direct||(alias?aiTwiString(src[alias]):'');
  };
  const plan={
    prepare:{
      purpose:get('prepare','purpose'),known:get('prepare','known'),
      prep:get('prepare','prep'),interest:get('prepare','interest')
    },
    present:{
      round1:get('present','round1'),round2:get('present','round2'),
      round3:get('present','round3')
    },
    tryOut:{
      perform:get('tryOut','perform'),explain:get('tryOut','explain'),
      check:get('tryOut','check'),correct:get('tryOut','correct')
    },
    followUp:{
      help:get('followUp','help'),control:get('followUp','control','frequency'),
      observe:get('followUp','observe'),close:get('followUp','close')
    }
  };
  // All four JI stages must be represented; an empty/partial response is
  // never allowed to replace an existing training plan.
  for(const [section,label] of [
    ['prepare','Подготовка'],['present','Представление'],
    ['tryOut','Пробное выполнение'],['followUp','Сопровождение']
  ]){
    if(!Object.values(plan[section]).some(v=>v.trim())){
      throw aiTaskSchemaError('twi_generate','incomplete','empty '+label);
    }
  }
  return plan;
}
