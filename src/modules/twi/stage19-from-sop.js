function twiToHtml(){
  const t=state.twi||{};
  setVal('twi-trainer',t.trainer);setVal('twi-trainee',t.trainee);
  const p=t.prepare||{},pr=t.present||{},tr=t.tryOut||{},f=t.followUp||{};
  setVal('twi-purpose',p.purpose);setVal('twi-known',p.known);setVal('twi-prep',p.prep);setVal('twi-interest',p.interest);
  setVal('twi-round1',pr.round1);setVal('twi-round2',pr.round2);setVal('twi-round3',pr.round3);
  setVal('twi-tryout',tr.perform);setVal('twi-explain',tr.explain);setVal('twi-check',tr.check);setVal('twi-correct',tr.correct);
  setVal('twi-help',f.help);setVal('twi-frequency',f.control || f.frequency || '');setVal('twi-observe',f.observe);setVal('twi-close',f.close);
  renderTwiSummary();
}
function htmlToTwi(){
  state.twi={enabled:true,trainer:$('twi-trainer')?.value||'',trainee:$('twi-trainee')?.value||'',prepare:{purpose:$('twi-purpose')?.value||'',known:$('twi-known')?.value||'',prep:$('twi-prep')?.value||'',interest:$('twi-interest')?.value||''},present:{round1:$('twi-round1')?.value||'',round2:$('twi-round2')?.value||'',round3:$('twi-round3')?.value||''},tryOut:{perform:$('twi-tryout')?.value||'',explain:$('twi-explain')?.value||'',check:$('twi-check')?.value||'',correct:$('twi-correct')?.value||''},followUp:{help:$('twi-help')?.value||'',control:$('twi-frequency')?.value||'',observe:$('twi-observe')?.value||'',close:$('twi-close')?.value||''}};
}
function renderTwiSummary(){
  const c=$('twiSummary'); if(!c)return;
  const t=state.twi||{};const vals=[['Подготовка работника',t.prepare?.purpose||'Цель не задана'],['Представление работы',t.present?.round2?'Готово':'Не заполнено'],['Пробное выполнение',t.tryOut?.check?'Критерии заданы':'Не заполнено'],['Сопровождение',t.followUp?.help?'Наставник указан':'Не заполнено']];
  c.innerHTML=vals.map(([k,v])=>`<div class="p-2 bg-white rounded border border-slate-200"><div class="text-[11px] font-semibold text-slate-500">${escapeHtml(k)}</div><div class="mt-1">${escapeHtml(v)}</div></div>`).join('');
}
async function generateTwiPlan(){
  const btn=$('generateTwiBtn');if(!btn)return;const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='⏳ Наставник готовит план…';
  try{
    const src={operation:state.meta.operation,executor:state.meta.executor,workplace:state.meta.workplace,safety:state.meta.safety,steps:state.steps.map((s,i)=>({stepNumber:i+1,action:s.action,keyPoints:s.keyMoments.filter(Boolean),reason:s.reason,successCriteria:s.successCriteria,decisionPoints:s.decisionPoints}))};
    const raw=await aiAsk(AI_SYS.twiGenerate,'DATA BEGIN\n'+JSON.stringify(src,null,2)+'\nDATA END',{model:currentModel,temperature:.25,maxTokens:1800,task:'twi_generate'});
    const x=JSON.parse(extractJson(raw));
    state.twi={enabled:true,trainer:'',trainee:'',prepare:{purpose:String(x.prepare?.purpose||''),known:String(x.prepare?.known||''),prep:String(x.prepare?.prep||''),interest:String(x.prepare?.interest||'')},present:{round1:String(x.present?.round1||''),round2:String(x.present?.round2||''),round3:String(x.present?.round3||'')},tryOut:{perform:String(x.tryOut?.perform||''),explain:String(x.tryOut?.explain||''),check:String(x.tryOut?.check||''),correct:String(x.tryOut?.correct||'')},followUp:{help:String(x.followUp?.help||''),control:String(x.followUp?.control||x.followUp?.frequency||''),observe:String(x.followUp?.observe||''),close:String(x.followUp?.close||'')}};
    twiToHtml();saveDraft();toast('План TWI сформирован','success');
  }catch(e){toast('Не удалось сформировать TWI: '+diagnoseAIError(e),'error')}
  finally{btn.disabled=false;btn.innerHTML=old}
}
function clearTwi(){htmlToTwi();const hasData=Object.values(state.twi).some(v=>typeof v==='string'?!!v.trim():typeof v==='object'&&v!==null&&Object.values(v).some(x=>typeof x==='string'&&!!x.trim()));if(hasData&&!confirm('Очистить весь заполненный блок TWI? Отменить очистку нельзя.'))return;state.twi={enabled:false,trainer:'',trainee:'',prepare:{purpose:'',known:'',prep:'',interest:''},present:{round1:'',round2:'',round3:''},tryOut:{perform:'',explain:'',check:'',correct:''},followUp:{help:'',control:'',observe:'',close:''}};twiToHtml();saveDraft();toast('Блок TWI очищен','info')}
function renderTwi(){twiToHtml()}
