// ============================================================
// 2. Generic helpers
// ============================================================
const $=id=>document.getElementById(id);
function escapeHtml(str){const d=document.createElement('div');d.textContent=String(str??'');return d.innerHTML;}
function normText(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
function renderOpenQuestions(){const c=$('openQuestionsContainer'),list=$('openQuestionsList'),count=$('openQuestionsCount');if(!c||!list||!count)return;const qs=Array.isArray(state.openQuestions)?state.openQuestions:[];if(!qs.length){c.classList.add('hidden');list.innerHTML='';count.textContent='0';return;}c.classList.remove('hidden');count.textContent=String(qs.length);list.innerHTML=qs.map((q,i)=>`<div class="flex gap-2"><span class="font-semibold">${i+1}.</span><span>${escapeHtml(q)}</span></div>`).join('')}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
let _toastLastMessage='',_toastLastAt=0;
function toast(msg,type='success'){
  const colors={success:'bg-green-500',error:'bg-red-500',info:'bg-blue-500',warning:'bg-amber-500'},icons={success:'✓',error:'✕',info:'ℹ',warning:'⚠'};
  const host=$('toastContainer');if(!host)return;
  const text=String(msg),now=Date.now();
  if(text===_toastLastMessage&&now-_toastLastAt<1200)return;
  _toastLastMessage=text;_toastLastAt=now;
  while(host.children.length>=3)host.firstElementChild?.remove();
  const t=document.createElement('div');t.className=`toast ${colors[type]||colors.info} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3`;
  t.setAttribute('role',type==='error'?'alert':'status');t.setAttribute('aria-live',type==='error'?'assertive':'polite');
  t.innerHTML=`<span class="text-lg" aria-hidden="true">${icons[type]||'ℹ'}</span><span class="font-medium">${escapeHtml(text)}</span>`;
  host.appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(100%)';setTimeout(()=>t.remove(),300)},3200);
}
function setVal(id,v){if($(id))$(id).value=v??''}
function textLines(text,cpl){if(!text)return 1;return String(text).split('\n').reduce((n,p)=>n+Math.max(1,Math.ceil((p.trim().length||1)/cpl)),0)}
function formatDuration(totalSec){
  const s=Math.max(0,Math.round(Number(totalSec)||0));
  const m=Math.floor(s/60),sec=s%60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function formatHMS(totalSec){
  const s=Math.max(0,Math.round(Number(totalSec)||0));
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function parseDuration(v){
  if(typeof v==='number'&&Number.isFinite(v)) return Math.max(0,Math.round(v));
  const s=String(v??'').trim();
  if(!/^\d{1,4}:\d{2}$/.test(s)) return 0;
  const [m,sec]=s.split(':').map(Number);
  if(!Number.isFinite(m)||!Number.isFinite(sec)||sec>59) return 0;
  return Math.max(0,m*60+sec);
}
function normalizeTimeString(v){return formatDuration(parseDuration(v))}
function htmlFieldToState(){state.meta={branch:$('meta-branch').value.trim(),date:$('meta-date').value,department:$('meta-department').value.trim(),workplace:$('meta-workplace').value.trim(),executor:$('meta-executor').value.trim(),operation:$('meta-operation').value.trim(),sopNumber:$('meta-sop-number').value.trim(),safety:$('meta-safety').value.trim(),tools:$('meta-tools').value.trim(),material:$('meta-material').value.trim(),approverPost:$('meta-approver-post').value.trim(),approverName:$('meta-approver-name').value.trim()};state.description=$('meta-description').value;state.frvMeta={observers:$('frv-observers').value,quality:$('frv-quality').value,other:$('frv-other').value,purpose:$('frv-purpose').value,tOp:$('frv-t-op').value,tVdc:$('frv-t-vdc').value,tM2:$('frv-t-m2').value,tM1:$('frv-t-m1').value,tMove:$('frv-t-move').value,tArea:$('frv-t-area').value,tIn:$('frv-t-in').value,tOut:$('frv-t-out').value};recalcTotalTime()}
function stateToHtml(){renderOpenQuestions();Object.entries(state.meta).forEach(([k,v])=>{const id='meta-'+({sopNumber:'sop-number',approverPost:'approver-post',approverName:'approver-name'}[k]||k);setVal(id,v)});setVal('meta-description',state.description);setVal('meta-total-time',formatDuration(state.totalTimeSeconds));Object.entries(state.frvMeta).forEach(([k,v])=>setVal('frv-'+({tOp:'t-op',tVdc:'t-vdc',tM2:'t-m2',tM1:'t-m1',tMove:'t-move',tArea:'t-area',tIn:'t-in',tOut:'t-out'}[k]||k),v));renderIconPicker();renderResponsibles();renderAgreed();renderSteps();renderFrv();renderChecklist();renderTwi();applyDocumentLock()} 
function applyDocumentLock(){
  const status=String(state.documentManager?.status||'Черновик');
  const locked=status==='Опубликован'||status==='Архив';
  document.body.classList.toggle('document-readonly',locked);
  const banner=$('documentLockBanner'),title=$('documentLockTitle'),text=$('documentLockText'),newBtn=$('documentLockNewVersionBtn');
  if(banner){banner.classList.toggle('hidden',!locked);banner.classList.toggle('archive',status==='Архив');if(title)title.textContent=status==='Архив'?'🗄 Документ находится в архиве':'🔒 Опубликованный документ защищён от редактирования';if(text)text.textContent=status==='Архив'?'Архивная версия доступна только для просмотра и экспорта XLSX.':'Версия зафиксирована. Для внесения изменений создайте новую версию.';if(newBtn)newBtn.classList.toggle('hidden',status!=='Опубликован')}
  const editableSelectors='#tab-editor input,#tab-editor textarea,#tab-editor select,#tab-frv input,#tab-frv textarea,#tab-frv select,#tab-frvstudy input,#tab-frvstudy textarea,#tab-frvstudy select,#tab-twi input,#tab-twi textarea,#tab-twi select,#tab-checklist input,#tab-checklist textarea,#tab-checklist select';
  document.querySelectorAll(editableSelectors).forEach(el=>{if(locked){el.disabled=true;el.setAttribute('aria-disabled','true')}else{el.disabled=false;el.removeAttribute('aria-disabled')}});
  const blockedIds=['generateSopBtn','addStepBtn','loadDemoBtn','importSopBtn','importSopInput','frvStudyBuildBtn','frvStudyAnalyzeBtn','frvStudyValidateBtn','frvStudyAddCycleBtn','frvStudyMakeSokBtn','frvStudySendSopBtn','generateTwiBtn','clearTwiBtn','docSaveDraftBtn','docPublishBtn'];
  blockedIds.forEach(id=>{const el=$(id);if(!el)return;if(locked){el.disabled=true;el.setAttribute('aria-disabled','true')}else{el.disabled=false;el.removeAttribute('aria-disabled')}});
  document.querySelectorAll('#stepsContainer button,[data-ai],[data-ai-km],[data-hint-photo],[data-remove],[data-add-km],[data-rm-km],[data-rm-photo],[data-rm-resp],[data-rma]').forEach(el=>{if(locked){el.disabled=true;el.setAttribute('aria-disabled','true')}else{el.disabled=false;el.removeAttribute('aria-disabled')}});
  ['docDownloadJsonBtn','docDownloadXlsxBtn','docArchiveBtn','docNewVersionCurrentBtn','refreshPreviewBtn','reviewSopBtn','aiTestBtn','closeReviewBtn'].forEach(id=>{const el=$(id);if(el){el.disabled=false;el.removeAttribute('aria-disabled')}});
}

function recalcTotalTime(){state.totalTimeSeconds=state.steps.reduce((s,st)=>s+(Number(st.durationSeconds)||0),0);setVal('meta-total-time',formatDuration(state.totalTimeSeconds))}
function createEmptyStep(){return{id:++stepIdCounter,action:'',keyMoments:[''],reason:'',durationSeconds:0,successCriteria:'',decisionPoints:[],commonPitfalls:[],visualMarkers:[],photoHint:'',imageData:null,imageBuffer:null,imageExt:null,hasPhoto:false,photoEdited:false,photoAnnotations:[],frv:{vdc:false,m2:'',m1:'',move:'',comment:''}}}

