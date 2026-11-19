// Stage25 A3: classify failures without changing HTTP, model fallback or retry semantics.
function aiErrorClassify(err){
  const message=String(err?.message??err??'').slice(0,2000);
  const code=String(err?.code??'');
  const name=String(err?.name??'');
  if(code==='AI_TASK_JSON_FORMAT')return {kind:'invalid_json',retryable:true,
    message:'ИИ вернул некорректный JSON. Данные не изменены. Проверьте запрос и повторите действие.'};
  if(code==='AI_TASK_INCOMPLETE')return {kind:'incomplete',retryable:true,
    message:'ИИ вернул неполные данные. Текущий документ сохранён без изменений. Повторите запрос.'};
  if(name==='AbortError'||/AbortError|(?:request\s+)?timed?\s*out|timeout|превышено время/i.test(message))
    return {kind:'timeout',retryable:true,
      message:'Истекло время ожидания ответа ИИ. Проверьте подключение и повторите запрос.'};
  const explicit=Number(err?.status);
  const status=Number.isInteger(explicit)&&explicit>=400&&explicit<=599?explicit:
    Number((message.match(/(?:^|[\s:(])([45]\d\d)(?=[\s:;,.()]|$)/)||[])[1]||0);
  if(status===401||status===403)return {kind:'access',status,retryable:false,
    message:'Прокси отклонил запрос ('+status+'). Проверьте доступ к Yandex Cloud Function.'};
  if(status===404)return {kind:'not_found',status,retryable:false,
    message:'AI proxy не найден (404). Проверьте адрес Cloud Function.'};
  if(status===408||status===504)return {kind:'timeout',status,retryable:true,
    message:'Сервис ИИ не ответил вовремя ('+status+'). Повторите запрос позже.'};
  if(status===413)return {kind:'too_large',status,retryable:false,
    message:'Слишком большой запрос для ИИ (413). Уменьшите объём описания или количество шагов.'};
  if(status===429)return {kind:'rate_limit',status,retryable:true,
    message:'Превышен лимит запросов ИИ (429). Повторите запрос после снятия ограничения.'};
  if(status>=500)return {kind:'server',status,retryable:true,
    message:'Yandex Cloud Function временно недоступна ('+status+'). Повторите запрос позже.'};
  if(status>=400)return {kind:'http',status,retryable:false,
    message:'Прокси отклонил запрос ('+status+'). Проверьте параметры запроса.'};
  if(name==='SyntaxError'||/Unexpected token.*JSON|not valid JSON|JSON\.parse|Unexpected end of JSON/i.test(message))
    return {kind:'proxy_json',retryable:true,
      message:'Прокси вернул некорректный JSON. Данные не изменены. Повторите запрос.'};
  if(name==='TypeError'||/Failed to fetch|NetworkError|Load failed|connection refused|network request failed/i.test(message))
    return {kind:'network',retryable:true,
      message:'Сервис ИИ недоступен. Проверьте интернет и доступ к Yandex Cloud Function.'};
  if(/пустой ответ|empty response/i.test(message))
    return {kind:'empty',retryable:true,
      message:'ИИ вернул пустой ответ. Данные не изменены. Повторите запрос.'};
  return {kind:'other',retryable:false,
    message:'Ошибка ИИ: '+message.slice(0,300)};
}
function aiUserFacingError(err){
  return aiErrorClassify(err).message;
}
