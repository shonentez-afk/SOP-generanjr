// Stage42 — isolated full-screen XLSX review. Nothing reaches the current SOP
// until the user explicitly chooses "Загрузить в редактор". No network/AI.
const stage42Wizard={host:null,proposal:null,signature:'',selectedStep:0,
  sheet:null,startRow:1,cell:null,dirty:false,busy:false};
function stage42Esc(value){return escapeHtml(String(value??''))}
function stage42El(id){return document.getElementById(id)}
function stage42Info(message,isError=false){
  const el=stage42El('stage42Status');if(!el)return;
  el.textContent=String(message||'');
  el.classList.toggle('stage42-error',!!isError);
}
function stage42MakeStep(action='',source=''){
  return {action:String(action||''),keyMoments:[''],reason:'',durationSeconds:0,
    successCriteria:'',photoIndex:-1,
    source:{action:source,keyMoments:'',reason:'',time:''},
    frv:{vdc:false,m2:'',m1:'',move:'',comment:''}};
}
function stage42CurrentStep(){
  return stage42Wizard.proposal?.steps[stage42Wizard.selectedStep]||null;
}
function stage42MarkDirty(){stage42Wizard.dirty=true}
function stage42UnusedPhotos(){
  const p=stage42Wizard.proposal;
  return p?p.media.filter((m,i)=>!m.auxiliary&&!p.steps.some(s=>s.photoIndex===i)).length:0;
}
function stage42SetPhoto(index){
  const p=stage42Wizard.proposal,s=stage42CurrentStep();if(!p||!s)return;
  if(index>=p.media.length||index< -1)return;
  if(index>=0)for(const other of p.steps)if(other!==s&&other.photoIndex===index)other.photoIndex=-1;
  s.photoIndex=index;stage42MarkDirty();stage42RenderSteps();
  stage42RenderPhotos();stage42RenderStepEditor();
}
function stage42SourceCell(){
  const cell=stage42Wizard.cell,p=stage42Wizard.proposal;
  if(!cell||!p)return null;
  const ws=p.wb.getWorksheet(cell.sheet);
  if(!ws)return null;
  return {text:stage42Reader(ws).text(cell.row,cell.col),
    source:cell.sheet+'!'+stage42CellAddress(cell.row,cell.col)};
}
function stage42RenderSteps(){
  const p=stage42Wizard.proposal;
  const host=stage42El('stage42Steps');
  if(!p){host.innerHTML='';return}
  stage42El('stage42EmptyGuide').hidden=p.steps.length>0;
  stage42El('stage42Apply').disabled=!p.steps.length;
  stage42El('stage42Apply').title=p.steps.length?'Перенести проверенные шаги, реквизиты и фотографии в редактор':'Сначала распознайте или создайте хотя бы один шаг';
  host.innerHTML=p.steps.map((s,i)=>
    '<button type="button" class="stage42-step'+(i===stage42Wizard.selectedStep?' selected':'')+
    '" data-stage42-step="'+i+'"><b>Шаг '+(i+1)+'</b><small>'+
    stage42Esc(String(s.action||'Без действия').slice(0,95))+'</small>'+
    '<small>КМ: '+s.keyMoments.filter(x=>String(x).trim()).length+
    ' · Фото: '+(s.photoIndex>=0?'есть':'нет')+'</small></button>').join('')||
    '<p class="stage42-note">Шаги не распознаны. Выберите ячейку и создайте шаг вручную.</p>';
  stage42El('stage42Count').textContent=p.steps.length+' шагов';
}
function stage42RenderMomentFields(s){
  const host=stage42El('stage42MomentFields');if(!host)return;
  host.innerHTML=(s.keyMoments||['']).map((value,i)=>
    '<div class="stage42-moment-item"><label for="stage42Moment'+i+'">'+(i+1)+'. Ключевой момент</label>'+
    '<textarea id="stage42Moment'+i+'" rows="2" data-stage42-moment="'+i+
    '" placeholder="Точный текст '+(i+1)+'-го КМ из исходного XLSX">'+
    stage42Esc(value)+'</textarea>'+
    '<button type="button" title="Удалить этот КМ" aria-label="Удалить КМ '+(i+1)+
    '" data-stage42-remove-moment="'+i+'">✕</button></div>').join('');
  const count=stage42El('stage42MomentCount');
  if(count)count.textContent=(s.keyMoments||[]).filter(x=>String(x).trim()).length+' КМ';
}
function stage42RenderStepEditor(){
  const p=stage42Wizard.proposal,s=stage42CurrentStep();
  const form=stage42El('stage42StepFields');
  if(!s){form.hidden=true;return}
  form.hidden=false;
  for(const [field,value] of Object.entries({
    action:s.action,
    reason:s.reason,successCriteria:s.successCriteria,
    durationSeconds:s.durationSeconds
  })){
    const input=form.querySelector('[data-stage42-field="'+field+'"]');
    if(input)input.value=String(value??'');
  }
  stage42RenderMomentFields(s);
  const photo=form.querySelector('#stage42PhotoSelect');
  photo.innerHTML='<option value="-1">Нет фотографии</option>'+
    p.media.map((m,i)=>'<option value="'+i+'">'+stage42Esc(m.source)+
    ' · '+Math.round(m.bytes.byteLength/1024)+' КБ</option>').join('');
  photo.value=String(s.photoIndex);
  stage42El('stage42SourceInfo').textContent=
    'Источник: '+Object.entries(s.source||{}).filter(([,v])=>v).
      map(([k,v])=>k+' '+v).join(' · ');
  const preview=stage42El('stage42ActivePhoto');
  preview.innerHTML=s.photoIndex>=0&&p.media[s.photoIndex]?
    '<img alt="Фото выбранного шага" src="'+stage42Esc(p.media[s.photoIndex].url)+'">':
    '<span class="stage42-note">Фото не назначено</span>';
}
function stage42RenderMetadata(){
  const p=stage42Wizard.proposal;
  if(!p)return;
  for(const el of stage42Wizard.host.querySelectorAll('[data-stage42-meta]')){
    el.value=String(p.meta[el.dataset.stage42Meta]||'');
  }
}
function stage42RenderPhotos(){
  const p=stage42Wizard.proposal;if(!p)return;
  const unused=stage42UnusedPhotos();
  const host=stage42El('stage42Media');
  host.innerHTML=p.media.map((m,i)=>{
    const assigned=p.steps.findIndex(s=>s.photoIndex===i);
    return '<div class="stage42-photo"><img alt="Изображение '+(i+1)+'" src="'+
      stage42Esc(m.url)+'"><div>'+stage42Esc(m.source)+'</div><small>'+
      (assigned>=0?'Шаг '+(assigned+1):m.auxiliary?'Служебный фон (дублирующий слой Excel)':'Не назначено · возможный логотип/иконка')+
      '</small><button type="button" data-stage42-pick-photo="'+i+'">К выбранному шагу</button></div>';
  }).join('')||'<p class="stage42-note">В выбранном листе нет встроенных фотографий.</p>';
  const check=stage42El('stage42OmitMedia');
  check.closest('label').hidden=!unused;
  if(!unused)check.checked=false;
  stage42El('stage42UnusedCount').textContent=unused?String(unused):'0';
}
function stage42RenderWarnings(){
  const p=stage42Wizard.proposal,host=stage42El('stage42Warnings');
  host.innerHTML=(p?.warnings||[]).map(w=>'<p>⚠ '+stage42Esc(w)+'</p>').join('');
  if(p){
    stage42El('stage42FileInfo').textContent=p.fileName+' · '+p.wb.worksheets.length+
      ' листов · рабочий лист «'+p.sourceSheet+'»';
    stage42El('stage42Sheet').innerHTML=p.wb.worksheets.map(w=>{
      const info=stage42SheetEvidence(w);
      return '<option value="'+stage42Esc(w.name)+'">'+stage42Esc(w.name)+
        ' · '+info.count+' действ.'+'</option>';
    }).join('');
    stage42El('stage42Sheet').value=p.sourceSheet;
    const info=stage42SheetEvidence(p.ws);
    stage42El('stage42SheetAdvice').classList.toggle('stage42-needs-mapping',!p.steps.length);
    stage42El('stage42SheetAdvice').textContent=p.steps.length?
      'Выбран лист «'+p.sourceSheet+'»: найдено '+p.steps.length+
        ' действий. Проверьте их справа и привязку фотографий.':
      'На этом листе нет распознанных действий. Выберите другой лист из списка или создайте шаг из выделенной ячейки.';
  }
}
function stage42RenderGrid(){
  const p=stage42Wizard.proposal;if(!p)return;
  const ws=p.wb.getWorksheet(stage42Wizard.sheet)||p.ws;
  if(!ws)return;
  const top=Math.max(1,stage42Wizard.startRow),
    last=Math.min(ws.rowCount||1,top+23),
    right=Math.min(Math.max(ws.columnCount||13,1),18),rd=stage42Reader(ws);
  stage42El('stage42Rows').textContent='Строки '+top+'–'+last+' из '+ws.rowCount;
  const mergeMap=buildMergeMap(ws);
  const covered=new Set();
  const merges=[];
  for(const range of (ws.model?.merges||[])){
    const [a,b]=String(range).split(':');if(!a||!b)continue;
    const tl=ws.getCell(a),br=ws.getCell(b);
    merges.push({r1:tl.row,c1:tl.col,r2:br.row,c2:br.col});
  }
  let html='<table class="stage42-grid"><thead><tr><th>№</th>';
  for(let c=1;c<=right;c++)html+='<th>'+stage42ColumnName(c)+'</th>';
  html+='</tr></thead><tbody>';
  for(let r=top;r<=last;r++){
    html+='<tr><th>'+r+'</th>';
    for(let c=1;c<=right;c++){
      if(covered.has(r+':'+c))continue;
      const m=merges.find(x=>x.r1===r&&x.c1===c&&x.r1>=top);
      let rs=1,cs=1;
      if(m){
        rs=Math.min(last,m.r2)-r+1;
        cs=Math.min(right,m.c2)-c+1;
        for(let rr=r;rr<r+rs;rr++)for(let cc=c;cc<c+cs;cc++){
          if(rr!==r||cc!==c)covered.add(rr+':'+cc);
        }
      }
      const cell=stage42CellAddress(r,c);
      const value=rd.text(r,c);
      const selected=stage42Wizard.cell?.sheet===ws.name&&stage42Wizard.cell?.row===r&&
        stage42Wizard.cell?.col===c;
      const picked=p.steps.some(s=>Object.values(s.source||{}).some(x=>x===cell||x===ws.name+'!'+cell));
      html+='<td data-stage42-cell="'+cell+'" data-stage42-r="'+r+'" data-stage42-c="'+c+
        '"'+(rs>1?' rowspan="'+rs+'"':'')+(cs>1?' colspan="'+cs+'"':'')+
        ' class="'+(m?'stage42-merged ':'')+(selected?'stage42-selected ':'')+(picked?'stage42-linked':'')+
        '" title="'+stage42Esc(ws.name+'!'+cell+' '+value).slice(0,280)+'">'+
        stage42Esc(value).slice(0,450)+'</td>';
    }
    html+='</tr>';
  }
  html+='</tbody></table>';
  stage42El('stage42Grid').innerHTML=html;
}
function stage42RenderCellInfo(){
  const el=stage42El('stage42CellInfo'),cell=stage42SourceCell();
  el.textContent=cell?'Выбрана '+cell.source+': '+cell.text.slice(0,240):
    'Нажмите на ячейку исходного Excel, чтобы назначить её действием, КМ, причиной или критерием.';
}
function stage42RenderReady(){
  const p=stage42Wizard.proposal;
  const ready=!!p;
  stage42El('stage42Review').hidden=!ready;
  stage42El('stage42Welcome').hidden=ready;
  stage42El('stage42Flow').classList.toggle('stage42-flow-review',ready);
  if(!ready)return;
  stage42Wizard.sheet=stage42Wizard.sheet||p.sourceSheet;
  stage42RenderWarnings();stage42RenderGrid();stage42RenderSteps();
  stage42RenderStepEditor();stage42RenderMetadata();stage42RenderPhotos();stage42RenderCellInfo();
}
function stage42Close(force=false){
  if(stage42Wizard.busy)return;
  if(!force&&stage42Wizard.dirty&&stage42Wizard.proposal&&
    !confirm('Закрыть мастер? Исправления в предпросмотре не будут сохранены.'))return;
  stage42ReleaseProposal(stage42Wizard.proposal);
  stage42Wizard.proposal=null;stage42Wizard.cell=null;stage42Wizard.dirty=false;
  stage42Wizard.host.hidden=true;
  document.body.classList.remove('stage42-locked');
  stage42El('stage42Input').value='';
}
function stage42Open(){
  if(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив'){
    toast('Откройте черновик или создайте новую версию перед импортом','info');return;
  }
  stage42Wizard.signature=stage42DocumentSignature();
  stage42Wizard.selectedStep=0;stage42Wizard.sheet=null;stage42Wizard.startRow=1;
  stage42Wizard.cell=null;stage42Wizard.dirty=false;
  stage42Wizard.host.hidden=false;document.body.classList.add('stage42-locked');
  stage42RenderReady();
  stage42Info('Импорт ничего не изменяет до вашего подтверждения.');
}
async function stage42ReadFile(file){
  if(!file||stage42Wizard.busy)return;
  stage42Wizard.busy=true;stage42Info('Чтение XLSX и фотографий…');
  try{
    const fresh=await stage42ParseFile(file);
    stage42ReleaseProposal(stage42Wizard.proposal);
    stage42Wizard.proposal=fresh;
    stage42Wizard.sheet=fresh.sourceSheet;
    stage42Wizard.startRow=Math.max(1,(stage42SheetEvidence(fresh.ws).firstActionRow||1)-3);
    stage42Wizard.cell=null;stage42Wizard.selectedStep=0;
    stage42Wizard.dirty=false;
    stage42RenderReady();
    stage42Info('Проверьте распознанные действия и изображения. Затем перенесите их в редактор.');
  }catch(error){
    stage42Info('Не удалось прочитать XLSX: '+String(error.message||error),true);
  }finally{stage42Wizard.busy=false}
}
function stage42ChooseSopSheet(name){
  const prior=stage42Wizard.proposal;if(!prior)return;
  if(name===prior.sourceSheet){stage42Wizard.sheet=name;return}
  if(stage42Wizard.dirty&&!confirm(
    'Вы уже исправили распознанную СОП. При выборе другого листа эти изменения будут потеряны. Продолжить?')){
    stage42El('stage42Sheet').value=prior.sourceSheet;return;
  }
  try{
    const worksheet=prior.wb.getWorksheet(name);
    if(!worksheet)throw new Error('Лист XLSX не найден');
    const fresh=stage42ParseSelectedSheet(prior.wb,worksheet,prior.fileName);
    stage42ReleaseProposal(prior);
    stage42Wizard.proposal=fresh;
    stage42Wizard.sheet=fresh.sourceSheet;
    stage42Wizard.startRow=Math.max(1,(stage42SheetEvidence(worksheet).firstActionRow||1)-3);
    stage42Wizard.cell=null;stage42Wizard.selectedStep=0;stage42Wizard.dirty=false;
    stage42El('stage42OmitMedia').checked=false;
    stage42RenderReady();
    stage42Info(fresh.steps.length?
      'Распознано '+fresh.steps.length+' шагов на листе «'+name+'». Проверьте текст и фотографии.':
      'Лист «'+name+'»: действия пока не распознаны. Выделите ячейку с первым действием и нажмите «Создать шаг из ячейки».');
  }catch(error){
    stage42El('stage42Sheet').value=prior.sourceSheet;
    stage42Info('Не удалось открыть выбранный лист: '+String(error.message||error),true);
  }
}
function stage42ShowStep(index){
  const p=stage42Wizard.proposal;
  if(!p||index<0||index>=p.steps.length)return;
  stage42Wizard.selectedStep=index;
  const source=p.steps[index].source?.action||'';
  const match=source.match(/^(?:.*!)?([A-Z]+)(\d+)$/i);
  if(match){
    const col=[...match[1].toUpperCase()].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
    const row=Number(match[2]);
    stage42Wizard.cell={sheet:p.sourceSheet,row,col};
    stage42Wizard.startRow=Math.max(1,row-3);
  }
  stage42RenderSteps();stage42RenderStepEditor();
  stage42RenderGrid();stage42RenderCellInfo();
}
async function stage42ConfirmApply(){
  const p=stage42Wizard.proposal;
  if(!p||stage42Wizard.busy)return;
  stage42Wizard.busy=true;
  try{
    stage42CheckProposal(p);
    if(stage42UnusedPhotos()&&!stage42El('stage42OmitMedia').checked)
      throw new Error('Назначьте нужные фото или подтвердите пропуск неприкреплённых изображений');
    if(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив')
      throw new Error('Защищённый документ: сначала создайте новый черновик');
    const duplicates=await stage42DuplicateDocuments(p);
    if(duplicates.length&&!confirm(
      'В библиотеке есть похожие СОП ('+duplicates.length+'). Создать новый черновик, не заменяя существующие?'))return;
    if(state.steps.length||state.meta.operation?.trim()){
      if(!confirm('Заменить открытый редактор результатом импорта? Несохранённые изменения будут потеряны.'))return;
    }
    const count=await stage42ApplyProposal(p,stage42Wizard.signature);
    stage42Wizard.dirty=false;
    stage42Wizard.busy=false;
    stage42Close(true);
    stage42Info('');
    const edit=stage42El('tab-editor');
    const tab=document.querySelector('.tab-btn[data-tab="editor"]');
    if(edit&&edit.classList.contains('hidden')&&tab)tab.click();
    toast('В редактор загружено '+count+' шагов, фото и реквизиты. Проверьте и сохраните в библиотеку.','success');
  }catch(error){
    stage42Info(String(error.message||error),true);
  }finally{stage42Wizard.busy=false}
}
function stage42AddFromCell(){
  const p=stage42Wizard.proposal;if(!p)return;
  const cell=stage42SourceCell();
  if(p.steps.length>=250){stage42Info('Максимум 250 шагов на один импорт.',true);return}
  p.steps.push(stage42MakeStep(cell?.text||'',cell?.source||''));
  stage42Wizard.selectedStep=p.steps.length-1;
  stage42MarkDirty();stage42RenderSteps();stage42RenderStepEditor();
}
function stage42UseCell(field){
  const cell=stage42SourceCell();
  if(!stage42CurrentStep()&&field==='action'&&cell?.text){stage42AddFromCell();return}
  const s=stage42CurrentStep();
  if(!s||!cell||!cell.text){
    stage42Info('Сначала выберите ячейку с текстом, затем шаг справа. Если шагов ещё нет — нажмите «Создать шаг из ячейки».',true);
    return;
  }
  if(field==='action'){s.action=stage42CleanAction(cell.text);s.source.action=cell.source}
  else if(field==='km'){
    const parts=stage42SplitKeyMoments(cell.text);
    const existing=s.keyMoments.filter(x=>String(x).trim());
    if(existing.length+parts.length>60){
      stage42Info('В выбранной ячейке слишком много КМ. Проверьте нумерацию исходного Excel.',true);
      return;
    }
    s.keyMoments=existing.concat(parts);
    s.source.keyMoments=cell.source;
  }else if(field==='reason'){s.reason=cell.text;s.source.reason=cell.source}
  else if(field==='criteria'){s.successCriteria=cell.text;s.source.successCriteria=cell.source}
  else return;
  stage42MarkDirty();stage42RenderSteps();stage42RenderStepEditor();stage42RenderGrid();
  stage42Info('Связано с '+cell.source+'. При необходимости уточните текст справа.');
}
function stage42Style(){
  if(stage42El('stage42Css'))return;
  const style=document.createElement('style');style.id='stage42Css';
  style.textContent=[
    'body.stage42-locked{overflow:hidden}',
    '#stage42Wizard{position:fixed;inset:0;background:#f1f5f9;z-index:99999;color:#17263b;overflow:auto;font:14px/1.4 system-ui,Segoe UI,Arial,sans-serif}',
    '#stage42Wizard[hidden],#stage42Wizard [hidden]{display:none!important}',
    '#stage42Wizard *{box-sizing:border-box}',
    '#stage42Wizard button,#stage42Wizard input,#stage42Wizard select,#stage42Wizard textarea{font:inherit}',
    '#stage42Wizard button{cursor:pointer;border:1px solid #9ab0c4;border-radius:8px;background:#fff;color:#173047;padding:7px 11px}',
    '#stage42Wizard button:hover{border-color:#15968e;background:#edfaf9}',
    '#stage42Wizard button:disabled{opacity:.55;cursor:not-allowed}',
    '#stage42Wizard header{position:sticky;top:0;z-index:6;background:#102b41;color:#f8fafc;display:flex;align-items:center;gap:12px;justify-content:space-between;padding:13px 22px;box-shadow:0 2px 10px #0b172b30}',
    '#stage42Wizard header strong{font-size:20px}',
    '#stage42Wizard header small{display:block;font-size:12px;color:#b7d1df}',
    '#stage42Wizard header button{white-space:nowrap}',
    '#stage42Wizard .stage42-container{padding:13px 20px 28px;max-width:1920px;margin:auto}',
    '#stage42Wizard .stage42-note{font-size:12px;color:#64748b}',
    '#stage42Wizard .stage42-pill{display:inline-block;background:#d1fae5;border:1px solid #a7e8d4;border-radius:15px;padding:3px 10px;margin:3px;font-size:12px}',
    '#stage42Wizard .stage42-error{color:#b91c1c!important;font-weight:700}',
    '#stage42Wizard #stage42Status{min-height:22px;margin:5px 0;color:#036b60}',
    '#stage42Wizard .stage42-card{border:1px solid #d7e1e9;border-radius:12px;background:#fff;padding:12px;min-width:0}',
    '#stage42Wizard h3{margin:0 0 9px;font-size:16px}',
    '#stage42Wizard .stage42-main{display:grid;grid-template-columns:minmax(420px,1.18fr) minmax(440px,1fr);gap:12px;align-items:start}',
    '#stage42Wizard .stage42-sticky{position:sticky;top:72px}',
    '#stage42Wizard .stage42-scroll{max-height:56vh;overflow:auto;overscroll-behavior:contain}',
    '#stage42Wizard .stage42-grid{border-collapse:collapse;white-space:pre-wrap;table-layout:fixed;min-width:770px;font-size:12px}',
    '#stage42Wizard .stage42-grid td,#stage42Wizard .stage42-grid th{border:1px solid #d2dce5;padding:6px;max-width:160px;min-width:46px;vertical-align:top;overflow-wrap:anywhere}',
    '#stage42Wizard .stage42-grid th{position:sticky;top:0;background:#eef3f8;color:#334155;z-index:2}',
    '#stage42Wizard .stage42-grid td{cursor:pointer;min-width:100px}',
    '#stage42Wizard .stage42-grid td:hover{background:#dbeafe}',
    '#stage42Wizard .stage42-merged{background:#f1f6ff;border-color:#abc6e9!important}',
    '#stage42Wizard .stage42-linked{box-shadow:inset 0 0 0 1px #64c9b0}',
    '#stage42Wizard .stage42-selected{outline:3px solid #10b981;outline-offset:-3px;background:#d1fae5!important}',
    '#stage42Wizard .stage42-steps{display:flex;gap:6px;max-height:190px;overflow:auto;padding:2px}',
    '#stage42Wizard .stage42-step{flex:0 0 158px;text-align:left;font-size:12px;min-height:84px}',
    '#stage42Wizard .stage42-step.selected{border:2px solid #069b8a;background:#dbfaf2}',
    '#stage42Wizard .stage42-step small{display:block;color:#64748b;overflow-wrap:anywhere}',
    '#stage42Wizard .stage42-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
    '#stage42Wizard .stage42-fields label{display:block;font-weight:600;font-size:12px;color:#334155}',
    '#stage42Wizard input:not([type=checkbox]),#stage42Wizard textarea,#stage42Wizard select{border:1px solid #b8cbd8;border-radius:8px;padding:8px;width:100%;background:#fff;color:#17263b}',
    '#stage42Wizard textarea{min-height:56px;resize:vertical}',
    '#stage42Wizard .stage42-wide{grid-column:1/-1}',
    '#stage42Wizard .stage42-buttons{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:8px 0}',
    '#stage42Wizard .stage42-primary{background:#08766e!important;color:white!important;border-color:#08766e!important;font-weight:700}',
    '#stage42Wizard .stage42-danger{border-color:#ef9a9a!important;color:#9e1c1c!important}',
    '#stage42Wizard .stage42-images{display:flex;gap:8px;overflow:auto}',
    '#stage42Wizard .stage42-photo{min-width:126px;max-width:150px;background:#f1f5f9;border-radius:9px;padding:6px;font-size:11px}',
    '#stage42Wizard .stage42-photo img{width:100%;height:74px;object-fit:contain;background:white}',
    '#stage42Wizard .stage42-photo button{font-size:11px;margin-top:5px;padding:4px}',
    '#stage42Wizard #stage42ActivePhoto img{max-height:130px;max-width:100%;object-fit:contain}',
    '#stage42Wizard .stage42-warning p{background:#fff8e1;border-left:3px solid #eab308;margin:6px 0;padding:5px}',
    '#stage42Wizard .stage42-topline{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:space-between}',
    '#stage42Wizard .stage42-metadata{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '#stage42Wizard .stage42-metadata label{font-size:11px;font-weight:600}',
    '#stage42Wizard #stage42Welcome{text-align:center;padding:60px 18px}',
    '#stage42Wizard #stage42Welcome button{font-size:18px;padding:13px 25px}',
    '#stage42Wizard #stage42CellInfo{word-break:break-word}',
    '#stage42Wizard footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #cbd5e1;display:flex;gap:9px;justify-content:flex-end;align-items:center;padding:10px 20px;z-index:6;flex-wrap:wrap}',
    '#stage42Wizard footer label{display:flex;align-items:center;gap:7px;font-size:12px}',
    '#stage42Wizard{background:var(--tn-bg,#f5f6f8);color:var(--tn-ink,#18212f);font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.48}',
    '#stage42Wizard header{background:#fff;color:var(--tn-ink,#18212f);border-bottom:1px solid var(--tn-line,#dfe4ea);box-shadow:0 3px 15px rgba(20,31,48,.06);padding:14px 25px}',
    '#stage42Wizard header:after{content:"";position:absolute;left:24px;bottom:0;width:136px;height:3px;background:var(--tn-red,#e30613)}',
    '#stage42Wizard header small{color:var(--tn-muted,#687385)}',
    '#stage42Wizard header strong{color:var(--tn-ink,#18212f);font-weight:750;font-size:20px}',
    '#stage42Wizard .stage42-brand{display:flex;align-items:center;gap:12px}',
    '#stage42Wizard .stage42-brand-icon{width:46px;height:46px;border:1px solid #f4c6cb;background:#fff0f1;border-radius:12px;display:grid;place-items:center;font-size:24px}',
    '#stage42Wizard .stage42-container{padding:16px 24px 72px;max-width:1730px}',
    '#stage42Wizard button{border:1px solid #d1d6df;border-radius:9px;color:#303a4b;min-height:35px;background:#fff;padding:7px 12px;font-weight:550;box-shadow:0 1px 2px rgba(12,23,42,.02)}',
    '#stage42Wizard button:hover:not(:disabled){background:#f6f7f9;border-color:#abb4c0;box-shadow:0 2px 7px rgba(12,23,42,.07)}',
    '#stage42Wizard button:focus-visible,#stage42Wizard td:focus-visible{outline:2px solid var(--tn-red,#e30613);outline-offset:2px}',
    '#stage42Wizard .stage42-primary{background:var(--tn-red,#e30613)!important;color:#fff!important;border:1px solid var(--tn-red,#e30613)!important;box-shadow:0 5px 14px rgba(227,6,19,.13)}',
    '#stage42Wizard .stage42-primary:hover:not(:disabled){background:var(--tn-red-dark,#b8000b)!important;box-shadow:0 7px 16px rgba(227,6,19,.18)}',
    '#stage42Wizard .stage42-primary:disabled{background:#d9dce2!important;border-color:#d9dce2!important;color:#737d8b!important;box-shadow:none}',
    '#stage42Wizard .stage42-card{background:#fff;border:1px solid var(--tn-line,#dfe4ea);box-shadow:0 4px 16px rgba(20,31,48,.045);border-radius:16px;padding:17px 18px}',
    '#stage42Wizard .stage42-result-summary{padding:13px 17px}',
    '#stage42Wizard h3{color:#202a3b;font-size:16px;font-weight:700;margin:0 0 9px}',
    '#stage42Wizard h2{font-size:21px;font-weight:750;color:var(--tn-ink,#18212f)}',
    '#stage42Wizard .stage42-help{font-size:12.5px;line-height:1.5;color:#687385;margin:6px 0 11px}',
    '#stage42Wizard .stage42-step-number{display:inline-grid;place-items:center;background:#fff0f1;border:1px solid #f2c7ca;color:#c3000e;font-weight:700;font-size:14px;width:27px;height:27px;border-radius:50%;margin-right:8px}',
    '#stage42Wizard .stage42-flow{display:flex;align-items:center;gap:18px;flex-wrap:wrap;color:#6b7788}',
    '#stage42Wizard .stage42-flow span{border-bottom:2px solid transparent;padding:7px 1px;font-size:13px;font-weight:600}',
    '#stage42Wizard .stage42-flow span:first-child{color:#bd000d;border-color:var(--tn-red,#e30613)}',
    '#stage42Wizard .stage42-flow-review span:nth-child(2){color:#bd000d;border-color:var(--tn-red,#e30613)}',
    '#stage42Wizard .stage42-toolbar{padding:0 0 7px}',
    '#stage42Wizard .stage42-note{color:#717c8d;font-size:12px}',
    '#stage42Wizard #stage42Status{color:#245f48;font-size:13px;margin:4px 0 11px;min-height:19px}',
    '#stage42Wizard .stage42-counter{background:#fff0f1;color:#b8000b;padding:7px 13px;border-radius:100px;font-weight:750;white-space:nowrap}',
    '#stage42Wizard .stage42-main{grid-template-columns:minmax(430px,1.10fr) minmax(410px,1fr);gap:16px}',
    '#stage42Wizard .stage42-sticky{top:88px}',
    '#stage42Wizard .stage42-sheet-row{display:flex;align-items:end;gap:8px;margin:2px 0}',
    '#stage42Wizard .stage42-sheet-label{min-width:240px;flex:1;color:#334155;font-size:12px;font-weight:700}',
    '#stage42Wizard .stage42-sheet-label select{margin-top:5px}',
    '#stage42Wizard .stage42-sheet-advice{padding:9px 12px;background:#f0f7fb;border-left:3px solid #749ec3;border-radius:7px;color:#315e7e}',
    '#stage42Wizard .stage42-sheet-advice.stage42-needs-mapping{background:#fff4f1;border-color:#e30613;color:#8e2633}',
    '#stage42Wizard .stage42-grid{font-size:12.6px;min-width:880px}',
    '#stage42Wizard .stage42-grid td,#stage42Wizard .stage42-grid th{padding:8px 7px;line-height:1.5;border-color:#e0e5ed}',
    '#stage42Wizard .stage42-grid th{background:#eff2f6}',
    '#stage42Wizard .stage42-grid td:hover{background:#fff1f2}',
    '#stage42Wizard .stage42-grid .stage42-selected{outline-color:#e30613;background:#fff3f4!important}',
    '#stage42Wizard .stage42-grid .stage42-linked{box-shadow:inset 0 0 0 1px #d47882}',
    '#stage42Wizard .stage42-grid .stage42-merged{background:#f6f7fa;border-color:#d8dee7!important}',
    '#stage42Wizard .stage42-scroll{max-height:50vh;border:1px solid #dfe4eb;border-radius:10px;scrollbar-color:#c9d1dc transparent}',
    '#stage42Wizard .stage42-cell-preview{padding:9px 10px;background:#f6f8fa;border-radius:8px;min-height:36px}',
    '#stage42Wizard .stage42-map-panel{background:#f7f8fa;border:1px solid #e3e8ee;border-radius:10px;padding:12px 14px;margin-top:9px}',
    '#stage42Wizard .stage42-map-panel .stage42-note{margin:3px 0 9px}',
    '#stage42Wizard .stage42-map-panel .stage42-buttons{margin-bottom:0}',
    '#stage42Wizard .stage42-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-height:214px;overflow:auto;gap:8px;margin:8px 0}',
    '#stage42Wizard .stage42-step{min-width:0;min-height:88px;border-left:4px solid #c5ccd5;text-align:left;padding:10px 12px;font-size:12px}',
    '#stage42Wizard .stage42-step.selected{background:#fff5f5;border:1px solid #e30613;border-left:4px solid #e30613}',
    '#stage42Wizard .stage42-step small{line-height:1.42}',
    '#stage42Wizard .stage42-empty{border:1px dashed #ee9399;background:#fff9f9;padding:16px;border-radius:12px;margin:10px 0;color:#8f2d35}',
    '#stage42Wizard .stage42-empty p{margin:8px 0 12px;color:#64748b;line-height:1.5}',
    '#stage42Wizard .stage42-moment-panel{border:1px solid #e2e6ec;background:#fafbfc;border-radius:10px;padding:11px 13px}',
    '#stage42Wizard .stage42-moment-list{display:grid;gap:10px;margin:9px 0}',
    '#stage42Wizard .stage42-moment-item{display:grid;grid-template-columns:1fr auto;align-items:start;gap:5px 8px}',
    '#stage42Wizard .stage42-moment-item label{grid-column:1/-1;font-weight:700;color:#435166}',
    '#stage42Wizard .stage42-moment-item textarea{width:100%;min-height:62px;resize:vertical;line-height:1.5}',
    '#stage42Wizard .stage42-moment-item button{width:36px;min-height:36px;color:#b91c1c;border-color:#f1caca}',
    '#stage42Wizard #stage42AddMoment{font-weight:650;color:#b8000b;border-color:#f2c9ce;background:white}',
    '#stage42Wizard .stage42-fields{gap:12px;margin-top:12px}',
    '#stage42Wizard .stage42-fields label{font-size:12.5px;color:#475569}',
    '#stage42Wizard input:not([type=checkbox]),#stage42Wizard textarea,#stage42Wizard select{border:1px solid #d0d8e3;border-radius:9px;padding:9px 10px;background:#fff;color:#1e293b}',
    '#stage42Wizard input:focus,#stage42Wizard textarea:focus,#stage42Wizard select:focus{border-color:#e30613!important;box-shadow:0 0 0 3px rgba(227,6,19,.08)!important;outline:none}',
    '#stage42Wizard .stage42-warning p{background:#fff9ee;border-left:3px solid #e8aa44;padding:7px 10px;color:#8b622c;border-radius:4px}',
    '#stage42Wizard .stage42-photo{background:#f7f8fa;border:1px solid #e2e6ec;border-radius:10px;padding:9px;min-width:152px;max-width:180px}',
    '#stage42Wizard .stage42-photo img{height:96px}',
    '#stage42Wizard footer{background:#fff;border-top:1px solid #e2e6ec;box-shadow:0 -4px 12px rgba(20,31,48,.05);padding:11px 24px}',
    '#stage42Wizard footer label{color:#475569;font-size:12.5px}',
    '#stage42Wizard #stage42Apply{min-height:42px;font-size:14px;padding:10px 19px}',
    '#stage42Wizard #stage42Welcome{background:linear-gradient(135deg,#fff,#fff7f8);max-width:790px;margin:5vh auto;padding:56px 35px;border-color:#f0d4d7}',
    '#stage42Wizard #stage42WelcomePick{margin-top:17px}',
    '@media(max-width:1100px){#stage42Wizard .stage42-main{grid-template-columns:1fr}#stage42Wizard .stage42-sticky{position:static}#stage42Wizard .stage42-metadata{grid-template-columns:repeat(2,1fr)}}',
    '@media(max-width:1000px){#stage42Wizard .stage42-main{grid-template-columns:1fr}#stage42Wizard .stage42-sticky{position:static}#stage42Wizard .stage42-metadata{grid-template-columns:repeat(2,1fr)}}'
  ].join('\n');
  document.head.appendChild(style);
}
function stage42Init(){
  if(stage42El('stage42Wizard'))return;
  stage42Style();
  const host=document.createElement('div');host.id='stage42Wizard';host.hidden=true;
  host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');
  host.setAttribute('aria-label','Мастер импорта готовых СОП');
  host.innerHTML=[
    '<header><div class="stage42-brand"><span class="stage42-brand-icon">📂</span>',
    '<div><strong>Импорт готовых СОП из Excel</strong>',
    '<small>Конструктор СОП · Stage42 · проверка данных перед загрузкой</small></div></div>',
    '<button id="stage42Close" type="button">✕ Закрыть мастер</button></header>',
    '<div class="stage42-container">',
    '<div class="stage42-topline stage42-toolbar"><div class="stage42-flow" id="stage42Flow">',
    '<span>① Выберите файл</span><span>② Проверьте результат</span>',
    '<span>③ Загрузите в редактор</span>',
    '</div><div><button type="button" id="stage42PickFile">📂 Другой файл XLSX</button>',
    '<input type="file" id="stage42Input" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></div></div>',
    '<div id="stage42Status" role="status"></div>',
    '<div id="stage42Welcome" class="stage42-card">',
    '<h2>Загрузите готовую СОП из Excel</h2>',
    '<p>Мастер найдёт действия, ключевые моменты, причины и фотографии.',
    ' Вы увидите их рядом с исходной таблицей и сможете всё проверить.</p>',
    '<p class="stage42-note">До нажатия кнопки загрузки открытая СОП не изменяется.',
    ' Файл обрабатывается локально, без обращения к ИИ.</p>',
    '<button type="button" id="stage42WelcomePick" class="stage42-primary">📂 Выбрать файл Excel</button></div>',
    '<div id="stage42Review" hidden>',
    '<div class="stage42-card stage42-result-summary"><div class="stage42-topline">',
    '<div><strong id="stage42FileInfo"></strong><p class="stage42-note">Проверяйте текст и фотографии перед переносом в редактор СОП.</p></div>',
    '<span id="stage42Count" class="stage42-counter"></span></div>',
    '<div id="stage42Warnings" class="stage42-warning"></div>',
    '<details><summary>Реквизиты исходной СОП (можно исправить)</summary>',
    '<div class="stage42-metadata" id="stage42Meta">',
    ...[
      ['operation','Операция'],['sopNumber','Номер СОП'],['branch','Филиал/организация'],
      ['department','Подразделение'],['workplace','Рабочее место'],['executor','Исполнитель'],
      ['date','Дата'],['approverPost','Должность утверждающего'],['approverName','ФИО утверждающего'],
      ['tools','Инструменты'],['material','Материалы'],['safety','Требования безопасности']
    ].map(([key,title])=>'<label>'+stage42Esc(title)+
      '<input data-stage42-meta="'+key+'" type="text"></label>'),
    '</div></details></div>',
    '<div class="stage42-main" style="margin-top:12px">',
    '<section class="stage42-card stage42-sticky"><h3><span class="stage42-step-number">1</span> Исходный Excel</h3>',
    '<p class="stage42-help">Выберите лист с заполненными действиями, затем нажмите на нужную ячейку.',
    ' Избранный текст можно добавить в шаг справа.</p>',
    '<div class="stage42-buttons stage42-sheet-row"><label class="stage42-sheet-label">Лист с СОП',
    '<select id="stage42Sheet" aria-label="Лист с готовой СОП"></select></label>',
    '<button type="button" id="stage42RescanSheet">↻ Распознать лист</button></div>',
    '<p id="stage42SheetAdvice" class="stage42-help stage42-sheet-advice"></p>',
    '<div class="stage42-buttons stage42-pager">',
    '<button type="button" id="stage42PrevRows">↑ Предыдущие строки</button>',
    '<button type="button" id="stage42NextRows">↓ Следующие строки</button>',
    '<span id="stage42Rows" class="stage42-note"></span></div>',
    '<div id="stage42Grid" class="stage42-scroll"></div>',
    '<p class="stage42-note stage42-cell-preview" id="stage42CellInfo"></p>',
    '<div class="stage42-map-panel"><strong>Выделили нужную ячейку?</strong>',
    '<p class="stage42-note">Для нового действия нажмите «Создать шаг». Чтобы исправить существующий шаг — выберите его справа.</p>',
    '<div class="stage42-buttons">',
    '<button type="button" id="stage42FromCell" class="stage42-primary">＋ Создать шаг из ячейки</button>',
    '<button type="button" data-stage42-use="action">В действие</button>',
    '<button type="button" data-stage42-use="km">＋ КМ</button>',
    '<button type="button" data-stage42-use="reason">В причину</button>',
    '<button type="button" data-stage42-use="criteria">В результат</button>',
    '</div></div></section>',
    '<section class="stage42-card"><div class="stage42-topline"><h3><span class="stage42-step-number">2</span> Распознанные шаги</h3>',
    '<button type="button" id="stage42AddBlankStep">＋ Пустой шаг</button></div>',
    '<p class="stage42-help">Выберите шаг для проверки. Текст ниже можно исправить прямо здесь.',
    ' Для уточнения по оригиналу нажмите ячейку слева.</p>',
    '<div id="stage42EmptyGuide" class="stage42-empty" hidden>',
    '<strong>На этом листе не удалось определить действия.</strong>',
    '<p>Посмотрите список листов слева. Если нужный лист выбран,',
    ' нажмите на ячейку с первым действием и создайте шаг. После этого перенесите КМ и причину.</p>',
    '<button type="button" id="stage42EmptyPick" class="stage42-primary">＋ Создать первый шаг из ячейки</button>',
    '</div>',
    '<div id="stage42Steps" class="stage42-steps"></div>',
    '<div class="stage42-buttons"><button type="button" id="stage42StepUp">← Переместить вверх</button>',
    '<button type="button" id="stage42StepDown">Вниз →</button>',
    '<button type="button" id="stage42StepRemove" class="stage42-danger">Удалить шаг</button></div>',
    '<div id="stage42StepFields" class="stage42-fields">',
    '<label class="stage42-wide">Действие<textarea data-stage42-field="action"></textarea></label>',
    '<div class="stage42-wide stage42-moment-panel">',
    '<div class="stage42-topline"><label>Ключевые моменты — каждый отдельным пунктом</label>',
    '<span id="stage42MomentCount" class="stage42-note"></span></div>',
    '<p class="stage42-help">Нумерация 1., 2., 3. из Excel разделяется автоматически.',
    ' Перенос длинной строки внутри пункта не создаёт новый КМ.</p>',
    '<div id="stage42MomentFields" class="stage42-moment-list"></div>',
    '<button type="button" id="stage42AddMoment">＋ Добавить ключевой момент</button>',
    '</div>',
    '<label class="stage42-wide">Причина — одно поле, допускается нумерация',
    '<textarea rows="3" data-stage42-field="reason"></textarea></label>',
    '<label class="stage42-wide">Критерий результата<textarea data-stage42-field="successCriteria"></textarea></label>',
    '<label>Длительность, секунд<input type="number" min="0" step="1" data-stage42-field="durationSeconds"></label>',
    '<label>Фотография шага<select id="stage42PhotoSelect"></select></label>',
    '<div id="stage42ActivePhoto" class="stage42-wide"></div>',
    '<div id="stage42SourceInfo" class="stage42-wide stage42-note"></div>',
    '</div></section></div>',
    '<section class="stage42-card" style="margin-top:12px"><h3><span class="stage42-step-number">3</span> Фотографии из Excel</h3>',
    '<p class="stage42-help">Проверьте, какие фотографии относятся к шагам. Логотипы и пиктограммы назначать не нужно.</p>',
    '<div id="stage42Media" class="stage42-images"></div></section>',
    '</div></div>',
    '<footer><label id="stage42OmitLabel"><input id="stage42OmitMedia" type="checkbox">',
    ' Не импортировать <b id="stage42UnusedCount">0</b> изображений без привязки (например, логотипы)</label>',
    '<button id="stage42Cancel" type="button">Отмена</button>',
    '<button id="stage42Apply" class="stage42-primary" type="button">✓ Загрузить в Конструктор СОП →</button></footer>'
  ].join('');
  document.body.appendChild(host);
  stage42Wizard.host=host;
  const legacy=stage42El('importSopBtn');
  if(legacy){
    legacy.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      stage42Open();
    },true);
    legacy.title='Открыть мастер импорта XLSX с предпросмотром и корректировкой';
  }
  for(const id of ['stage42Close','stage42Cancel'])
    stage42El(id).addEventListener('click',()=>stage42Close());
  for(const id of ['stage42WelcomePick','stage42PickFile'])
    stage42El(id).addEventListener('click',()=>stage42El('stage42Input').click());
  stage42El('stage42Input').addEventListener('change',event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(file)stage42ReadFile(file);
  });
  stage42El('stage42Apply').addEventListener('click',stage42ConfirmApply);
  stage42El('stage42OmitMedia').addEventListener('change',stage42MarkDirty);
  stage42El('stage42Sheet').addEventListener('change',event=>{
    stage42ChooseSopSheet(event.target.value);
  });
  for(const [id,diff] of [['stage42PrevRows',-24],['stage42NextRows',24]])
    stage42El(id).addEventListener('click',()=>{
      const ws=stage42Wizard.proposal?.wb.getWorksheet(stage42Wizard.sheet);
      if(!ws)return;
      stage42Wizard.startRow=Math.max(1,Math.min(Math.max(1,ws.rowCount),stage42Wizard.startRow+diff));
      stage42RenderGrid();
    });
  stage42El('stage42Grid').addEventListener('click',event=>{
    const td=event.target.closest('[data-stage42-cell]');if(!td)return;
    stage42Wizard.cell={sheet:stage42Wizard.sheet,row:Number(td.dataset.stage42R),col:Number(td.dataset.stage42C)};
    stage42RenderGrid();stage42RenderCellInfo();
  });
  host.addEventListener('click',event=>{
    const use=event.target.closest('[data-stage42-use]');
    if(use)stage42UseCell(use.dataset.stage42Use);
    const target=event.target.closest('[data-stage42-pick-photo]');
    if(target)stage42SetPhoto(Number(target.dataset.stage42PickPhoto));
    const step=event.target.closest('[data-stage42-step]');
    if(step){stage42ShowStep(Number(step.dataset.stage42Step));}
  });
  stage42El('stage42PhotoSelect').addEventListener('change',e=>stage42SetPhoto(Number(e.target.value)));
  stage42El('stage42StepFields').addEventListener('input',e=>{
    const s=stage42CurrentStep();if(!s)return;
    const moment=e.target.closest('[data-stage42-moment]');
    if(moment){
      const index=Number(moment.dataset.stage42Moment);
      if(index>=0&&index<s.keyMoments.length){
        s.keyMoments[index]=moment.value;
        stage42MarkDirty();stage42RenderSteps();
      }
      return;
    }
    const el=e.target.closest('[data-stage42-field]');
    if(!el)return;
    const name=el.dataset.stage42Field;
    if(name==='durationSeconds')s.durationSeconds=el.value===''?0:Number(el.value);
    else if(['action','reason','successCriteria'].includes(name))s[name]=el.value;
    stage42MarkDirty();stage42RenderSteps();
  });
  stage42El('stage42StepFields').addEventListener('paste',e=>{
    const area=e.target.closest('[data-stage42-moment]'),s=stage42CurrentStep();
    if(!area||!s)return;
    const text=e.clipboardData?.getData('text/plain')||'';
    const parts=stage42SplitKeyMoments(text);
    if(parts.length<2)return;
    if(s.keyMoments.length+parts.length-1>60){
      e.preventDefault();
      stage42Info('Вставка содержит слишком много КМ; разделите список на части.',true);
      return;
    }
    e.preventDefault();
    const index=Number(area.dataset.stage42Moment);
    s.keyMoments.splice(index,1,...parts);
    stage42MarkDirty();stage42RenderMomentFields(s);stage42RenderSteps();
    stage42Info('Распознано '+parts.length+' нумерованных КМ. Проверьте каждый пункт.');
  });
  stage42El('stage42StepFields').addEventListener('click',e=>{
    const remove=e.target.closest('[data-stage42-remove-moment]'),s=stage42CurrentStep();
    if(!remove||!s)return;
    const index=Number(remove.dataset.stage42RemoveMoment);
    if(s.keyMoments.length<=1)s.keyMoments=[''];
    else s.keyMoments.splice(index,1);
    stage42MarkDirty();stage42RenderMomentFields(s);stage42RenderSteps();
  });
  stage42El('stage42AddMoment').addEventListener('click',()=>{
    const s=stage42CurrentStep();if(!s)return;
    if(s.keyMoments.length>=60){
      stage42Info('Для одного действия допускается до 60 КМ. Проверьте исходную ячейку.',true);
      return;
    }
    s.keyMoments.push('');
    stage42MarkDirty();stage42RenderMomentFields(s);stage42RenderSteps();
    stage42El('stage42MomentFields').querySelector(
      '[data-stage42-moment="'+(s.keyMoments.length-1)+'"]')?.focus();
  });
  stage42El('stage42Meta').addEventListener('input',e=>{
    const el=e.target.closest('[data-stage42-meta]');
    if(el&&stage42Wizard.proposal){
      stage42Wizard.proposal.meta[el.dataset.stage42Meta]=el.value;
      stage42MarkDirty();
    }
  });
  stage42El('stage42FromCell').addEventListener('click',stage42AddFromCell);
  stage42El('stage42EmptyPick').addEventListener('click',stage42AddFromCell);
  stage42El('stage42RescanSheet').addEventListener('click',()=>{
    const name=stage42El('stage42Sheet').value;
    if(stage42Wizard.proposal?.sourceSheet===name){
      stage42Info('Лист уже распознан. Чтобы изменить шаг, выберите ячейку и используйте кнопки переноса.',false);
    }else stage42ChooseSopSheet(name);
  });
  stage42El('stage42AddBlankStep').addEventListener('click',()=>{
    const p=stage42Wizard.proposal;if(!p)return;
    p.steps.push(stage42MakeStep());stage42Wizard.selectedStep=p.steps.length-1;
    stage42MarkDirty();stage42RenderSteps();stage42RenderStepEditor();
  });
  stage42El('stage42StepRemove').addEventListener('click',()=>{
    const p=stage42Wizard.proposal;if(!p?.steps.length)return;
    p.steps.splice(stage42Wizard.selectedStep,1);
    stage42Wizard.selectedStep=Math.max(0,Math.min(stage42Wizard.selectedStep,p.steps.length-1));
    stage42MarkDirty();stage42RenderSteps();stage42RenderStepEditor();stage42RenderPhotos();
  });
  for(const [id,delta] of [['stage42StepUp',-1],['stage42StepDown',1]])
    stage42El(id).addEventListener('click',()=>{
      const p=stage42Wizard.proposal;if(!p)return;
      const a=stage42Wizard.selectedStep,b=a+delta;
      if(b<0||b>=p.steps.length)return;
      [p.steps[a],p.steps[b]]=[p.steps[b],p.steps[a]];
      stage42Wizard.selectedStep=b;stage42MarkDirty();
      stage42RenderSteps();stage42RenderStepEditor();stage42RenderPhotos();
    });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!host.hidden){e.preventDefault();stage42Close()}
  });
}
// Stage41's accepted editor handles no more than three KM in normalisation.
// Stage42 imports can contain four, five, or more *real numbered points* in
// one action. Preserve them through drafts/library/JSON without changing the
// underlying Stage41 sources; the normal three-KM workflow stays identical.
function stage42EnableFullKeyMomentLists(){
  const acceptedNormalize=normalizeStepShape;
  normalizeStepShape=function stage42NormalizeFullKMs(source){
    const step=acceptedNormalize(source);
    if(Array.isArray(source?.keyMoments)&&source.keyMoments.length>3){
      step.keyMoments=source.keyMoments.map(value=>String(value??''));
    }
    return step;
  };
  // Stage38 exports an isolated Excel snapshot and independently caps its
  // normalized keyMoments at three. Apply the same non-destructive extended
  // list exception to the export *snapshot*, keeping all existing photo
  // and FRV handling intact.
  const acceptedExcelNormalize=normalizeExcelStepKeepingPhoto;
  normalizeExcelStepKeepingPhoto=function stage42ExcelFullKeyMoments(source){
    const step=acceptedExcelNormalize(source);
    if(Array.isArray(source?.keyMoments)&&source.keyMoments.length>3){
      step.keyMoments=source.keyMoments.map(value=>String(value??''));
    }
    return step;
  };
  const acceptedRender=renderSteps;
  renderSteps=function stage42RenderFullKMs(){
    const result=acceptedRender.apply(this,arguments);
    const cards=document.querySelectorAll('#stepsContainer .step-card');
    cards.forEach((card,i)=>{
      const step=state.steps[i];
      if(!step||step.keyMoments.length<3||step.keyMoments.length>=60)return;
      const first=card.querySelector('[data-km="'+step.id+'"]');
      const area=first?.parentElement?.parentElement;
      if(!area||area.querySelector('[data-stage42-add-more-km]'))return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.dataset.stage42AddMoreKm=String(step.id);
      btn.className='text-xs text-red-700 mt-1 font-medium';
      btn.textContent='＋ Добавить КМ';
      btn.addEventListener('click',event=>{
        event.preventDefault();
        if(state.documentManager?.status==='Опубликован'||
           state.documentManager?.status==='Архив')return;
        if(step.keyMoments.length>=60)return;
        step.keyMoments.push('');
        stateChanged();
        renderSteps();
      });
      area.appendChild(btn);
    });
    const label=$('sopVersionLabel');
    if(label)label.textContent='· Stage42 (импорт XLSX)';
    return result;
  };
}
stage42EnableFullKeyMomentLists();
stage42Init();
