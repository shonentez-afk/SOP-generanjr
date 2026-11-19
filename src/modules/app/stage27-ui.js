// Stage27 UI is injected after the existing editor metadata section.
// Existing buttons, tab navigation, screenshots/Excel and runtime are untouched.
let stage27Busy=false;
let stage27ActiveTab='clarify';
function stage27Attr(value){return escapeHtml(value).replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}
function stage27SetBusy(next){
  if(next&&stage27Busy){toast('Дождитесь завершения текущего запроса ИИ.','info');return false;}
  stage27Busy=!!next;
  const host=$('stage27AssistantPanel');
  if(host){
    host.querySelectorAll('[data-stage27-ai]').forEach(b=>{b.disabled=stage27Busy;});
    const msg=$('stage27BusyLabel');
    if(msg)msg.textContent=stage27Busy?'ИИ обрабатывает запрос…':'Результаты ИИ применяются только после вашего подтверждения';
  }
  return true;
}
function stage27ResetTransient(){
  stage27AnalogSelected=null;
  stage27AnalogMatches=[];
  stage27HistoryCandidates=[];
  const diff=$('stage27HistoryDiff');
  if(diff)diff.textContent='Выберите предыдущую версию для сравнения.';
  const q=$('stage27AnalogQuery');
  if(q)q.value='';
  const d=$('stage27AnalogDifferences');
  if(d)d.value='';
  stage27RenderHistoryOptions();
}
function stage27SwitchTab(tab){
  if(!['clarify','mentor','analog','changes'].includes(tab))return;
  stage27ActiveTab=tab;
  const el=$('stage27AssistantPanel');if(!el)return;
  el.querySelectorAll('[data-stage27-tab]').forEach(button=>{
    const active=button.dataset.stage27Tab===tab;
    button.setAttribute('aria-selected',String(active));
    button.classList.toggle('active',active);
  });
  el.querySelectorAll('[data-stage27-pane]').forEach(pane=>{
    pane.hidden=pane.dataset.stage27Pane!==tab;
  });
}
function stage27RenderQuestions(){
  const el=$('stage27QuestionsArea');if(!el)return;
  const d=stage27Normalize(state.stage27);
  const items=d.questions;
  if(!items.length){
    el.innerHTML='<p class="s27-muted">Нажмите «Найти важные уточнения», чтобы выявить недостающие факты. Вы также можете использовать уже выведенные выше вопросы СОП.</p>';
    return;
  }
  el.innerHTML=items.map((q,i)=>
    '<div class="s27-card" data-stage27-question-card="'+stage27Attr(q.id)+'">'+
      '<div class="s27-question"><strong>'+(i+1)+'. '+escapeHtml(q.question)+'</strong>'+
      (q.stepId?'<span class="s27-pill">Шаг ID '+escapeHtml(q.stepId)+'</span>':'')+'</div>'+
      (q.why?'<p class="s27-muted">'+escapeHtml(q.why)+'</p>':'')+
      '<label for="stage27Answer'+i+'">Фактический ответ инженера</label>'+
      '<textarea id="stage27Answer'+i+'" rows="2" maxlength="1800" data-stage27-answer="'+stage27Attr(q.id)+'" placeholder="Что действительно известно по операции?">'+escapeHtml(q.answer)+'</textarea>'+
      '<div class="s27-actions"><span class="s27-status">'+
      (q.confirmed?'✓ Подтверждено пользователем':'Ожидает подтверждения')+'</span>'+
      '<button type="button" data-stage27-confirm="'+stage27Attr(q.id)+'"'+
      (q.confirmed?' disabled':'')+'>Подтвердить факт</button></div></div>'
  ).join('');
}
function stage27RenderProposals(){
  const el=$('stage27ProposalsArea');if(!el)return;
  const d=stage27Normalize(state.stage27);
  if(!d.suggestions.length){
    el.innerHTML='<p class="s27-muted">Пока нет предложений. Ответьте на вопросы и нажмите «Предложить точечные изменения».</p>';return;
  }
  const stale=d.suggestionSignature!==stage27DocumentSignature();
  const labels={action:'Действие',reason:'Почему важно',successCriteria:'Критерий результата'};
  el.innerHTML=(stale?'<p class="s27-danger">СОП изменился после формирования предложений. Запустите анализ заново.</p>':'')+
    d.suggestions.map(p=>'<div class="s27-card">'+
    '<label class="s27-choice"><input type="checkbox" data-stage27-suggestion="'+stage27Attr(p.id)+'"'+
    (stale?' disabled':'')+'><b>Шаг ID '+escapeHtml(p.stepId)+' · '+escapeHtml(labels[p.field]||p.field)+'</b></label>'+
    '<div class="s27-old"><span>Сейчас:</span> '+escapeHtml(p.oldValue||'—')+'</div>'+
    '<div class="s27-new"><span>Предлагается:</span> '+escapeHtml(p.newValue)+'</div>'+
    '<p class="s27-muted">Основание: '+escapeHtml(p.why||'Подтверждённый ответ пользователя')+'</p>'+
    '</div>').join('')+
    '<button type="button" class="s27-primary" id="stage27ApplySuggestionsBtn"'+(stale?' disabled':'')+
      '>Применить только отмеченные изменения</button>';
}
function stage27RenderMentor(){
  const el=$('stage27MentorResults');if(!el)return;
  const d=stage27Normalize(state.stage27);
  if(!d.mentor.length){
    el.innerHTML='<p class="s27-muted">В этом блоке ИИ проверяет логические связи действий, причин и критериев. Его выводы — рекомендации, не заключение о безопасности.</p>';
    return;
  }
  const stale=d.mentorSignature!==stage27DocumentSignature();
  el.innerHTML=(stale?'<p class="s27-danger">Документ изменён после проверки. Выводы могут быть неактуальны.</p>':'')+
    d.mentor.map(i=>
    '<div class="s27-card"><div class="s27-question">'+
      '<strong>'+escapeHtml(i.description)+'</strong>'+
      '<span class="s27-pill">Шаг ID '+escapeHtml(i.stepId)+'</span></div>'+
      (i.evidence?'<p><b>Основание:</b> '+escapeHtml(i.evidence)+'</p>':'')+
      (i.suggestion?'<p><b>Проверить:</b> '+escapeHtml(i.suggestion)+'</p>':'')+
      (i.explanation?'<p class="s27-explain">'+escapeHtml(i.explanation)+'</p>':'')+
      '<button type="button" data-stage27-explain="'+stage27Attr(i.id)+'" data-stage27-ai'+
        (stale?' disabled':'')+'>Объяснить замечание</button></div>'
    ).join('');
}
function stage27RenderAnalogs(){
  const el=$('stage27Candidates');if(!el)return;
  if(!stage27AnalogMatches.length){
    el.innerHTML='<p class="s27-muted">Поиск выполняется по названиям, описаниям и шагам опубликованных СОП в локальной библиотеке. Без обращения к облаку.</p>';
  }else{
    el.innerHTML=stage27AnalogMatches.map(({doc,score})=>
      '<div class="s27-card"><div class="s27-question"><strong>'+
      escapeHtml(doc.title||'Без названия')+'</strong>'+
      '<span class="s27-pill">'+escapeHtml(doc.number||'СОП')+'</span></div>'+
      '<p class="s27-muted">'+(doc.snapshot.steps?.length||0)+' шагов · совпадений по словам: '+
      score+' · версия '+escapeHtml(doc.version||1)+'</p>'+
      '<button type="button" data-stage27-select-analog="'+stage27Attr(doc.id)+'">'+
      (stage27AnalogSelected?.id===doc.id?'✓ Выбран как аналог':'Выбрать как аналог')+
      '</button></div>').join('');
  }
  const detail=$('stage27AnalogSelected');
  if(!detail)return;
  const selected=stage27AnalogSelected?.doc;
  detail.innerHTML=selected?
    '<div class="s27-card"><b>Источник: '+escapeHtml(selected.title||'СОП')+'</b>'+
    '<p>№ '+escapeHtml(selected.number||'—')+' · Только опубликованный СОП</p>'+
    '<ol>'+((selected.snapshot.steps||[]).slice(0,24).map(s=>
      '<li>'+escapeHtml(s.action||'Шаг без названия')+'</li>').join(''))+'</ol>'+
    '<p class="s27-muted">Источник используется только по вашему нажатию. Параметры, фото и меры безопасности не копируются автоматически.</p></div>':
    '<p class="s27-muted">Выберите найденный документ, чтобы увидеть его шаги.</p>';
}
function stage27Render(){
  if(!$('stage27AssistantPanel'))return;
  state.stage27=stage27Normalize(state.stage27);
  stage27RenderQuestions();
  stage27RenderProposals();
  stage27RenderMentor();
  stage27RenderAnalogs();
  stage27SwitchTab(stage27ActiveTab);
  stage27SetBusy(stage27Busy);
}
function stage27Init(){
  if($('stage27AssistantPanel'))return;
  const editor=$('tab-editor');if(!editor)return;
  state.stage27=stage27Normalize(state.stage27);
  const style=document.createElement('style');
  style.id='stage27Styles';
  style.textContent=[
    '#stage27AssistantPanel{border:1px solid #c7d2fe;border-radius:16px;background:#fff;padding:20px;margin-bottom:18px;font-size:14px;color:#1e293b}',
    '#stage27AssistantPanel h2{font-size:19px;font-weight:700;margin:0 0 5px}',
    '#stage27AssistantPanel h3{font-size:16px;font-weight:700;margin:8px 0}',
    '#stage27AssistantPanel .s27-intro{color:#475569;font-size:13px;margin-bottom:12px}',
    '#stage27AssistantPanel .s27-nav{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0;padding-bottom:10px;border-bottom:1px solid #e2e8f0}',
    '#stage27AssistantPanel button{border:1px solid #cbd5e1;border-radius:8px;padding:8px 11px;background:#f8fafc;color:#1e293b;font-weight:600;font-size:13px}',
    '#stage27AssistantPanel button.active,#stage27AssistantPanel .s27-primary{background:#4338ca;color:#fff;border-color:#4338ca}',
    '#stage27AssistantPanel button:disabled{opacity:.5;cursor:not-allowed}',
    '#stage27AssistantPanel .s27-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:8px}',
    '#stage27AssistantPanel .s27-card{padding:12px;margin:10px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;line-height:1.5}',
    '#stage27AssistantPanel .s27-question{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap}',
    '#stage27AssistantPanel .s27-pill{padding:2px 7px;border-radius:10px;background:#e0e7ff;color:#3730a3;font-size:12px}',
    '#stage27AssistantPanel .s27-muted{color:#64748b;font-size:13px;margin:6px 0}',
    '#stage27AssistantPanel .s27-danger{color:#b91c1c;font-weight:600;margin:8px 0}',
    '#stage27AssistantPanel .s27-status{font-size:12px;color:#4338ca}',
    '#stage27AssistantPanel label{display:block;font-weight:600;margin-top:7px;font-size:13px}',
    '#stage27AssistantPanel textarea,#stage27AssistantPanel input[type=text],#stage27AssistantPanel select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:9px;font-size:13px;background:white}',
    '#stage27AssistantPanel .s27-choice{display:flex;align-items:center;gap:8px;margin:0}',
    '#stage27AssistantPanel .s27-choice input{width:auto;min-width:16px;min-height:16px}',
    '#stage27AssistantPanel .s27-old{background:#fff1f2;padding:6px;border-radius:6px;margin-top:7px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '#stage27AssistantPanel .s27-new{background:#ecfdf5;padding:6px;border-radius:6px;margin-top:7px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '#stage27AssistantPanel .s27-explain{padding:10px;border-left:3px solid #4338ca;background:#eef2ff;white-space:pre-wrap}',
    '#stage27AssistantPanel .s27-changes{max-height:420px;overflow:auto}',
    '#stage27AssistantPanel .s27-change{padding:10px 0;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}',
    '#stage27AssistantPanel .s27-change div{white-space:pre-wrap;font-size:13px;margin-top:3px}',
    '#stage27AssistantPanel .s27-impact{background:#fef3c7;padding:10px;border-radius:8px;margin:10px 0;line-height:1.8}',
    '#stage27AssistantPanel .s27-summary{font-weight:600;margin:10px 0}',
    '#stage27AssistantPanel .s27-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}',
    '#stage27AssistantPanel ol{padding-left:23px;list-style:decimal}',
    '#stage27AssistantPanel [hidden]{display:none!important}'
  ].join('\n');
  document.head.appendChild(style);
  const panel=document.createElement('section');
  panel.id='stage27AssistantPanel';
  panel.setAttribute('aria-label','Интеллектуальный помощник СОП');
  panel.innerHTML=[
    '<h2>🧠 ИИ-помощник СОП</h2>',
    '<p class="s27-intro">Stage 27 · Уточнение фактов, независимая проверка, локальные аналоги, сравнение редакций. Действующий прокси и настройки ИИ не меняются.</p>',
    '<div class="s27-nav" role="tablist" aria-label="Функции ИИ-помощника">',
      '<button type="button" role="tab" data-stage27-tab="clarify">Уточнить СОП</button>',
      '<button type="button" role="tab" data-stage27-tab="mentor">Наставник 2.0</button>',
      '<button type="button" role="tab" data-stage27-tab="analog">По аналогии</button>',
      '<button type="button" role="tab" data-stage27-tab="changes">Сравнить версии</button>',
    '</div>',
    '<div data-stage27-pane="clarify" role="tabpanel">',
      '<h3>Уточнение исходных фактов</h3>',
      '<p class="s27-muted">ИИ задаёт вопросы, вы подтверждаете сведения. Правки существующих шагов — только после выбора полей.</p>',
      '<button type="button" class="s27-primary" id="stage27AskBtn" data-stage27-ai>✨ Найти важные уточнения</button>',
      '<div id="stage27QuestionsArea"></div>',
      '<button type="button" id="stage27SuggestBtn" data-stage27-ai>✨ Предложить точечные изменения</button>',
      '<div id="stage27ProposalsArea"></div>',
    '</div>',
    '<div data-stage27-pane="mentor" role="tabpanel" hidden>',
      '<h3>Логическая проверка технологической операции</h3>',
      '<p class="s27-muted">Дополнение к существующему наставнику: только смысловые противоречия и вопросы. До 18 шагов за один запрос.</p>',
      '<button type="button" class="s27-primary" id="stage27MentorBtn" data-stage27-ai>🔍 Проверить логику СОП</button>',
      '<div id="stage27MentorResults"></div>',
    '</div>',
    '<div data-stage27-pane="analog" role="tabpanel" hidden>',
      '<h3>Создать СОП на основе утверждённого аналога</h3>',
      '<p class="s27-muted">Сначала локальный поиск по опубликованным СОП, затем явный выбор документа.</p>',
      '<div class="s27-grid"><div><label for="stage27AnalogQuery">Оборудование или операция</label>',
      '<input type="text" id="stage27AnalogQuery" placeholder="Например, проверка ленточного конвейера"></div>',
      '<div class="s27-actions"><button type="button" id="stage27FindAnalogs">Найти в библиотеке</button></div></div>',
      '<div id="stage27Candidates"></div>',
      '<div id="stage27AnalogSelected"></div>',
      '<label for="stage27AnalogDifferences">Отличия целевой операции от аналога</label>',
      '<textarea id="stage27AnalogDifferences" rows="3" placeholder="Укажите только подтверждённые различия. Если описание процесса уже заполнено выше, можно оставить пустым."></textarea>',
      '<p class="s27-muted">Новый черновик не получает фотографии, время и требования безопасности из аналога автоматически.</p>',
      '<button type="button" class="s27-primary" id="stage27MakeAnalogBtn" data-stage27-ai>✨ Создать черновик по выбранному аналогу</button>',
    '</div>',
    '<div data-stage27-pane="changes" role="tabpanel" hidden>',
      '<h3>Анализ изменений между версиями</h3>',
      '<p class="s27-muted">Сопоставление выполняется локально, без ИИ-запроса. Показывает возможное влияние на TWI, фото и ФРВ.</p>',
      '<button type="button" id="stage27HistoryRefresh">Найти предыдущие редакции</button>',
      '<label for="stage27HistorySelect">Предыдущая редакция</label>',
      '<select id="stage27HistorySelect"><option value="">Выберите редакцию</option></select>',
      '<button type="button" id="stage27HistoryCompare">Сравнить с текущим СОП</button>',
      '<div id="stage27HistoryDiff" class="s27-card">Выберите предыдущую версию для сравнения.</div>',
    '</div>',
    '<p id="stage27BusyLabel" class="s27-muted">Результаты ИИ применяются только после вашего подтверждения</p>'
  ].join('');
  if(editor.firstElementChild)editor.firstElementChild.after(panel);
  else editor.appendChild(panel);
  panel.addEventListener('click',event=>{
    const btn=event.target.closest('button');
    if(!btn||!panel.contains(btn))return;
    if(btn.dataset.stage27Tab){stage27SwitchTab(btn.dataset.stage27Tab);return;}
    if(btn.dataset.stage27Confirm){stage27ConfirmAnswer(btn.dataset.stage27Confirm);return;}
    if(btn.dataset.stage27Explain){stage27ExplainMentor(btn.dataset.stage27Explain);return;}
    if(btn.dataset.stage27SelectAnalog){stage27SelectAnalog(btn.dataset.stage27SelectAnalog);return;}
    switch(btn.id){
      case 'stage27AskBtn': stage27AskQuestions();break;
      case 'stage27SuggestBtn': stage27SuggestFromFacts();break;
      case 'stage27ApplySuggestionsBtn': stage27ApplySelected();break;
      case 'stage27MentorBtn': stage27ReviewLogic();break;
      case 'stage27FindAnalogs': stage27FindAnalogs();break;
      case 'stage27MakeAnalogBtn': stage27GenerateAnalog();break;
      case 'stage27HistoryRefresh': stage27RefreshHistory();break;
      case 'stage27HistoryCompare': stage27CompareSelectedVersion();break;
    }
  });
  panel.addEventListener('input',event=>{
    const el=event.target.closest('[data-stage27-answer]');
    if(el)stage27SaveAnswer(el.dataset.stage27Answer,el.value);
  });
  stage27Render();
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stage27Init);
  else stage27Init();
}
