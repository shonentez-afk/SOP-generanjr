// Stage 18: keep internal mentor verdict/new_fix outside the user-visible reply.
// The model can return numbered prose rather than JSON:
// "1. ... 4. Вердикт: keep 5. Новый текст исправления: null".
// Those technical fields are NOT part of the human answer.
function mentorCleanDisputeReply(value){
  return String(value??'').trim()
    .replace(
      /(?:^|\s)(?:\d{1,2}[.)]\s*|[-–—*•]\s*)?(?:(?:вердикт|verdict)\s*[:：=]\s*(?:keep|withdraw)|(?:новый\s+текст\s+исправления|new[\s_-]*fix)\s*[:：=]\s*(?:null|none))(?=$|[\s.,;!?])(?:[.,;])?/giu,
      ' '
    )
    .replace(/\s+/g,' ').trim();
}
function mentorParseDisputeResponse(raw){
  const source=String(raw??'').trim();
  if(!source)throw mentorResponseFormatError();
  let parsed;
  try{
    parsed=JSON.parse(extractJson(source));
  }catch(e){
    // A prose reply is informative, but not sufficient to change a verdict.
    if(source.length>=40&&!/[{}[\]]/.test(source)&&/[А-Яа-яЁёA-Za-z]/.test(source)){
      const reply=mentorCleanDisputeReply(source).slice(0,1200);
      if(!reply||!/[А-Яа-яЁёA-Za-z]/.test(reply))throw mentorResponseFormatError();
      return {reply,verdict:'keep',new_fix:null};
    }
    throw mentorResponseFormatError();
  }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||typeof parsed.reply!=='string')throw mentorResponseFormatError();
  const ans=validateDisputeResponse(parsed);
  ans.reply=mentorCleanDisputeReply(ans.reply);
  if(!ans.reply||!/[А-Яа-яЁёA-Za-z]/.test(ans.reply))throw mentorResponseFormatError();
  return ans;
}
