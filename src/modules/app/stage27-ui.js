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
  const panel=$('stage27AssistantPanel'),toolbar=$('stage27Actions');
  if(!panel||!toolbar)return;
  stage27ActiveTab=tab;
  $('sopReviewContainer')?.classList.remove('hidden');
  panel.hidden=false;
  const titles={
    clarify:'Уточнение технологических данных',
    mentor:'Дополнительная проверка логики шагов',
    analog:'Создание черновика по аналогу',
    changes:'Сравнение редакций СОП'
  };
  const heading=$('stage27PanelTitle');
  if(heading)heading.textContent=titles[tab];
  toolbar.querySelectorAll('[data-stage27-tab]').forEach(button=>{
    const active=button.dataset.stage27Tab===tab;
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-expanded',String(active));
    button.classList.toggle('active',active);
  });
  panel.querySelectorAll('[data-stage27-pane]').forEach(pane=>{
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
  if(!$('stage27AssistantPanel').hidden)stage27SwitchTab(stage27ActiveTab);
  stage27SetBusy(stage27Busy);
}
function stage27Init(){
  // Extend the accepted full-SOP-review UI instead of creating a second AI
  // dashboard above the editor. This panel is a direct descendant of the
  // original results block, so its rendering never touches old review fields.
  if($('stage27AssistantPanel'))return;
  const reviewButton=$('reviewSopBtn');
  const reviewBox=$('sopReviewContainer');
  const reviewIssues=$('sopReviewIssues');
  const closeButton=$('closeReviewBtn');
  if(!reviewButton||!reviewBox||!reviewIssues||!closeButton)return;
  state.stage27=stage27Normalize(state.stage27);
  const style=document.createElement('style');
  style.id='stage27Styles';
  style.textContent=[
    '#stage27AssistantPanel{border:0;border-top:1px solid #ddd6fe;background:transparent;padding:14px 0 0;margin-top:14px;font-size:14px;color:#1e293b}',
    '#stage27AssistantPanel .s27-heading{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:6px;font-weight:700;color:#581c87}',
    '#stage27AssistantPanel h3{font-size:16px;font-weight:700;margin:8px 0}',
    '#stage27AssistantPanel .s27-intro{color:#64748b;font-weight:400;font-size:12px}',
    '#stage27Actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 0;max-width:100%}',
    '#stage27Actions .s27-toolbar-btn{min-height:34px;background:#fff;color:#6b21a8;border-color:#d8b4fe;white-space:nowrap;transition:background .18s,color .18s,box-shadow .18s}',
    '#stage27Actions .s27-toolbar-btn:hover{background:#faf5ff;border-color:#c084fc}',
    '#stage27Actions .s27-toolbar-btn[aria-pressed="true"]{background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-color:transparent;box-shadow:0 4px 12px rgba(168,85,247,.25)}',
    '#stage27Actions .s27-toolbar-btn:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}',
    '#stage27AssistantPanel button{border:1px solid #cbd5e1;border-radius:8px;padding:8px 11px;background:#f8fafc;color:#1e293b;font-weight:600;font-size:13px}',
    '#stage27AssistantPanel button.active,#stage27AssistantPanel .s27-primary{background:#6d28d9;color:#fff;border-color:#6d28d9}',
    '#stage27AssistantPanel button:disabled{opacity:.5;cursor:not-allowed}',
    '#stage27AssistantPanel .s27-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:8px}',
    '#stage27AssistantPanel .s27-card{padding:10px;margin:8px 0;background:#fff;border:1px solid #e2e8f0;border-radius:9px;line-height:1.5}',
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
    '#stage27AssistantPanel [hidden]{display:none!important}',
    '#sopReviewSummary:empty,#sopReviewIssues:empty{display:none}'
  ].join('\n');
  document.head.appendChild(style);
  // Four always-visible actions, styled like the existing SOP action buttons.
  // The result surface remains the same original review panel.
  const toolbar=document.createElement('div');
  toolbar.id='stage27Actions';
  toolbar.className='flex flex-wrap items-center gap-2 mt-2 mb-1';
  toolbar.setAttribute('role','group');
  toolbar.setAttribute('aria-label','Дополнительные функции СОП');
  const actionBase='btn-ghost s27-toolbar-btn px-3 py-2 rounded-lg text-xs font-semibold border';
  toolbar.innerHTML=[
    '<button type="button" class="'+actionBase+'" data-stage27-tab="clarify" aria-pressed="false" aria-expanded="false" aria-controls="stage27AssistantPanel">❔ Уточнить СОП</button>',
    '<button type="button" class="'+actionBase+'" data-stage27-tab="mentor" aria-pressed="false" aria-expanded="false" aria-controls="stage27AssistantPanel">🧩 Логика шагов</button>',
    '<button type="button" class="'+actionBase+'" data-stage27-tab="analog" aria-pressed="false" aria-expanded="false" aria-controls="stage27AssistantPanel">📚 По аналогии</button>',
    '<button type="button" class="'+actionBase+'" data-stage27-tab="changes" aria-pressed="false" aria-expanded="false" aria-controls="stage27AssistantPanel">🕘 Сравнить версии</button>'
  ].join('');
  reviewButton.parentElement.insertAdjacentElement('afterend',toolbar);
  const panel=document.createElement('div');
  panel.id='stage27AssistantPanel';
  panel.hidden=true;
  panel.setAttribute('aria-label','Дополнительные инструменты проверки СОП');
  panel.innerHTML=[
    '<div class="s27-heading"><span id="stage27PanelTitle">Уточнение технологических данных</span><span class="s27-intro">Применение изменений — только после подтверждения</span></div>',
    '<div data-stage27-pane="clarify" role="tabpanel">',
      '<p class="s27-muted">Запросите недостающие факты, подтвердите ответы и выберите только нужные точечные исправления.</p>',
      '<button type="button" class="s27-primary" id="stage27AskBtn" data-stage27-ai>✨ Найти уточнения</button>',
      '<div id="stage27QuestionsArea"></div>',
      '<button type="button" id="stage27SuggestBtn" data-stage27-ai>Предложить исправления</button>',
      '<div id="stage27ProposalsArea"></div>',
    '</div>',
    '<div data-stage27-pane="mentor" role="tabpanel" hidden>',
      '<p class="s27-muted">Дополнение к обычной проверке: смысловые связи действий и причин, не более 18 шагов за запрос.</p>',
      '<button type="button" class="s27-primary" id="stage27MentorBtn" data-stage27-ai>✨ Проверить связи между шагами</button>',
      '<div id="stage27MentorResults"></div>',
    '</div>',
    '<div data-stage27-pane="analog" role="tabpanel" hidden>',
      '<p class="s27-muted">Поиск по опубликованным СОП в локальной библиотеке. Документ отправляется ИИ только после вашего выбора.</p>',
      '<div class="s27-grid"><div><label for="stage27AnalogQuery">Название операции или оборудование</label>',
      '<input type="text" id="stage27AnalogQuery" placeholder="Например, проверка ленточного конвейера"></div>',
      '<div class="s27-actions"><button type="button" id="stage27FindAnalogs">Найти аналог</button></div></div>',
      '<div id="stage27Candidates"></div>',
      '<div id="stage27AnalogSelected"></div>',
      '<label for="stage27AnalogDifferences">Подтверждённые отличия целевой операции</label>',
      '<textarea id="stage27AnalogDifferences" rows="3" placeholder="Что именно отличается от выбранного СОП?"></textarea>',
      '<p class="s27-muted">Фотографии, время и требования безопасности не копируются из аналога.</p>',
      '<button type="button" class="s27-primary" id="stage27MakeAnalogBtn" data-stage27-ai>✨ Подготовить черновик по аналогу</button>',
    '</div>',
    '<div data-stage27-pane="changes" role="tabpanel" hidden>',
      '<p class="s27-muted">Сравнение текущего СОП с редакцией из библиотеки. Локально, без запроса к ИИ.</p>',
      '<button type="button" id="stage27HistoryRefresh">Найти редакции</button>',
      '<label for="stage27HistorySelect">Сравнить с редакцией</label>',
      '<select id="stage27HistorySelect"><option value="">Выберите предыдущую редакцию</option></select>',
      '<button type="button" id="stage27HistoryCompare">Сравнить</button>',
      '<div id="stage27HistoryDiff" class="s27-card">Выберите предыдущую версию для сравнения.</div>',
    '</div>',
    '<p id="stage27BusyLabel" class="s27-muted">Подтверждение инженера обязательно</p>'
  ].join('');
  reviewIssues.insertAdjacentElement('afterend',panel);
  const collapse=()=>{
    panel.hidden=true;
    toolbar.querySelectorAll('[data-stage27-tab]').forEach(button=>{
      button.classList.remove('active');
      button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-expanded','false');
    });
    if(!$('sopReviewSummary')?.textContent.trim() &&
       !$('sopReviewIssues')?.textContent.trim()){
      reviewBox.classList.add('hidden');
    }
  };
  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('[data-stage27-tab]');
    if(!button||!toolbar.contains(button))return;
    const tab=button.dataset.stage27Tab;
    if(!panel.hidden&&tab===stage27ActiveTab){
      collapse();
      return;
    }
    stage27SwitchTab(tab);
    panel.scrollIntoView({behavior:'auto',block:'nearest'});
  });
  closeButton.addEventListener('click',collapse);
  panel.addEventListener('click',event=>{
    const btn=event.target.closest('button');
    if(!btn||!panel.contains(btn))return;
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
