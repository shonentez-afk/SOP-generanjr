// ============================================================
// 14. Import XLSX — robust enough for current/older шаблон
// ============================================================
function buildMergeMap(ws){const map={};try{for(const rng of (ws.model?.merges||[])){const [a,b]=String(rng).split(':');if(!a||!b)continue;const tl=ws.getCell(a),br=ws.getCell(b);for(let r=tl.row;r<=br.row;r++)for(let c=tl.col;c<=br.col;c++)map[`${r}:${c}`]=a}}catch(e){}return map}
function makeReader(ws){const mm=buildMergeMap(ws);const get=(r,c)=>{let v=ws.getCell(r,c).value;if((v===null||v===undefined||v==='')&&mm[`${r}:${c}`])v=ws.getCell(mm[`${r}:${c}`]).value;return v};const text=v=>{if(v===null||v===undefined||v==='')return '';if(v instanceof Date)return '';if(Array.isArray(v?.richText))return v.richText.map(x=>x.text).join('');if(typeof v==='object'&&v.text!==undefined)return String(v.text);if(typeof v==='object'&&v.result!==undefined)return text(v.result);return String(v)};return{text:(r,c)=>text(get(r,c)).trim(),raw:(r,c)=>get(r,c)}}
function findRow(rd,ws,label,maxRow=60){for(let r=1;r<=Math.min(ws.rowCount||1,maxRow);r++)for(let c=1;c<=12;c++)if(rd.text(r,c).includes(label))return r;return 0}
function parseExcelTime(v){if(v instanceof Date)return v.getUTCHours()*3600+v.getUTCMinutes()*60+v.getUTCSeconds();if(typeof v==='number')return Math.round(v*86400);return parseDuration(String(v||''))}
function toIsoDate(str){const p=String(str||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);return p?`${p[3]}-${String(p[2]).padStart(2,'0')}-${String(p[1]).padStart(2,'0')}`:''}
async function importSopFromXlsx(file){
await ensureExcelJS();
const buf=await file.arrayBuffer();
const wb=new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const ws=wb.worksheets.find(w=>/^(СОП|SOP|СОП_А3)$/i.test(w.name))||wb.worksheets.find(w=>/СОП|SOP/i.test(w.name));
if(!ws)throw new Error('Не найден лист СОП');
const fw=wb.worksheets.find(w=>/^(ФРВ|FRV)$/i.test(w.name))||wb.worksheets.find(w=>/ФРВ|хронометраж/i.test(w.name));
const cws=wb.worksheets.find(w=>/Чек-лист|Checklist|Оценка СОП/i.test(w.name));
const rd=makeReader(ws);
const mergeMap=buildMergeMap(ws);
const masterAt=(r,c)=>mergeMap[`${r}:${c}`]||null;
const isMasterCell=(r,c)=>{
const m=masterAt(r,c);
if(!m)return true;
const tl=String(m).match(/^([A-Z]+)(\d+)$/i); if(!tl)return true;
const colLetters=tl[1].toUpperCase(); let col=0; for(const ch of colLetters)col=col*26+(ch.charCodeAt(0)-64);
return Number(tl[2])===r&&col===c;
};
const exactText=(r,c,txt)=>normText(rd.text(r,c))===normText(txt);
const actionRows=[];
for(let r=1;r<=ws.rowCount;r++){
  for(let c=1;c<=Math.min(ws.columnCount||12,5);c++){
    if(/^Действие(?:я)?$/i.test(rd.text(r,c))){actionRows.push({row:r,labelCol:c});break;}
  }
}
if(!actionRows.length)throw new Error('Не удалось найти строки «Действие» в листе СОП');
const firstLabelCol=actionRows[0].labelCol;
const candidateActionStarts=[];
for(const ar of actionRows){
  for(let c=firstLabelCol+1;c<=Math.min(ws.columnCount||12,13);c++){
    if(!isMasterCell(ar.row,c))continue;
    const txt=rd.text(ar.row,c);
    if(!txt)continue;
    if(/^\d{1,3}:\d{2}$/.test(txt))continue;
    if(/^(QR|Визуализация|Ключевой момент|Причина)$/i.test(txt))continue;
    if(/^\d+$/.test(txt))continue;
    if(/^[0-9./\s-]+$/.test(txt))continue;
    // Для нового шаблона действия начинаются C/F/J; для старых форматов оставляем только разумные текстовые кандидаты.
    const looksAction=/^\d{1,2}\s*[.)]\s*/.test(txt)||txt.length>=8;
    if(!looksAction)continue;
    const cleaned=txt.replace(/^\s*\d{1,2}\s*[.)]\s*/,'').trim();
    if(!cleaned)continue;
    if(candidateActionStarts.some(x=>x.row===ar.row&&x.col===c))continue;
    candidateActionStarts.push({row:ar.row,col:c,labelCol:ar.labelCol});
  }
}
const rows=[];
for(const ac of candidateActionStarts){
  const r=ac.row,c=ac.col;
  const actionRaw=rd.text(r,c);
  const action=actionRaw.replace(/^\s*\d{1,2}\s*[.)]\s*/,'').trim();
  let durationSeconds=0;
  for(let tc=c+1;tc<=Math.min(c+4,ws.columnCount||13);tc++){
    if(!isMasterCell(r,tc))continue;
    const raw=rd.raw(r,tc),txt=rd.text(r,tc);
    if(raw instanceof Date || (typeof raw==='number'&&raw>0&&raw<1) || /^\d{1,3}:\d{2}$/.test(txt)){
      durationSeconds=parseExcelTime(raw??txt); break;
    }
  }
  const kmCell=rd.text(r+1,c);
  const kms=kmCell?kmCell.split(/\n+/).map(x=>x.replace(/^\s*\d+\s*[.)]\s*/,'').trim()).filter(Boolean):[];
  rows.push({
    _row:r,_col:c,_labelCol:ac.labelCol,
    id:++stepIdCounter,
    action,
    keyMoments:kms.length?kms:[''],
    reason:rd.text(r+2,c),
    durationSeconds,
    successCriteria:'',decisionPoints:[],commonPitfalls:[],visualMarkers:[],photoHint:'',
    imageData:null,imageBuffer:null,imageExt:null,
    frv:{vdc:false,m2:'',m1:'',move:'',comment:''}
  });
}
// Жёсткая защита от дублей, возникающих из merged cells и повторного чтения одной строки.
const seenKeys=new Set();
const parsed=[];
for(const st of rows){
  const key=`${st._row}:${st._col}:${normText(st.action)}`;
  if(seenKeys.has(key))continue;
  seenKeys.add(key); parsed.push(st);
}
// Сортировка строго по физическому положению в листе.
parsed.sort((a,b)=>a._row-b._row||a._col-b._col);
if(!parsed.length)throw new Error('Не удалось распознать ни одного шага');
// Импорт общих метаданных.
let branch='';
for(let r=1;r<=2&&!branch;r++)for(let c=3;c<=6;c++){const t=rd.text(r,c);if(t&&t.length>4&&!/СТАНДАРТНАЯ|ТЕХНОЛОГИЧЕСКАЯ|СОП №|Дата|УТВЕРЖДАЮ/i.test(t)){branch=t;break}}
if(branch)setVal('meta-branch',branch);
let operation='';
for(let r=3;r<=12&&!operation;r++)for(let c=3;c<=6;c++){const t=rd.text(r,c);if(t&&t.length>4&&!/Подразделение|Рабочее место|Исполнитель|СТАНДАРТНАЯ|ТЕХНОЛОГИЧЕСКАЯ|СОП №|Дата|УТВЕРЖДАЮ/i.test(t)){operation=t;break}}
if(operation)setVal('meta-operation',operation);
const rApp=findRow(rd,ws,'УТВЕРЖДАЮ');
if(rApp){for(let c=1;c<=12;c++)if(/УТВЕРЖДАЮ/i.test(rd.text(rApp,c))){setVal('meta-approver-post',rd.text(rApp+1,c));setVal('meta-approver-name',rd.text(rApp+2,c).replace(/^[_\s]+|[_\s]+$/g,''));break}}
const rDep=findRow(rd,ws,'Подразделение');if(rDep)setVal('meta-department',rd.text(rDep+1,1)||rd.text(rDep+1,2));
const rWp=findRow(rd,ws,'Рабочее место');if(rWp)setVal('meta-workplace',rd.text(rWp+1,1)||rd.text(rWp+1,2));
const rEx=findRow(rd,ws,'Исполнитель');if(rEx)setVal('meta-executor',rd.text(rEx+1,1)||rd.text(rEx+1,2));
// № СОП / версия: в оригинальном шаблоне label 'СОП №:' находится в G2:I2,
// а значение — в G3:I3. Не читаем соседнюю merged-ячейку, иначе получаем сам label.
const rOp=findRow(rd,ws,'СОП №');
if(rOp){
  for(let c=1;c<=12;c++){
    const label=rd.text(rOp,c);
    if(!/СОП №/i.test(label))continue;
    let value='';
    for(let rr=rOp+1;rr<=Math.min(rOp+3,ws.rowCount);rr++){
      const candidate=rd.text(rr,c);
      if(candidate && !/СОП №|Дата:|УТВЕРЖДАЮ/i.test(candidate)){ value=candidate; break; }
    }
    if(value)setVal('meta-sop-number',value);
    break;
  }
}
// Дата: label J2, значение J3.
const rDate=findRow(rd,ws,'Дата');
if(rDate){
  for(let c=1;c<=12;c++){
    const label=rd.text(rDate,c);
    if(!/^Дата:?$/i.test(label.trim()) && !/^Дата:/i.test(label.trim()))continue;
    let iso='';
    for(let rr=rDate+1;rr<=Math.min(rDate+3,ws.rowCount);rr++){
      const raw=rd.raw(rr,c),txt=rd.text(rr,c);
      if(raw instanceof Date){iso=`${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`;break;}
      const parsed=toIsoDate(txt);
      if(parsed){iso=parsed;break;}
    }
    if(iso)setVal('meta-date',iso);
    break;
  }
}
const rSafe=findRow(rd,ws,'Требования к безопасности');if(rSafe){for(let c=1;c<=12;c++)if(rd.text(rSafe,c).includes('Требования')){const v=rd.text(rSafe+1,c);if(v)setVal('meta-safety',v)}}
const rTools=findRow(rd,ws,'Инструмент');if(rTools){for(let c=1;c<=12;c++)if(rd.text(rTools,c).includes('Инструмент'))setVal('meta-tools',rd.text(rTools+1,c))}
const rMat=findRow(rd,ws,'Материал');if(rMat){for(let c=1;c<=12;c++)if(rd.text(rMat,c).includes('Материал'))setVal('meta-material',rd.text(rMat+1,c))}
// Согласующие.
const rSogl=findRow(rd,ws,'СОГЛАСОВАНО');
if(rSogl){
  const lc=[...Array(12)].map((_,i)=>i+1).find(c=>/СОГЛАСОВАНО/i.test(rd.text(rSogl,c)))||11;
  const agreed=[];
  for(let rr=rSogl+1;rr<=Math.min(rSogl+8,ws.rowCount);rr++){
    const t=rd.text(rr,lc); if(!t)continue;
    if(/^Действие|^Ключевой момент|^Причина|^Визуализация/i.test(t))break;
    if(/^_+\s*/.test(t)){
      if(agreed.length)agreed[agreed.length-1].name=t.replace(/^_+\s*/,'').trim();
    }else if(agreed.length<3){agreed.push({post:t,name:''});}
  }
  if(agreed.length)state.agreedList=agreed;
}
// Ответственная рабочая группа.
const rGrp=findRow(rd,ws,'Ответственная рабочая группа');
if(rGrp){
  for(let c=1;c<=12;c++){
    if(!/Ответственная.*рабочая.*группа/i.test(rd.text(rGrp,c)))continue;
    let collected=[];
    // В оригинальном шаблоне заголовок группы занимает I4:J5,
    // ФИО находятся только в I6:J10. Ниже начинается дисклеймер,
    // поэтому читаем строго до строки безопасности.
    const groupStart=rGrp+2;
    const groupEnd=rSafe ? Math.min(rSafe-1, rGrp+6) : Math.min(rGrp+6, ws.rowCount);
    for(let rr=groupStart;rr<=groupEnd;rr++){
      const t=rd.text(rr,c).trim();
      if(!t)continue;
      if(/Ответственная.*рабочая.*группа|СОГЛАСОВАНО|УТВЕРЖДАЮ|Подразделение|Рабочее место|Исполнитель|^Действие$|^Ключевой момент$|^Причина$|^Визуализация$/i.test(t))continue;
      // Группа — только ФИО/строки из своего блока; не захватываем
      // дисклеймер, инструмент, безопасность и другие секции ниже.
      if(t.length>120)continue;
      collected.push(...t.split(/\n+/).map(x=>x.trim()).filter(Boolean));
    }
    if(collected.length)state.responsibles=[...new Set(collected)];
    break;
  }
}
// Фото: берём только изображения, привязанные к строкам «Визуализация». Логотип и strip ISO 7010 намеренно игнорируются.
try{
  const vizRows=[];
  for(let r=1;r<=ws.rowCount;r++)for(let c=1;c<=Math.min(ws.columnCount||12,5);c++)if(/^Визуализация$/i.test(rd.text(r,c))){vizRows.push(r);break}
  const imageItems=ws.getImages?ws.getImages():[];
  let importedImages=0;
  for(const im of imageItems){
    const tl=im.range?.tl; if(!tl)continue;
    const imgRow=Math.floor(tl.row)+1;
    const imgCol=Math.floor(tl.col)+1;
    // В оригинальном шаблоне фото привязаны к строке визуализации, а общий strip ISO — к строке безопасности.
    if(!vizRows.includes(imgRow))continue;
    let actionRow=imgRow+1;
    if(!actionRows.some(x=>x.row===actionRow)){
      const next=actionRows.find(x=>x.row>imgRow); if(!next)continue; actionRow=next.row;
    }
    // Определяем колонку шага по исходной сетке B:L: C:E, F:I, J:L.
    let targetStart=0;
    if(imgCol>=3&&imgCol<=5)targetStart=3;
    else if(imgCol>=6&&imgCol<=9)targetStart=6;
    else if(imgCol>=10&&imgCol<=12)targetStart=10;
    if(!targetStart)continue;
    const st=parsed.find(x=>x._row===actionRow&&x._col===targetStart);
    if(!st)continue;
    const info=wb.getImage(im.imageId);
    if(!info?.buffer)continue;
    const extRaw=String(info.extension||'png').toLowerCase();
    const ext=extRaw==='jpg'?'jpeg':extRaw;
    const u8=info.buffer instanceof Uint8Array?info.buffer:new Uint8Array(info.buffer);
    let bin='';
    for(let i=0;i<u8.length;i+=0x8000)bin+=String.fromCharCode(...u8.subarray(i,i+0x8000));
    st.imageData=`data:image/${ext};base64,${btoa(bin)}`;
    st.imageExt=ext;
    st.imageBuffer=u8.slice().buffer;
    st.hasPhoto=true;st.photoEdited=false;st.photoAnnotations=[];
    importedImages++;
  }
  console.log(`[Импорт СОП] распознано шагов: ${parsed.length}; фото: ${importedImages}`);
}catch(e){console.warn('import images:',e)}
// Импорт FRV по точному имени действия.
if(fw){
  const fr=makeReader(fw),hdr=findRow(fr,fw,'Действие, ключ.момент');
  if(hdr)for(let r=hdr+1;r<=fw.rowCount;r++){
    const act=fr.text(r,2);if(!act||/новый цикл/i.test(act)||/^Итого$/i.test(act))continue;
    const st=parsed.find(x=>normText(x.action)===normText(act));if(!st)continue;
    st.frv={vdc:Number(fr.text(r,4))>0,m2:fr.text(r,5),m1:fr.text(r,6),move:fr.text(r,8),comment:fr.text(r,7)};
  }
}
// Импорт чек-листа.
if(cws){
  const cr=makeReader(cws);
  for(let r=1;r<=cws.rowCount;r++)for(let c=1;c<=6;c++){
    const id=Number(cr.text(r,c));if(!id||id>13)continue;
    const it=state.checklist.find(x=>x.id===id);if(!it)continue;
    const score=Number(cr.text(r,c+2)),weight=Number(cr.text(r,c+3)),comment=cr.text(r,c+5);
    if(Number.isFinite(score)){it.score=score;it.scoreSource='manual'}
    if(Number.isFinite(weight)&&weight>0)it.weight=weight;
    if(comment)it.comment=comment;
  }
}
// The imported XLSX image bytes MUST be committed before changing the current SOP.
// A draft stores only hasPhoto + photo JSON, never inline image data in localStorage.
const importedPhotoKeys=[];
try{
  for(const item of parsed){
    if(!item.imageBuffer)continue;
    const ext=item.imageExt||'jpeg';
    const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';
    const blob=new Blob([item.imageBuffer],{type:mime});
    if(!(await idbPutPhoto(item.id,blob,ext,{annotations:[],updatedAt:Date.now()})))throw new Error('IndexedDB отказала в записи фотографии шага '+item.id);
    importedPhotoKeys.push(item.id);
    const record=await idbGetPhoto(item.id);
    if(!record?.blob||record.blob.size!==blob.size)throw new Error('Фотография шага '+item.id+' не прошла контроль чтения из IndexedDB');
    item.hasPhoto=true;
  }
}catch(e){
  for(const id of importedPhotoKeys)await idbDeletePhoto(id);
  throw new Error('Импорт прерван: фотография не была сохранена. '+e.message);
}
// Переносим импортированные поля формы обратно в единую модель state.
// Ранее metadata записывались только через setVal(), а затем stateToHtml()
// перерисовывал DOM старыми значениями state.meta — из-за этого после импорта
// шапка визуально оставалась пустой.
state.steps=parsed;
htmlFieldToState();
// Внутренние поля для layout/диагностики удаляем после чтения и до сохранения draft.
for(const st of state.steps){delete st._row;delete st._col;delete st._labelCol}
stateToHtml();
saveDraft();
toast(`Импортировано шагов: ${state.steps.length}. Метаданные и фото восстановлены.`,'success');
return state.steps.length;
}
