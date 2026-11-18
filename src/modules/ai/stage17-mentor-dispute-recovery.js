// Stage 17: repair AI mentor disputes without changing proxy, models or prompts.
// JSON received from the model (or an incomplete JSON HTTP response) is not
// always valid. Retry a format failure once, never invent a "withdraw" verdict.
function mentorResponseFormatError(){
  const err=new Error('ИИ-наставник вернул некорректный формат ответа');
  err.code='MENTOR_RESPONSE_FORMAT';
  return err;
}
function mentorIsResponseFormatError(err){
  return err?.code==='MENTOR_RESPONSE_FORMAT'||err instanceof SyntaxError;
}
function mentorParseDisputeResponse(raw){
  const source=String(raw??'').trim();
  if(!source)throw mentorResponseFormatError();
  let parsed;
  try{
    parsed=JSON.parse(extractJson(source));
  }catch(e){
    // Some models return a complete prose answer instead of requested JSON.
    // Show it as a reply, but NEVER infer withdrawal or a new fix from prose.
    if(source.length>=40&&!/[{}[\]]/.test(source)&&/[А-Яа-яЁёA-Za-z]/.test(source)){
      return {reply:source.slice(0,1200),verdict:'keep',new_fix:null};
    }
    throw mentorResponseFormatError();
  }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||typeof parsed.reply!=='string')throw mentorResponseFormatError();
  const ans=validateDisputeResponse(parsed);
  if(!ans.reply||!/[А-Яа-яЁёA-Za-z]/.test(ans.reply))throw mentorResponseFormatError();
  return ans;
}
async function mentorRequestDisputeResponse(ctx){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const raw=await aiAsk(AI_SYS.dispute,ctx,{model:currentModel,maxTokens:600,task:'dispute'});
      return mentorParseDisputeResponse(raw);
    }catch(e){
      // Distinguish a malformed model/proxy JSON body from transport/auth errors.
      if(!mentorIsResponseFormatError(e)||attempt===1)throw e;
    }
  }
  throw mentorResponseFormatError();
}
async function sendDispute(idx){
  const iss=reviewIssues[idx];if(!iss||iss.pending)return;
  const ta=document.querySelector('[data-dispute-input="'+idx+'"]');
  const msg=(ta?.value||iss.pendingDraft||'').trim();
  if(!msg)return toast('Напишите аргумент','info');
  iss.thread=iss.thread||[];
  // Retrying the same argument after a system error must not duplicate it.
  const n=iss.thread.length;
  if(!(n>=2&&iss.thread[n-1].role==='system'&&iss.thread[n-2].role==='user'&&iss.thread[n-2].text===msg)){
    iss.thread.push({role:'user',text:msg});
  }
  iss.pendingDraft='';
  iss.pending=true;
  iss.disputeOpen=true;
  renderReviewResults(reviewSummary||{});
  try{
    const st=iss.stepId?state.steps[iss.stepId-1]:null;
    const ctx=JSON.stringify({
      operation:state.meta.operation,
      step:st?{action:st.action,keyMoments:st.keyMoments,reason:st.reason,time:formatDuration(st.durationSeconds)}:null,
      issue:{severity:iss.severity,type:iss.type,stepId:iss.stepId,field:iss.field,description:iss.description,why:iss.why,suggestion:iss.suggestion,fixValue:iss.fixValue},
      dialog:iss.thread.filter(m=>m.role==='user'||m.role==='mentor').slice(-6)
    });
    const ans=await mentorRequestDisputeResponse(ctx);
    iss.thread.push({role:'mentor',text:ans.reply});
    if(ans.verdict==='withdraw')iss.status='withdrawn';
    if(ans.new_fix)iss.fixValue=ans.new_fix;
  }catch(e){
    const badFormat=mentorIsResponseFormatError(e);
    if(badFormat)setAIStatus('error','AI: некорректный ответ');
    iss.thread.push({role:'system',text:badFormat
      ?'Ответ ИИ-наставника пришёл в некорректном формате. Ваш аргумент сохранён: повторите отправку. Замечание не изменено.'
      :diagnoseAIError(e)});
    iss.pendingDraft=msg;
  }finally{
    iss.pending=false;
    iss.disputeOpen=true;
    saveDraftDebounced();
    renderReviewResults(reviewSummary||{});
  }
}
