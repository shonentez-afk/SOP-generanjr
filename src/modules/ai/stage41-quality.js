// Stage41 — conservative AI quality improvement on top of accepted Stage40.
// Changes only the instruction text for explicit generation/review/TWI AI requests
// and coalesces truly identical AI fixes. No data/schema/Excel/UI action changes.
// Individual ✨ Reason, manual SOP, FRV RAW, photos, Yandex transport are untouched.

const STAGE41_TASK_GUIDES=Object.freeze({
  generate_sop:[
    'STAGE41 — краткая итоговая самопроверка качества СОП перед возвратом JSON:',
    'Для КАЖДОГО шага проверь связь Action → критические Key Points → Reason Why → критерий.',
    'Reason — технологический смысл именно подтверждённого Key Point, а не копия КМ',
    'или универсальное «для безопасности/качества». Если фактического WHY нет, оставь',
    'reason пустым и задай ОДИН конкретный вопрос инженеру в openQuestions.',
    'Одна общая причина допустима, когда объясняет все КМ; разные причины нумеруй',
    'в одном поле reason. Не создавай причину механически на каждый Key Point.',
    'Не добавляй факты, нормативы, числа, опасности, последствия или этапы без источника.',
    'Проверь, что последовательность полная, действия не дублируются и JSON прежней схемы.'
  ].join('\n'),
  review:[
    'STAGE41 — качество единой проверки СОП, без нового формата ответа:',
    'Сначала ищи только РЕАЛЬНЫЕ технологические противоречия и пробелы в фактах.',
    'Не предъявляй замечание ради количества или разных слов для одного дефекта.',
    'Не требуй нормативную ссылку для хорошего причинного Reason Why.',
    'Сверяй Action, Key Points, Reason и критерий на одном шаге; одно общее',
    'объяснение нескольких Key Points допустимо. Пустой/слабый WHY не заменяй',
    'догадкой о травме, перегреве, отказе или другом последствии.',
    'Для готового fixValue требуй дословную цитату поля из переданного СОП;',
    'если цитаты или технологического факта нет — вопрос к инженеру, fixValue=null.',
    'Не повторяй замечание с тем же полем, фактом и одинаковым исправлением.',
    'Сохрани исходный JSON review, без дополнительных ключей, пояснений и норм.'
  ].join('\n'),
  twi_generate:[
    'STAGE41 — проверка точности TWI перед возвратом прежнего JSON:',
    'В PRESENT сохрани порядок всех Important Steps существующего СОП.',
    'В round2 используй только фактически записанные Key Points, в round3',
    'только фактически записанные Reasons Why соответствующих шагов.',
    'Если WHY не указан, не выдумывай его: не добавляй новые последствия.',
    'Не дополняй технологию новыми числами, нормами, СИЗ, инструментами или режимами.',
    'Сохрани четыре этапа и прежнюю схему TWI без новых полей.'
  ].join('\n')
});

function stage41PromptForTask(prompt,task){
  if(typeof prompt!=='string')return prompt;
  if(!Object.prototype.hasOwnProperty.call(STAGE41_TASK_GUIDES,task))return prompt;
  // Stage39.1 fixed hallucinations seeded by the generic normative catalog
  // in Reason and SOP generation. Review still inherited this same catalog.
  // Remove it ONLY from the review system prompt, never from user facts/data.
  let revised=prompt;
  if(task==='review'&&typeof NORM_BASE==='string'&&NORM_BASE.trim())
    revised=revised.replace(NORM_BASE,'');
  return revised+'\n'+STAGE41_TASK_GUIDES[task];
}

// Keep the original transport and exactly the same options and DATA context.
// A task not explicitly allowed above (notably edit_reason/edit_km) is untouched.
let stage41UnderlyingAIRequest=aiAsk;
aiAsk=async function stage41QualityAIRequest(prompt,context,options){
  const task=options&&typeof options.task==='string'?options.task:'';
  return stage41UnderlyingAIRequest(stage41PromptForTask(prompt,task),context,options);
};

function stage41ComparableText(value){
  return String(value??'').trim().toLocaleLowerCase('ru').replace(/\s+/gu,' ');
}
function stage41UniqueActionableAIReview(items){
  if(!Array.isArray(items))return items;
  const seen=new Set();
  return items.filter(issue=>{
    // Never collapse deterministic issues, questions without a ready fix,
    // different changes, unverified sources or different TWI fields.
    if(issue?.reviewOrigin!=='ai'||!issue.evidenceVerified)return true;
    const fix=reviewNormalizeFixValue(issue.fixValue);
    if(!fix)return true;
    const evidence=stage41ComparableText(issue.evidence);
    if(evidence.length<8)return true;
    const key=JSON.stringify([
      Number(issue.stepId)||0,
      stage41ComparableText(issue.field),
      stage41ComparableText(issue.type),
      evidence,
      stage41ComparableText(fix)
    ]);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

// The already-grounded AI review is the ONLY source we deduplicate. Previous
// model evidence verification, UX buttons and safe apply guards stay intact.
const stage41PreviousGroundAIReview=stage28GroundAIReview;
stage28GroundAIReview=function stage41GroundedReview(validated,raw,steps,meta){
  return stage41UniqueActionableAIReview(
    stage41PreviousGroundAIReview(validated,raw,steps,meta));
};

// Identity marker only. No new toolbar, modal, setting or confirmation.
const stage41PreviousRenderSteps=renderSteps;
renderSteps=function stage41RenderSteps(){
  stage41PreviousRenderSteps();
  const label=$('sopVersionLabel');
  if(label){
    label.textContent='· Stage41 (проверка)';
    label.title='Контекстные промпты качества и устранение точных дублей замечаний; Stage40 сохранена';
  }
};
