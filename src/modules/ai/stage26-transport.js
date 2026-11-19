// Stage26 A3 transport: same Yandex Cloud Function, models, tasks and request body.
// Transport owns response parsing/timeout; task-specific validation stays separate.
function setAIStatus(kind,text){
  const b=$('aiConnectivityBadge');if(!b)return;
  const styles={ready:'bg-green-100 text-green-700',busy:'bg-amber-100 text-amber-700',
    error:'bg-red-100 text-red-700',idle:'bg-slate-200 text-slate-600'};
  b.className='px-2.5 py-1 rounded-full '+(styles[kind]||styles.idle);
  b.textContent=text;
}
function diagnoseAIError(e){return aiUserFacingError(e);}
const ALLOWED_MODELS=new Set(YANDEX_MODELS.map(x=>x.id));
const AI_PROXY_MAX_RESPONSE_CHARS=2000000;
function aiTransportError(code,message,status){
  const e=new Error(message);
  e.code=code;
  if(Number.isInteger(status))e.status=status;
  return e;
}
function aiModelUnavailable(status,body){
  // Never switch models on network, quota, auth, timeouts or generic server errors.
  if(![400,404,422].includes(status))return false;
  const content=String(body||'').slice(0,3000);
  return /(?:model|модел)/i.test(content) &&
    /(?:not.found|unknown|unavailable|unsupported|not.supported|invalid.model|не\s+найден|недоступ|не\s+поддерж|неизвест)/i.test(content);
}
async function aiReadProxyBody(response){
  const length=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(length)&&length>AI_PROXY_MAX_RESPONSE_CHARS)
    throw aiTransportError('AI_RESPONSE_TOO_LARGE','Ответ AI proxy превышает лимит размера');
  // Keep the signal active until the body has actually been consumed.
  const data=await response.text();
  if(data.length>AI_PROXY_MAX_RESPONSE_CHARS)
    throw aiTransportError('AI_RESPONSE_TOO_LARGE','Ответ AI proxy превышает лимит размера');
  return data;
}
async function aiAsk(systemPrompt,userText,
  {model=currentModel,temperature=.3,maxTokens=1200,task='chat'}={}){
  const wanted=ALLOWED_MODELS.has(model)?model:AI_DEFAULT_MODEL;
  const doRequest=async(modelToUse)=>{
    const body={
      model:modelToUse,
      messages:[{role:'system',content:String(systemPrompt)},
        {role:'user',content:String(userText)}],
      temperature,max_tokens:maxTokens,task
    };
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
    try{
      const response=await fetch(AI_PROXY_BASE,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(body),signal:controller.signal
      });
      const text=await aiReadProxyBody(response);
      return {response,text};
    }finally{
      clearTimeout(timer);
    }
  };
  setAIStatus('busy','AI: запрос…');
  try{
    let output=await doRequest(wanted);
    // Explicitly identified model errors only, not proxy outages or quotas.
    if(!output.response.ok && wanted!==AI_DEFAULT_MODEL &&
       aiModelUnavailable(output.response.status,output.text)){
      toast('Модель '+wanted+' недоступна — использую '+AI_DEFAULT_MODEL,'info');
      output=await doRequest(AI_DEFAULT_MODEL);
    }
    if(!output.response.ok)
      throw aiTransportError('AI_HTTP_ERROR',
        String(output.response.status)+' '+output.text.slice(0,450),
        output.response.status);
    let data;
    try{data=JSON.parse(output.text);}
    catch(e){
      throw aiTransportError('AI_PROXY_INVALID_JSON',
        'Некорректный JSON-ответ AI proxy');
    }
    const ch=data?.choices?.[0]?.message?.content;
    const alt=data?.result?.alternatives?.[0]?.message?.text;
    const result=typeof ch==='string'&&ch.trim()?ch.trim():
      (typeof alt==='string'&&alt.trim()?alt.trim():'');
    if(!result)
      throw aiTransportError('AI_EMPTY_RESPONSE','Пустой ответ от YandexGPT');
    setAIStatus('ready','AI: доступен');
    return result;
  }catch(error){
    setAIStatus('error','AI: ошибка');
    throw error;
  }
}
async function testAIConnection(){
  const btn=$('aiTestBtn');
  if(btn){btn.disabled=true;btn.textContent='Проверка…';}
  try{
    const answer=await aiAsk('Ответь только словом OK.','Проверка соединения.',
      {model:currentModel,temperature:0,maxTokens:10,task:'healthcheck'});
    toast(answer?'AI proxy отвечает':'AI proxy отвечает','success');
  }catch(e){toast(diagnoseAIError(e),'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='Проверить AI';}}
}
