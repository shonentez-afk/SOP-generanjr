function setAIStatus(kind,text){
  const b=$('aiConnectivityBadge'); if(!b)return;
  const styles={ready:'bg-green-100 text-green-700',busy:'bg-amber-100 text-amber-700',error:'bg-red-100 text-red-700',idle:'bg-slate-200 text-slate-600'};
  b.className=`px-2.5 py-1 rounded-full ${styles[kind]||styles.idle}`;
  b.textContent=text;
}
function diagnoseAIError(e){
  const m=String(e?.message||e);
  if(/AbortError|timeout/i.test(m)) return 'Сервис ИИ не ответил вовремя. Проверьте интернет и попробуйте ещё раз.';
  if(/Failed to fetch|NetworkError|TypeError/i.test(m)) return 'Сервис ИИ недоступен. Проверьте интернет и доступ к Yandex Cloud Function.';
  if(/401|403/.test(m)) return 'Прокси отклонил запрос (401/403).';
  if(/404/.test(m)) return 'AI proxy не найден (404). Проверьте адрес Cloud Function.';
  if(/429/.test(m)) return 'Прокси сообщил о превышении лимита (429).';
  if(/5\d\d/.test(m)) return 'Yandex Cloud Function временно недоступна.';
  return 'Ошибка ИИ: '+m;
}
function makeTimeoutSignal(ms){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  return {signal:controller.signal,clear:()=>clearTimeout(timer)};
}
const ALLOWED_MODELS=new Set(YANDEX_MODELS.map(x=>x.id));
async function aiAsk(systemPrompt,userText,{model=currentModel,temperature=.3,maxTokens=1200,task='chat'}={}){
  const wanted=ALLOWED_MODELS.has(model)?model:AI_DEFAULT_MODEL;
  const doRequest=async(modelToUse)=>{
    const body={model:modelToUse,messages:[{role:'system',content:String(systemPrompt)},{role:'user',content:String(userText)}],temperature,max_tokens:maxTokens,task};
    const {signal,clear}=makeTimeoutSignal(AI_TIMEOUT_MS);
    try{
      return await fetch(AI_PROXY_BASE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body),signal});
    }finally{clear();}
  };
  setAIStatus('busy','AI: запрос…');
  let r=await doRequest(wanted);
  if(!r.ok&&wanted!==AI_DEFAULT_MODEL){
    toast(`Модель ${wanted} недоступна — использую ${AI_DEFAULT_MODEL}`,'info');
    r=await doRequest(AI_DEFAULT_MODEL);
  }
  if(!r.ok){
    setAIStatus('error','AI: ошибка');
    throw new Error(`${r.status} ${await r.text().catch(()=> '')}`);
  }
  const data=await r.json();
  const ch=data?.choices?.[0]?.message?.content;
  const alt=data?.result?.alternatives?.[0]?.message?.text;
  const text=typeof ch==='string'&&ch.trim()?ch.trim():(typeof alt==='string'&&alt.trim()?alt.trim():'');
  if(!text){setAIStatus('error','AI: пустой ответ');throw new Error('Пустой ответ от YandexGPT');}
  setAIStatus('ready','AI: доступен');
  return text;
}
async function testAIConnection(){
  const btn=$('aiTestBtn');
  if(btn){btn.disabled=true;btn.textContent='Проверка…';}
  try{
    const answer=await aiAsk('Ответь только словом OK.','Проверка соединения.',{model:currentModel,temperature:0,maxTokens:10,task:'healthcheck'});
    toast(answer?'AI proxy отвечает':'AI proxy отвечает','success');
  }catch(e){toast(diagnoseAIError(e),'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='Проверить AI';}}
}
