async function openIllustrationEditor(stepId){
  const step=state.steps.find(x=>x.id===stepId);if(!step?.imageData&&!step?.hasPhoto)return toast('Сначала загрузите иллюстрацию','info');
  const existingRec=await idbGetPhoto(stepId);
  const baseBlob=existingRec?.blob || (step.imageData?await dataUrlToBlob(step.imageData):null);
  if(!baseBlob)return toast('Не удалось открыть исходную фотографию','error');
  const baseDataUrl=await blobToDataUrl(baseBlob);
  document.getElementById('illustrationEditorOverlay')?.remove();

  const overlay=document.createElement('div');
  overlay.id='illustrationEditorOverlay';
  const previouslyFocused=document.activeElement;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Редактор разметки фотографии');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.80);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
  overlay.innerHTML=`<div style="background:#fff;border-radius:14px;max-width:1280px;width:100%;max-height:97vh;overflow:auto;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.38)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:9px">
      <div><b>Оформление иллюстрации — СОП</b><div id="illModeHelp" style="font-size:12px;color:#64748b;margin-top:3px">Выделяйте важные элементы коротко и однозначно: рамка → стрелка/цифра → подпись при необходимости. Пометки сохраняются отдельно, исходное фото не перезаписывается.</div></div>
      <button id="illClose" style="border:0;background:#f1f5f9;border-radius:8px;padding:6px 10px;cursor:pointer">✕</button>
    </div>

    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:8px;padding:9px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px">
      <span style="font-size:12px;font-weight:700;color:#334155">Добавить:</span>
      <button type="button" data-ill-mode="select" class="ill-tool">✥ Выделить</button>
      <button type="button" data-ill-mode="rect" class="ill-tool">▭ Рамка</button>
      <button type="button" data-ill-mode="arrow" class="ill-tool">➜ Стрелка</button>
      <button type="button" data-ill-mode="badge" class="ill-tool">① Цифра</button>
      <button type="button" data-ill-mode="label" class="ill-tool">🏷 Подпись</button>
      <button type="button" data-ill-mode="callout" class="ill-tool">✳ Выноска</button>
      <span style="height:26px;border-left:1px solid #cbd5e1;margin:0 2px"></span>
      <span style="font-size:12px;font-weight:700;color:#334155">Значок:</span>
      <button type="button" data-ill-icon="check" class="ill-tool">✓ Готово</button>
      <button type="button" data-ill-icon="warning" class="ill-tool">! Важно</button>
      <button type="button" data-ill-icon="stop" class="ill-tool">× Нельзя</button>
      <button type="button" data-ill-icon="info" class="ill-tool">i Инфо</button>
      <button type="button" data-ill-icon="click" class="ill-tool">⌖ Нажать</button>
      <button type="button" data-ill-icon="search" class="ill-tool">⌕ Найти</button>
    </div>

    <div style="display:grid;grid-template-columns:minmax(280px,1fr) auto;gap:8px;margin-bottom:8px">
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:9px;border:1px solid #e2e8f0;background:#fff;border-radius:10px">
        <span style="font-size:12px;color:#64748b">Текст:</span>
        <input id="illTextInput" type="text" placeholder="Короткая подпись: что нажать / выбрать / проверить" style="min-width:260px;flex:1 1 300px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px">
        <span style="font-size:12px;color:#64748b">Шаблоны:</span>
        <button type="button" data-ill-template="Нажать кнопку" class="ill-mini">Нажать</button>
        <button type="button" data-ill-template="Выбрать значение" class="ill-mini">Выбрать</button>
        <button type="button" data-ill-template="Заполнить поле" class="ill-mini">Заполнить</button>
        <button type="button" data-ill-template="Проверить заполнение" class="ill-mini">Проверить</button>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:9px;border:1px solid #e2e8f0;background:#fff;border-radius:10px">
        <span style="font-size:12px;color:#64748b">Стиль:</span>
        <select id="illColor" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px">
          <option value="#e30613">Красный — акцент</option><option value="#f59e0b">Оранжевый — внимание</option><option value="#0284c7">Синий — информация</option><option value="#111827">Чёрный — нейтральный</option>
        </select>
        <select id="illLineStyle" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px"><option value="solid">Сплошная</option><option value="dashed">Пунктир</option></select>
        <select id="illLineWidth" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px"><option value="0.8">Тонкая</option><option value="1" selected>Средняя</option><option value="1.4">Толстая</option></select>
        <button id="illApplyStyle" class="ill-mini">Применить к выбранным</button>
      </div>
    </div>

    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:8px;padding:9px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px">
      <span style="font-size:12px;font-weight:700;color:#334155">Выбранные:</span>
      <span id="illSelectedInfo" style="font-size:12px;color:#64748b">0</span>
      <button id="illDuplicate" class="ill-mini">⧉ Копировать</button>
      <button id="illDeleteSelected" class="ill-mini" style="color:#991b1b;border-color:#fecaca">🗑 Удалить</button>
      <span style="height:26px;border-left:1px solid #cbd5e1;margin:0 2px"></span>
      <button id="illAlignLeft" class="ill-mini">⇤ По левому</button>
      <button id="illAlignCenterX" class="ill-mini">↔ По центру X</button>
      <button id="illAlignTop" class="ill-mini">⇡ По верхнему</button>
      <button id="illAlignCenterY" class="ill-mini">↕ По центру Y</button>
      <button id="illDistributeX" class="ill-mini">⋯ Распределить X</button>
      <button id="illDistributeY" class="ill-mini">⋮ Распределить Y</button>
      <span style="height:26px;border-left:1px solid #cbd5e1;margin:0 2px"></span>
      <button id="illResetNumbers" class="ill-mini">Сбросить нумерацию</button>
      <span style="font-size:11px;color:#64748b">Shift+клик — выбрать несколько объектов</span>
    </div>

    <style>
      #illustrationEditorOverlay .ill-tool,#illustrationEditorOverlay .ill-mini{padding:6px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;color:#111827}
      #illustrationEditorOverlay .ill-tool:hover,#illustrationEditorOverlay .ill-mini:hover{background:#f8fafc;border-color:#94a3b8}
      #illustrationEditorOverlay .ill-tool[data-active="1"]{background:#e0f2fe;border-color:#0284c7;color:#0c4a6e;font-weight:700}
    </style>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px;text-align:center"><canvas id="illCanvas" style="max-width:100%;height:auto;cursor:default;background:#fff;touch-action:none"></canvas></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button id="illUndo" class="ill-mini">↶ Убрать последний объект</button>
      <button id="illClear" class="ill-mini">Очистить все пометки</button>
      <button id="illSave" style="padding:9px 14px;border:0;border-radius:8px;background:#10b981;color:#fff;cursor:pointer;font-size:12px;font-weight:700">✓ Сохранить иллюстрацию</button>
      <button id="illCancel" class="ill-mini">Отмена</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const canvas=overlay.querySelector('#illCanvas'),ctx=canvas.getContext('2d'),img=new Image();
  await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=baseDataUrl});
  const sc=Math.min(1,1040/img.naturalWidth,680/img.naturalHeight);canvas.width=Math.max(1,Math.round(img.naturalWidth*sc));canvas.height=Math.max(1,Math.round(img.naturalHeight*sc));

  const DARK='#1f2937',WHITE='#fff',SELECT='#0ea5e9';
  const baseLineW=Math.max(3,Math.round(canvas.width/320));
  const shapes=sanitizeIllustrationAnnotations(existingRec?.annotations || step.photoAnnotations || []);
  const selected=new Set();
  let primary=-1, mode='select', iconKind=null, start=null, preview=null, dragState=null, nextNumber=1;
  const textInput=overlay.querySelector('#illTextInput'),help=overlay.querySelector('#illModeHelp'),selectedInfo=overlay.querySelector('#illSelectedInfo');
  const colorInput=overlay.querySelector('#illColor'),lineStyleInput=overlay.querySelector('#illLineStyle'),lineWidthInput=overlay.querySelector('#illLineWidth');
  const modeButtons=[...overlay.querySelectorAll('[data-ill-mode]')],iconButtons=[...overlay.querySelectorAll('[data-ill-icon]')];

  const modeHelp={select:'Выделение: обычный клик выбирает один объект, Shift+клик добавляет/убирает объект из группы. Перетаскивание двигает выбранные пометки вместе.',rect:'Рамка: протяните мышью по важной области.',arrow:'Стрелка: протяните мышью к точке внимания.',badge:'Цифра: щёлкните в нужном месте.',label:'Подпись: введите короткий текст и щёлкните по месту.',callout:'Выноска: введите текст и протяните от важной точки к месту подписи.',icon:'Значок: щёлкните в нужном месте. Используйте только если он действительно улучшает понимание шага.'};
  const currentStyle=()=>({color:colorInput.value||'#e30613',dash:lineStyleInput.value==='dashed',widthScale:Number(lineWidthInput.value)||1});
  const styleOf=s=>({color:s.color||'#e30613',dash:!!s.dash,widthScale:Number(s.widthScale)||1});
  function applyStyle(s,st=currentStyle()){s.color=st.color;s.dash=st.dash;s.widthScale=st.widthScale}
  function lineWidth(s){return baseLineW*(Number(s?.widthScale)||1)}
  function getPointer(e){const b=canvas.getBoundingClientRect(),sx=canvas.width/b.width,sy=canvas.height/b.height;return{x:(e.clientX-b.left)*sx,y:(e.clientY-b.top)*sy}}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function normalizeRect(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}}
  function getText(){return String(textInput.value||'').trim()}
  function cloneShape(s){const c=JSON.parse(JSON.stringify(s));delete c._box;delete c._handle;delete c._radius;delete c._join;return c}
  function recomputeNumbers(){const nums=shapes.filter(s=>s.n!=null).map(s=>Number(s.n)||0);nextNumber=(nums.length?Math.max(...nums):0)+1}
  function wrapText(text,maxW,font){ctx.save();if(font)ctx.font=font;const pars=String(text||'').split(/\n+/).map(v=>v.trim()).filter(Boolean),lines=[];pars.forEach(p=>{const words=p.split(/\s+/).filter(Boolean);let line='';words.forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width<=maxW||!line)line=t;else{lines.push(line);line=w}});if(line)lines.push(line)});ctx.restore();return lines.length?lines:['']}
  function labelMetrics(item){const padX=10,padY=8,maxW=clamp(item.maxW||Math.min(260,canvas.width*.34),90,Math.min(430,canvas.width*.72)),font=`600 ${Math.max(12,Math.round(canvas.width/70))}px Arial`;ctx.save();ctx.font=font;const lines=wrapText(item.text,maxW,font),lineH=Math.max(16,Math.round(canvas.width/55)),widths=lines.map(t=>ctx.measureText(t).width),boxW=Math.min(maxW,Math.max(70,...widths))+padX*2,boxH=lines.length*lineH+padY*2;ctx.restore();return{padX,padY,maxW,font,lines,lineH,boxW,boxH}}
  function setDash(s){ctx.setLineDash(s?.dash?[8,5]:[])}
  function drawArrow(x1,y1,x2,y2,s={}){const st=styleOf(s),w=lineWidth(s),head=Math.max(12,w*3.6),angle=Math.atan2(y2-y1,x2-x1);ctx.save();ctx.strokeStyle=st.color;ctx.fillStyle=st.color;ctx.lineWidth=w;ctx.lineCap='round';setDash(s);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-head*Math.cos(angle-Math.PI/8),y2-head*Math.sin(angle-Math.PI/8));ctx.lineTo(x2-head*Math.cos(angle+Math.PI/8),y2-head*Math.sin(angle+Math.PI/8));ctx.closePath();ctx.fill();ctx.restore()}
  function drawBadge(item){const r=Math.max(14,Math.round(canvas.width/45)),st=styleOf(item);item._radius=r;ctx.save();ctx.fillStyle=st.color;ctx.beginPath();ctx.arc(item.x,item.y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=WHITE;ctx.lineWidth=Math.max(2,Math.round(r/5));ctx.stroke();ctx.fillStyle=WHITE;ctx.font=`700 ${Math.round(r*.95)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(item.n),item.x,item.y+.5);ctx.restore()}
  function drawLabel(item){const m=labelMetrics(item),st=styleOf(item);let x=item.x,y=item.y;if(x+m.boxW>canvas.width-6)x=canvas.width-m.boxW-6;if(y+m.boxH>canvas.height-6)y=canvas.height-m.boxH-6;x=Math.max(6,x);y=Math.max(6,y);item.x=x;item.y=y;item.maxW=m.maxW;item._box={x,y,w:m.boxW,h:m.boxH};item._handle={x:x+m.boxW,y:y+m.boxH};ctx.save();ctx.fillStyle='rgba(255,255,255,.97)';ctx.strokeStyle=st.color;ctx.lineWidth=Math.max(2,lineWidth(item)*.75);setDash(item);ctx.beginPath();const r=8;ctx.moveTo(x+r,y);ctx.lineTo(x+m.boxW-r,y);ctx.quadraticCurveTo(x+m.boxW,y,x+m.boxW,y+r);ctx.lineTo(x+m.boxW,y+m.boxH-r);ctx.quadraticCurveTo(x+m.boxW,y+m.boxH,x+m.boxW-r,y+m.boxH);ctx.lineTo(x+r,y+m.boxH);ctx.quadraticCurveTo(x,y+m.boxH,x,y+m.boxH-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=DARK;ctx.textAlign='left';ctx.textBaseline='top';ctx.font=m.font;m.lines.forEach((t,i)=>ctx.fillText(t,x+m.padX,y+m.padY+i*m.lineH));ctx.restore();return item._box}
  function drawIcon(item){const r=Math.max(16,Math.round(canvas.width/42)),x=item.x,y=item.y,k=item.iconKind;item._radius=r;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(3,r*.17);if(k==='check'){ctx.strokeStyle='#16a34a';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r*.55,y);ctx.lineTo(x-r*.12,y+r*.42);ctx.lineTo(x+r*.62,y-r*.48);ctx.stroke()}else if(k==='warning'){ctx.strokeStyle='#f59e0b';ctx.fillStyle='rgba(245,158,11,.10)';ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.9,y+r*.75);ctx.lineTo(x-r*.9,y+r*.75);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#b45309';ctx.font=`700 ${Math.round(r*1.15)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x,y+r*.18)}else if(k==='stop'){ctx.strokeStyle='#dc2626';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r*.6,y-r*.6);ctx.lineTo(x+r*.6,y+r*.6);ctx.moveTo(x+r*.6,y-r*.6);ctx.lineTo(x-r*.6,y+r*.6);ctx.stroke()}else if(k==='info'){ctx.strokeStyle='#0284c7';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#0284c7';ctx.font=`700 ${Math.round(r*1.2)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('i',x,y+.5)}else if(k==='click'){ctx.strokeStyle='#2563eb';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r*.05,y-r*.62);ctx.lineTo(x-r*.05,y+r*.28);ctx.moveTo(x-r*.28,y-r*.12);ctx.lineTo(x+r*.38,y-r*.12);ctx.stroke();ctx.beginPath();ctx.moveTo(x+r*.38,y-r*.12);ctx.lineTo(x+r*.18,y-r*.30);ctx.moveTo(x+r*.38,y-r*.12);ctx.lineTo(x+r*.18,y+.06);ctx.stroke()}else{ctx.strokeStyle='#7c3aed';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r*.55,y);ctx.lineTo(x+r*.55,y);ctx.moveTo(x,y-r*.55);ctx.lineTo(x,y+r*.55);ctx.stroke()}ctx.restore()}
  function drawCallout(item){drawArrow(item.x1,item.y1,item.x2,item.y2,item);const anchorX=item.labelX??item.x2+12,anchorY=item.labelY??item.y2-8;const label={type:'label',x:anchorX,y:anchorY,text:`${item.n}. ${item.text}`,maxW:item.maxW,color:item.color,dash:item.dash,widthScale:item.widthScale};const box=drawLabel(label);item.labelX=label.x;item.labelY=label.y;item.maxW=label.maxW;item._box=box;item._handle=label._handle;ctx.save();ctx.strokeStyle=styleOf(item).color;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(item.x2,item.y2);ctx.lineTo(label.x,label.y+Math.min(18,box.h/2));ctx.stroke();ctx.restore()}
  function drawRect(item){const st=styleOf(item);ctx.save();ctx.strokeStyle=st.color;ctx.lineWidth=lineWidth(item);setDash(item);ctx.strokeRect(item.x,item.y,item.w,item.h);ctx.restore()}
  function drawSelection(item){const b=bounds(item);ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle=SELECT;ctx.lineWidth=2;ctx.strokeRect(b.x-4,b.y-4,b.w+8,b.h+8);ctx.setLineDash([]);ctx.fillStyle=SELECT;if((item.type==='label'||item.type==='callout')&&item._handle)ctx.fillRect(item._handle.x-4,item._handle.y-4,8,8);ctx.restore()}
  function drawShape(item){if(item.type==='rect')drawRect(item);else if(item.type==='arrow')drawArrow(item.x1,item.y1,item.x2,item.y2,item);else if(item.type==='badge')drawBadge(item);else if(item.type==='label')drawLabel(item);else if(item.type==='callout')drawCallout(item);else if(item.type==='icon')drawIcon(item)}
  function bounds(s){if(s.type==='rect')return{x:s.x,y:s.y,w:s.w,h:s.h};if(s.type==='arrow')return{x:Math.min(s.x1,s.x2),y:Math.min(s.y1,s.y2),w:Math.abs(s.x2-s.x1)||1,h:Math.abs(s.y2-s.y1)||1};if(s.type==='badge'||s.type==='icon'){const r=s._radius||18;return{x:s.x-r,y:s.y-r,w:r*2,h:r*2}}if(s.type==='label'||s.type==='callout'){if(!s._box){if(s.type==='label')drawLabel(s);else drawCallout(s)}return s._box||{x:s.x||0,y:s.y||0,w:20,h:20}}return{x:0,y:0,w:0,h:0}}
  function draw(){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);shapes.forEach(drawShape);if(preview)drawShape(preview);selected.forEach(i=>{if(shapes[i])drawSelection(shapes[i])});updateSelectedInfo()}
  function addShape(s){applyStyle(s);shapes.push(s);selected.clear();primary=shapes.length-1;selected.add(primary);if(s.n!=null)recomputeNumbers();draw()}
  function lineDistance(p,a,b){const A=p.x-a.x,B=p.y-a.y,C=b.x-a.x,D=b.y-a.y,d=C*C+D*D||1,t=clamp((A*C+B*D)/d,0,1),x=a.x+t*C,y=a.y+t*D;return Math.hypot(p.x-x,p.y-y)}
  function hitTest(p){const threshold=10;for(let i=shapes.length-1;i>=0;i--){const s=shapes[i];if((s.type==='label'||s.type==='callout')&&s._handle&&Math.abs(p.x-s._handle.x)<=8&&Math.abs(p.y-s._handle.y)<=8)return{index:i,part:'resize'};const b=bounds(s);if(s.type==='arrow'){if(lineDistance(p,{x:s.x1,y:s.y1},{x:s.x2,y:s.y2})<=threshold)return{index:i,part:'move'}}else if(p.x>=b.x-threshold&&p.x<=b.x+b.w+threshold&&p.y>=b.y-threshold&&p.y<=b.y+b.h+threshold)return{index:i,part:'move'}}return null}
  function moveShape(s,dx,dy){if(s.type==='rect'){s.x+=dx;s.y+=dy}else if(s.type==='arrow'){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy}else if(s.type==='badge'||s.type==='icon'){s.x+=dx;s.y+=dy}else if(s.type==='label'){s.x+=dx;s.y+=dy}else if(s.type==='callout'){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy;s.labelX=(s.labelX??s.x2)+dx;s.labelY=(s.labelY??s.y2)+dy}}
  function resizeShape(s,p){if(s.type==='label')s.maxW=clamp(p.x-s.x-20,90,Math.min(430,canvas.width*.72));else if(s.type==='callout')s.maxW=clamp(p.x-(s.labelX??s.x2)-20,90,Math.min(430,canvas.width*.72))}
  function updateSelectedInfo(){selectedInfo.textContent=`${selected.size} объект(а)`}
  function syncText(){const s=shapes[primary];if(s&&(s.type==='label'||s.type==='callout'))textInput.value=s.text||''}
  function selectHit(hit,additive){if(!hit){if(!additive){selected.clear();primary=-1}draw();return}if(additive){if(selected.has(hit.index)){selected.delete(hit.index);if(primary===hit.index)primary=[...selected].at(-1)??-1}else{selected.add(hit.index);primary=hit.index}}else{selected.clear();selected.add(hit.index);primary=hit.index}syncText();draw()}
  function duplicateSelected(){if(!selected.size)return toast('Сначала выделите объект','info');const ids=[...selected].sort((a,b)=>a-b),newIds=[];ids.forEach(i=>{const c=cloneShape(shapes[i]);moveShape(c,14,14);if(c.n!=null)c.n=nextNumber++;shapes.push(c);newIds.push(shapes.length-1)});selected.clear();newIds.forEach(i=>selected.add(i));primary=newIds.at(-1)??-1;draw();toast('Выбранные объекты скопированы','success')}
  function deleteSelected(){if(!selected.size)return toast('Сначала выделите объект','info');const keep=shapes.filter((_,i)=>!selected.has(i));shapes.length=0;shapes.push(...keep);selected.clear();primary=-1;recomputeNumbers();draw()}
  function selectedShapes(){return[...selected].map(i=>({i,s:shapes[i]})).filter(x=>x.s)}
  function align(kind){const a=selectedShapes();if(a.length<2)return toast('Выберите минимум 2 объекта (Shift+клик)','info');const anchor=shapes[primary]||a[0].s,ab=bounds(anchor);a.forEach(({s})=>{if(s===anchor)return;const b=bounds(s);let dx=0,dy=0;if(kind==='left')dx=ab.x-b.x;else if(kind==='centerX')dx=(ab.x+ab.w/2)-(b.x+b.w/2);else if(kind==='top')dy=ab.y-b.y;else if(kind==='centerY')dy=(ab.y+ab.h/2)-(b.y+b.h/2);moveShape(s,dx,dy)});draw()}
  function distribute(axis){const a=selectedShapes();if(a.length<3)return toast('Для распределения выберите минимум 3 объекта','info');const sorted=a.map(x=>({s:x.s,b:bounds(x.s)})).sort((m,n)=>axis==='x'?(m.b.x-n.b.x):(m.b.y-n.b.y));const first=sorted[0].b,last=sorted[sorted.length-1].b;const span=(axis==='x'?(last.x-first.x):(last.y-first.y));const step=span/(sorted.length-1||1);sorted.forEach((item,idx)=>{if(idx===0||idx===sorted.length-1)return;const target=(axis==='x'?first.x:first.y)+step*idx;const cur=axis==='x'?item.b.x:item.b.y;moveShape(item.s,axis==='x'?target-cur:0,axis==='x'?0:target-cur)});draw()}

  modeButtons.forEach(btn=>btn.onclick=()=>{mode=btn.dataset.illMode;iconKind=null;modeButtons.forEach(x=>x.dataset.active=x===btn?'1':'0');iconButtons.forEach(x=>x.dataset.active='0');help.textContent=modeHelp[mode]||'';canvas.style.cursor=mode==='select'?'default':'crosshair'});
  iconButtons.forEach(btn=>btn.onclick=()=>{mode='icon';iconKind=btn.dataset.illIcon;modeButtons.forEach(x=>x.dataset.active='0');iconButtons.forEach(x=>x.dataset.active=x===btn?'1':'0');help.textContent=modeHelp.icon;canvas.style.cursor='crosshair'});
  overlay.querySelectorAll('[data-ill-template]').forEach(btn=>btn.onclick=()=>{textInput.value=btn.dataset.illTemplate||'';textInput.focus()});
  overlay.querySelector('#illApplyStyle').onclick=()=>{if(!selected.size)return toast('Сначала выделите объект','info');const st=currentStyle();selected.forEach(i=>{if(shapes[i])applyStyle(shapes[i],st)});draw()};
  overlay.querySelector('#illDuplicate').onclick=duplicateSelected;
  overlay.querySelector('#illDeleteSelected').onclick=deleteSelected;
  overlay.querySelector('#illAlignLeft').onclick=()=>align('left');
  overlay.querySelector('#illAlignCenterX').onclick=()=>align('centerX');
  overlay.querySelector('#illAlignTop').onclick=()=>align('top');
  overlay.querySelector('#illAlignCenterY').onclick=()=>align('centerY');
  overlay.querySelector('#illDistributeX').onclick=()=>distribute('x');
  overlay.querySelector('#illDistributeY').onclick=()=>distribute('y');
  overlay.querySelector('#illResetNumbers').onclick=()=>{let n=1;shapes.filter(s=>s.n!=null).forEach(s=>s.n=n++);recomputeNumbers();draw();toast('Нумерация обновлена','success')};
  overlay.querySelector('#illUndo').onclick=()=>{if(!shapes.length)return toast('Удалять нечего','info');shapes.pop();selected.clear();primary=-1;recomputeNumbers();draw()};
  overlay.querySelector('#illClear').onclick=()=>{if(!shapes.length)return toast('Пометок нет','info');if(!confirm('Удалить все пометки на этой фотографии?'))return;shapes.length=0;selected.clear();primary=-1;recomputeNumbers();draw()};

  textInput.addEventListener('input',()=>{const s=shapes[primary];if(s&&(s.type==='label'||s.type==='callout')){s.text=textInput.value;draw()}});
  const onKey=e=>{if(!overlay.isConnected)return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const focusables=[...overlay.querySelectorAll('button,input,textarea,select,[tabindex]')].filter(x=>!x.disabled&&x.getClientRects().length);if(focusables.length){const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}if(e.target?.closest?.('input,textarea,select,[contenteditable], [role="textbox"]'))return;if((e.key==='Delete'||e.key==='Backspace')&&selected.size){e.preventDefault();deleteSelected()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected()}};window.addEventListener('keydown',onKey);

  canvas.addEventListener('pointerdown',e=>{const p=getPointer(e);if(mode==='icon'){addShape({type:'icon',x:p.x,y:p.y,iconKind});return}if(mode==='badge'){addShape({type:'badge',x:p.x,y:p.y,n:nextNumber++});return}if(mode==='label'){const t=getText();if(!t)return toast('Введите текст подписи','info');addShape({type:'label',x:p.x+8,y:p.y+8,text:t,maxW:Math.min(260,canvas.width*.34)});return}if(mode==='select'){const hit=hitTest(p);selectHit(hit,e.shiftKey);if(hit){if(hit.part==='resize'&&selected.size===1)dragState={type:'resize',shape:shapes[hit.index]};else dragState={type:'move',last:p,indices:[...selected]}}canvas.setPointerCapture?.(e.pointerId);return}start=p;if(mode==='rect')preview={type:'rect',...normalizeRect(p,p),...currentStyle()};else if(mode==='arrow'||mode==='callout')preview={type:'arrow',x1:p.x,y1:p.y,x2:p.x,y2:p.y,...currentStyle()};canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{const p=getPointer(e);if(mode==='select'&&dragState){if(dragState.type==='move'){const dx=p.x-dragState.last.x,dy=p.y-dragState.last.y;dragState.indices.forEach(i=>shapes[i]&&moveShape(shapes[i],dx,dy));dragState.last=p}else resizeShape(dragState.shape,p);draw();return}if(!start||!preview)return;if(mode==='rect')preview={type:'rect',...normalizeRect(start,p),...currentStyle()};else preview={type:'arrow',x1:start.x,y1:start.y,x2:p.x,y2:p.y,...currentStyle()};draw()});
  canvas.addEventListener('pointerup',e=>{const p=getPointer(e);if(mode==='select'){dragState=null;return}if(!start)return;if(mode==='rect'){const r=normalizeRect(start,p);if(r.w>8&&r.h>8)addShape({type:'rect',...r})}else if(mode==='arrow'){if(dist(start,p)>10)addShape({type:'arrow',x1:start.x,y1:start.y,x2:p.x,y2:p.y})}else if(mode==='callout'){if(dist(start,p)>14){const t=getText()||`Шаг ${nextNumber}`;addShape({type:'callout',x1:start.x,y1:start.y,x2:p.x,y2:p.y,labelX:p.x+12,labelY:p.y-8,n:nextNumber++,text:t,maxW:Math.min(260,canvas.width*.34)})}}start=null;preview=null;draw()});
  canvas.addEventListener('dblclick',e=>{const hit=hitTest(getPointer(e));if(!hit)return;const s=shapes[hit.index];if(s.type==='label'||s.type==='callout'){primary=hit.index;selected.clear();selected.add(hit.index);const next=window.prompt('Изменить текст подписи',s.text||'');if(next!=null){s.text=String(next).trim();textInput.value=s.text;draw()}}});

  const close=()=>{window.removeEventListener('keydown',onKey);overlay.remove();previouslyFocused?.focus?.()};overlay.querySelector('#illClose').onclick=close;overlay.querySelector('#illCancel').onclick=close;
  overlay.querySelector('#illSave').onclick=async()=>{
    selected.clear();primary=-1;draw();
    const annotations=sanitizeIllustrationAnnotations(shapes.map(cloneShape));
    const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',.92));
    if(!blob)return toast('Не удалось сохранить иллюстрацию','error');
    const dataUrl=await blobToDataUrl(blob);
    const extra=annotations.length?{renderedBlob:blob,renderedExt:'jpeg',annotations,updatedAt:Date.now()}:{annotations:[],updatedAt:Date.now()};
    if(!(await idbPutPhoto(step.id,baseBlob,photoExtFromBlob(baseBlob),extra)))return toast('Фотография не сохранена: проверьте доступность IndexedDB','error');
    step.imageData=dataUrl;
    step.imageBuffer=await blob.arrayBuffer();
    step.imageExt='jpeg';
    step.hasPhoto=true;
    step.photoEdited=!!annotations.length;
    step.photoAnnotations=annotations;
    close();renderSteps();stateChanged(false);toast(annotations.length?'Иллюстрация сохранена. Пометки можно редактировать повторно.':'Фото сохранено без пометок. Исходник оставлен без изменений.','success')
  };

  recomputeNumbers();
  modeButtons.find(b=>b.dataset.illMode==='select')?.click();draw();overlay.querySelector('#illClose')?.focus();
}

