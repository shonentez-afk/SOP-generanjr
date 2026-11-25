// Stage42 — side-effect-free workbook inspection and a provenance-aware SOP proposal.
// The accepted Stage41 importSopFromXlsx() is intentionally untouched.
// No state writes, no IndexedDB writes, no Yandex calls during parsing.
function stage42CellText(value){
  if(value==null)return '';
  if(value instanceof Date)return value.toLocaleDateString('ru-RU');
  if(Array.isArray(value?.richText))return value.richText.map(x=>x.text||'').join('');
  if(typeof value==='object'&&value.text!==undefined)return String(value.text);
  if(typeof value==='object'&&value.result!==undefined)return stage42CellText(value.result);
  // ExcelJS may return internal rich/object placeholders for image/unsupported
  // cells; rendering "[object Object]" is misleading, not cell content.
  if(typeof value==='object')return '';
  return String(value);
}
function stage42Reader(ws){
  const base=makeReader(ws);
  return {raw:base.raw,text:(r,c)=>stage42CellText(base.raw(r,c)).trim()};
}
function stage42IsHeading(txt){
  return /^(?:Действие(?:я)?|Ключевой момент|КМ|Причина|Почему важно|Визуализация|QR|Время|Длительность)$/iu.test(String(txt||'').trim());
}
// Restore the real numbered key points, not arbitrary visual/soft line wraps.
// Excel often stores one point over several lines inside a merged cell.
// Input: "1. Inspect cable\nand plug\n2. Inspect body\n3. Test switch"
// Output: three complete key points, without embedded list numbers.
function stage42SplitKeyMoments(value){
  const raw=stage42CellText(value).replace(/\r\n?/gu,'\n')
    .replace(/\u00a0/gu,' ').replace(/\u200b/gu,'').trim();
  if(!raw)return [];
  const clean=text=>String(text||'').replace(/[ \t]*\n[ \t]*/gu,' ')
    .replace(/[ \t]{2,}/gu,' ').trim();
  // 1. / 2) are list markers only when followed by whitespace and text.
  // Decimal values (1.5, 2.0), voltage, and plain wrapped lines must
  // not create a new point. Works for both separate and inline numbering.
  // Real corporate SOPs also contain "1.Предупредить", "2 Достать",
  // "3 стоять" and markers separated by multiple spaces on the same line.
  // Inline "2. Второй" is valid; bare inline "2 секунды" is not.
  const re=/(^|[ \t\n]+)(\d{1,2})([.)])?([ \t]*)(?=[\p{L}«“"])/gu;
  const markers=[...raw.matchAll(re)].filter(m=>{
    const prefix=m[1],number=Number(m[2]),hasPunct=!!m[3];
    if(number>60)return false;
    const start=m.index===0||prefix.includes('\n');
    const wideSpaces=prefix.length>=2;
    return (hasPunct||((start||wideSpaces)&&m[4].length>0));
  }).map(m=>({
    from:m.index+m[1].length,to:m.index+m[0].length,num:Number(m[2]),
    lineStart:m.index===0||m[1].includes('\n')
  }));
  const first=markers.findIndex(m=>m.num===1&&
    (m.lineStart||raw.slice(0,m.from).trim().length===0));
  if(first!==-1){
    const points=[];
    let previous=markers[first],start=previous.to;
    const prelude=clean(raw.slice(0,previous.from));
    for(let i=first+1;i<markers.length;i++){
      const marker=markers[i];
      // Prefer sequential 1,2,3...; later numbers embedded in sentences
      // are not mistaken for a new point. If a numbered list skips a
      // number, only an explicit new-line marker is treated as a boundary.
      if(marker.num!==previous.num+1&&!marker.lineStart)continue;
      const text=clean(raw.slice(start,marker.from));
      if(text)points.push(points.length===0&&prelude?prelude+' '+text:text);
      previous=marker;start=marker.to;
    }
    const tail=clean(raw.slice(start));
    if(tail)points.push(points.length===0&&prelude?prelude+' '+tail:tail);
    if(points.length)return points;
  }
  // Unnumbered bulleted paragraphs are distinct points.
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);
  if(lines.length>1&&lines.every(x=>/^(?:[•●▪▫*]|[-–—])\s+\S/u.test(x)))
    return lines.map(x=>clean(x.replace(/^(?:[•●▪▫*]|[-–—])\s+/u,'')));
  // Empty paragraphs indicate separation; a single line break alone
  // usually means word wrapping inside one key point.
  const paragraphs=raw.split(/\n[ \t]*\n+/u).map(clean).filter(Boolean);
  if(paragraphs.length>1)return paragraphs;
  return [clean(raw.replace(/^\s*\d{1,2}[.)]\s+/u,''))].filter(Boolean);
}
function stage42CleanAction(txt){return String(txt||'').replace(/^\s*\d{1,3}\s*[.)]\s*/u,'').trim()}
function stage42ActionCandidate(txt){
  const v=String(txt||'').trim();
  return v.length>=8&&!stage42IsHeading(v)&&!/^[-+.\d/\s:]+$/u.test(v)
    &&!/^(\d{1,3}:\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|СОП №|Дата:|УТВЕРЖДАЮ|Фото\s*\/\s*схема)/iu.test(v);
}
function stage42ActionCell(rd,r,c){
  const raw=rd.raw(r,c),text=rd.text(r,c);
  // An ExcelJS Date representing a time-formatted cell must never be
  // mistaken for a manufacturing action ("30.12.1899").
  return !(raw instanceof Date)&&typeof raw!=='number'&&
    stage42ActionCandidate(text);
}
function stage42ActionColumns(ws,labelCol){
  // Columns are corporate layout positions, not hardcoded row numbers.
  if(labelCol===1&&ws.columnCount>=11)return [2,5,9,11];
  if(labelCol===2&&ws.columnCount>=10)return [3,6,10];
  return null; // Other templates fall back to cell-content detection.
}
function stage42ActionColAnchors(rd,ws,row,labelCol,master){
  const candidates=stage42ActionColumns(ws,labelCol)||
    Array.from({length:Math.max(0,Math.min(ws.columnCount,13)-labelCol)},(_,i)=>i+labelCol+1);
  return candidates.filter(c=>master(row,c)&&stage42ActionCell(rd,row,c));
}
function stage42ColumnName(n){
  let result='';
  for(let v=Math.max(1,Number(n)||1);v>0;v=Math.floor((v-1)/26))
    result=String.fromCharCode(65+(v-1)%26)+result;
  return result;
}
function stage42CellAddress(r,c){return stage42ColumnName(c)+String(r)}
function stage42ReadLabeled(rd,ws,actionRow,col,labelRegex,fallback,nextRow){
  const last=Math.min(ws.rowCount,actionRow+6,nextRow-1);
  for(let rr=actionRow+1;rr<=last;rr++){
    for(let cc=1;cc<=Math.min(7,ws.columnCount||7);cc++){
      const text=rd.text(rr,cc);
      if(labelRegex.test(text))return {text:rd.text(rr,col),row:rr};
    }
  }
  const row=actionRow+fallback;
  return row<nextRow?{text:rd.text(row,col),row}:{text:'',row:0};
}
function stage42Metadata(ws,rd){
  const meta={},put=(key,value)=>{const v=String(value||'').trim();if(v)meta[key]=v};
  let branch='';
  for(let r=1;r<=2&&!branch;r++)for(let c=3;c<=6;c++){
    const t=rd.text(r,c);
    if(t&&t.length>4&&!/СТАНДАРТНАЯ|ТЕХНОЛОГИЧЕСКАЯ|СОП №|Дата|УТВЕРЖДАЮ/iu.test(t)){branch=t;break}
  }
  put('branch',branch);
  let operation='';
  for(let r=3;r<=12&&!operation;r++)for(let c=3;c<=6;c++){
    const t=rd.text(r,c);
    if(t&&t.length>4&&!/Подразделение|Рабочее место|Исполнитель|СТАНДАРТНАЯ|ТЕХНОЛОГИЧЕСКАЯ|СОП №|Дата|УТВЕРЖДАЮ/iu.test(t)){operation=t;break}
  }
  put('operation',operation);
  const approval=findRow(rd,ws,'УТВЕРЖДАЮ');
  if(approval)for(let c=1;c<=12;c++)if(/УТВЕРЖДАЮ/iu.test(rd.text(approval,c))){
    put('approverPost',rd.text(approval+1,c));
    put('approverName',rd.text(approval+2,c).replace(/^[_\s]+|[_\s]+$/gu,''));
    break;
  }
  const basic=[
    ['department','Подразделение'],
    ['workplace','Рабочее место'],
    ['executor','Исполнитель']
  ];
  for(const [key,label] of basic){
    const row=findRow(rd,ws,label);
    if(row)put(key,rd.text(row+1,1)||rd.text(row+1,2));
  }
  const numberRow=findRow(rd,ws,'СОП №');
  if(numberRow)for(let c=1;c<=12;c++){
    if(!/СОП\s*№/iu.test(rd.text(numberRow,c)))continue;
    // Old landscape workbooks have "СОП №" in F1 and its value in G1.
    // Constructor-produced portrait files use G2 -> G3. Never confuse
    // the next "Время СОП:" row or its formula with the document number.
    const options=[
      [numberRow,c+1],[numberRow,c+2],[numberRow+1,c],
      [numberRow+1,c+1],[numberRow+2,c]
    ];
    for(const [rr,cc] of options){
      if(rr>ws.rowCount||cc>ws.columnCount)continue;
      const v=rd.text(rr,cc),raw=rd.raw(rr,cc);
      if(!/\d/u.test(v)||raw instanceof Date||typeof raw==='object'&&
        raw!==null&&raw.formula!==undefined)continue;
      if(/СОП\s*№|Время\s+СОП|Дата|УТВЕРЖДАЮ|Ответствен/iu.test(v))continue;
      put('sopNumber',v);break;
    }
    break;
  }
  const dateRow=findRow(rd,ws,'Дата');
  if(dateRow)for(let c=1;c<=12;c++){
    if(!/^Дата:?/iu.test(rd.text(dateRow,c)))continue;
    for(let rr=dateRow+1;rr<=Math.min(dateRow+3,ws.rowCount);rr++){
      const raw=rd.raw(rr,c),val=rd.text(rr,c);
      const iso=raw instanceof Date?
        [raw.getFullYear(),String(raw.getMonth()+1).padStart(2,'0'),String(raw.getDate()).padStart(2,'0')].join('-'):
        toIsoDate(val);
      // "00.08.2021г." is present in one legacy example and is NOT a
      // valid date. Do not silently convert its invalid day into a date.
      const parsed=iso?new Date(iso+'T00:00:00Z'):null;
      if(parsed&&!Number.isNaN(parsed.getTime())&&
         parsed.toISOString().slice(0,10)===iso){
        put('date',iso);break;
      }
    }
    break;
  }
  for(const [key,label] of [
    ['safety','Требования к безопасности'],['tools','Инструмент'],
    ['material','Материал']]){
    const row=findRow(rd,ws,label);
    if(!row)continue;
    for(let c=1;c<=12;c++)if(rd.text(row,c).includes(label)){
      put(key,rd.text(row+1,c));break;
    }
  }
  const agreed=[],ar=findRow(rd,ws,'СОГЛАСОВАНО');
  if(ar){
    const lc=[...Array(12)].map((_,i)=>i+1).find(c=>/СОГЛАСОВАНО/iu.test(rd.text(ar,c)))||11;
    for(let rr=ar+1;rr<=Math.min(ar+8,ws.rowCount);rr++){
      const t=rd.text(rr,lc);if(!t)continue;
      if(/^(Действие|Ключевой момент|Причина|Визуализация)/iu.test(t))break;
      if(/^_+\s*/u.test(t)){if(agreed.length)agreed[agreed.length-1].name=t.replace(/^_+\s*/u,'').trim()}
      else if(agreed.length<3)agreed.push({post:t,name:''});
    }
  }
  const responsibles=[],gr=findRow(rd,ws,'Ответственная рабочая группа');
  if(gr)for(let c=1;c<=12;c++){
    if(!/Ответственная.*рабочая.*группа/iu.test(rd.text(gr,c)))continue;
    const safeRow=findRow(rd,ws,'Требования к безопасности');
    const last=safeRow?Math.min(safeRow-1,gr+6):Math.min(gr+6,ws.rowCount);
    for(let rr=gr+2;rr<=last;rr++){
      const t=rd.text(rr,c).trim();
      if(!t||t.length>120||/Ответственная.*рабочая.*группа|СОГЛАСОВАНО|УТВЕРЖДАЮ|Подразделение|Рабочее место|Исполнитель|^Действие$|^Причина$/iu.test(t))continue;
      responsibles.push(...t.split(/\n+/u).map(x=>x.trim()).filter(Boolean));
    }
    break;
  }
  return {meta,agreed,responsibles:[...new Set(responsibles)]};
}
function stage42ParseFrv(wb,steps,warnings){
  const ws=wb.worksheets.find(w=>/^(ФРВ|FRV)$/iu.test(w.name))||
    wb.worksheets.find(w=>/ФРВ|хронометраж/iu.test(w.name));
  if(!ws)return;
  const rd=makeReader(ws),h=findRow(rd,ws,'Действие, ключ.момент');
  if(!h)return;
  for(let r=h+1;r<=ws.rowCount;r++){
    const action=rd.text(r,2);
    if(!action||/новый цикл|^Итого$/iu.test(action))continue;
    const matches=steps.filter(s=>normText(s.action)===normText(action));
    if(matches.length===1){
      matches[0].frv={vdc:Number(rd.text(r,4))>0,m2:rd.text(r,5),
        m1:rd.text(r,6),move:rd.text(r,8),comment:rd.text(r,7)};
    }else if(matches.length>1){
      warnings.push('ФРВ: действие «'+action.slice(0,70)+'» встречается несколько раз; время не распределено автоматически.');
    }
  }
}
function stage42ParseChecklist(wb){
  const ws=wb.worksheets.find(w=>/Чек-лист|Checklist|Оценка СОП/iu.test(w.name));
  if(!ws)return [];
  const rd=makeReader(ws),changes=[];
  for(let r=1;r<=ws.rowCount;r++)for(let c=1;c<=6;c++){
    const id=Number(rd.text(r,c));
    if(!Number.isInteger(id)||id<1||id>13)continue;
    const scoreText=rd.text(r,c+2),weightText=rd.text(r,c+3);
    const entry={id};
    if(scoreText&&Number.isFinite(Number(scoreText)))entry.score=Number(scoreText);
    if(weightText&&Number.isFinite(Number(weightText))&&Number(weightText)>0)entry.weight=Number(weightText);
    const comment=rd.text(r,c+5);if(comment)entry.comment=comment;
    if(Object.keys(entry).length>1)changes.push(entry);
  }
  return changes;
}
// Check actual SOP content in *every* worksheet. Names alone can identify an
// empty landscape template while the populated SOP is the portrait sheet.
function stage42SheetEvidence(ws){
  const rd=stage42Reader(ws),mm=buildMergeMap(ws);
  const isMaster=(r,c)=>!mm[r+':'+c]||mm[r+':'+c]===stage42CellAddress(r,c);
  let labels=0,actions=0,numbered=0,firstActionRow=0;
  const maxRow=Math.min(ws.rowCount||0,2000),maxCol=Math.min(ws.columnCount||13,13);
  for(let r=1;r<=maxRow;r++){
    for(let c=1;c<=Math.min(7,maxCol);c++){
      if(!isMaster(r,c)||!/^Действие(?:я)?$/iu.test(rd.text(r,c)))continue;
      labels++;
      for(const col of stage42ActionColAnchors(rd,ws,r,c,isMaster)){
        actions++;
        if(!firstActionRow)firstActionRow=r;
      }
      break;
    }
  }
  if(!actions){
    for(let r=1;r<=maxRow;r++){
      for(let c=1;c<=maxCol;c++){
        if(!isMaster(r,c))continue;
        const t=rd.text(r,c);
        if(/^\d{1,3}\s*[.)]\s*[\p{L}]/u.test(t)&&stage42ActionCandidate(t)){
          numbered++;
          if(!firstActionRow)firstActionRow=r;
          break;
        }
      }
    }
  }
  return {sheet:ws.name,actions,labels,numbered,count:actions||numbered,
    firstActionRow};
}
function stage42BestSheet(wb){
  const rated=wb.worksheets.map((ws,index)=>({
    ws,index,...stage42SheetEvidence(ws)
  }));
  const primaryName=name=>/^(?:СОП|SOP)(?:$|_)/iu.test(name)&&
    !/Пример|example|шаблон|template/iu.test(name);
  rated.sort((a,b)=>{
    // A populated working SOP must beat the "Пример" worksheet even
    // when that training sheet contains more actions (9 vs 8 in real
    // uploaded enterprise workbooks). Never choose an empty working tab.
    const ap=Number(a.count>0&&a.labels>0&&primaryName(a.ws.name));
    const bp=Number(b.count>0&&b.labels>0&&primaryName(b.ws.name));
    return bp-ap ||
      b.count-a.count || b.labels-a.labels ||
      Number(/СОП|SOP/iu.test(b.ws.name))-Number(/СОП|SOP/iu.test(a.ws.name)) ||
      a.index-b.index;
  });
  return rated[0]?.ws||wb.worksheets[0];
}
async function stage42ParseFile(file){
  if(!file||!/\.xlsx$/iu.test(file.name||''))throw new Error('Выберите файл .xlsx');
  if(file.size>80*1024*1024)throw new Error('Файл более 80 МБ; разбейте импорт на меньшие файлы');
  await ensureExcelJS();
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  if(!wb.worksheets.length)throw new Error('Книга Excel не содержит листов');
  return stage42ParseSelectedSheet(wb,stage42BestSheet(wb),file.name);
}
function stage42ParseSelectedSheet(wb,ws,fileName){
  if(!ws)throw new Error('Выберите лист, содержащий СОП');
  const rd=stage42Reader(ws),mm=buildMergeMap(ws),warnings=[],steps=[];
  const master=(r,c)=>!mm[r+':'+c]||mm[r+':'+c]===stage42CellAddress(r,c);
  const actionRows=[];
  for(let r=1;r<=ws.rowCount;r++)for(let c=1;c<=Math.min(7,ws.columnCount||7);c++){
    if(/^Действие(?:я)?$/iu.test(rd.text(r,c))&&master(r,c)){
      actionRows.push({row:r,labelCol:c});break;
    }
  }
  const anchors=[];
  for(const ar of actionRows)for(const c of stage42ActionColAnchors(rd,ws,ar.row,ar.labelCol,master)){
    if(anchors.some(a=>a.row===ar.row&&a.col===c))continue;
    anchors.push({row:ar.row,col:c,labelCol:ar.labelCol});
  }
  if(!anchors.length){
    // Fallback for single-column/shifted templates: numbered actions remain
    // suggestions that the user can map, never invented manufacturing steps.
    for(let r=1;r<=ws.rowCount;r++)for(let c=1;c<=Math.min(13,ws.columnCount||13);c++){
      if(!master(r,c))continue;
      const t=rd.text(r,c);
      if(/^\d{1,3}\s*[.)]\s*[\p{L}]/u.test(t)&&stage42ActionCandidate(t)){
        anchors.push({row:r,col:c,labelCol:Math.max(1,c-1),heuristic:true});break;
      }
    }
    if(anchors.length)warnings.push('Нестандартный шаблон: действия найдены по нумерации. Проверьте все привязки.');
  }
  anchors.sort((a,b)=>a.row-b.row||a.col-b.col);
  const seen=new Set();
  for(const a of anchors){
    const key=a.row+':'+a.col;if(seen.has(key))continue;seen.add(key);
    const action=stage42CleanAction(rd.text(a.row,a.col));if(!action)continue;
    const next=anchors.find(v=>v.row>a.row)?.row||ws.rowCount+1;
    const km=stage42ReadLabeled(rd,ws,a.row,a.col,/^(?:Ключевой момент|КМ)$/iu,1,next);
    const why=stage42ReadLabeled(rd,ws,a.row,a.col,/^(?:Причина|Почему важно)$/iu,2,next);
    const moments=stage42SplitKeyMoments(km.text);
    let durationSeconds=0,timeSource='';
    for(let tc=a.col+1;tc<=Math.min(a.col+4,ws.columnCount||13);tc++){
      if(!master(a.row,tc))continue;
      const raw=rd.raw(a.row,tc),t=rd.text(a.row,tc);
      if(raw instanceof Date||(typeof raw==='number'&&raw>0&&raw<1)||/^\d{1,3}:\d{2}$/u.test(t)){
        durationSeconds=parseExcelTime(raw??t)||0;
        timeSource=stage42CellAddress(a.row,tc);break;
      }
    }
    const source={action:stage42CellAddress(a.row,a.col),
      keyMoments:km.row?stage42CellAddress(km.row,a.col):'',
      reason:why.row?stage42CellAddress(why.row,a.col):'',time:timeSource};
    steps.push({action,keyMoments:moments.length?moments:[''],reason:why.text,
      durationSeconds,successCriteria:'',source,photoIndex:-1,
      frv:{vdc:false,m2:'',m1:'',move:'',comment:''}});
    if(moments.length>3)warnings.push('Шаг '+steps.length+': распознано '+moments.length+
      ' нумерованных КМ. Все пункты сохраняются отдельно; проверьте их и итоговую печатную форму.');
  }
  if(!steps.length)warnings.push('На листе «'+ws.name+'» не удалось найти действия. Выберите другой лист или назначьте ячейки вручную.');
  const details=stage42Metadata(ws,rd);
  const media=[];
  const vizRows=new Set();
  for(let r=1;r<=ws.rowCount;r++)for(let c=1;c<=Math.min(ws.columnCount||12,5);c++)
    if(/^Визуализация$/iu.test(rd.text(r,c))){vizRows.add(r);break}
  for(const image of (ws.getImages?.()||[])){
    try{
      const info=wb.getImage(image.imageId),tl=image.range?.tl;
      if(!info?.buffer||!tl)continue;
      const ext=String(info.extension||'png').toLowerCase().replace(/^jpg$/u,'jpeg');
      if(!['png','jpeg','webp'].includes(ext)){warnings.push('Изображение с неподдерживаемым типом '+ext);continue}
      const bytes=info.buffer instanceof Uint8Array?new Uint8Array(info.buffer):new Uint8Array(info.buffer);
      if(!bytes.byteLength||bytes.byteLength>18*1024*1024){warnings.push('Крупное или пустое изображение не импортировано');continue}
      const row=Math.floor(tl.row)+1,col=Math.floor(tl.col)+1;
      const blob=new Blob([bytes],{type:'image/'+ext});
      const record={bytes,ext,row,col,url:URL.createObjectURL(blob),
        source:ws.name+'!'+stage42CellAddress(row,col),assigned:-1,
        auxiliary:false};
      // Image row may be the visualization row (the usual template) or
      // one row above it (old enterprise templates). Do not confuse the
      // header logo or safety icons with a photo of a manufacturing step.
      const next=actionRows.find(a=>a.row>row);
      const previous=actionRows.filter(a=>a.row<row).pop();
      const isPreceding=!!(next&&
        (row===next.row-1||(row===next.row-2&&vizRows.has(next.row-1))));
      const isFollowing=!!(!isPreceding&&previous&&
        row>=previous.row+2&&row<=previous.row+4&&vizRows.has(row));
      const actionRow=isPreceding?next.row:isFollowing?previous.row:null;
      if(actionRow){
        const group=anchors.filter(a=>a.row===actionRow).sort((a,b)=>a.col-b.col);
        const labelCol=actionRows.find(a=>a.row===actionRow)?.labelCol||0;
        // For portrait layouts, image at column B is usually the ISO
        // pictogram in the left label column, not the action's picture.
        if(col>labelCol&&group.length){
          let chosen=group[0];
          for(const a of group)if(a.col<=col)chosen=a;
          let index=steps.findIndex(x=>x.source.action===
            stage42CellAddress(chosen.row,chosen.col));
          if(index!==-1){
            let existing=steps[index].photoIndex;
            const earlier=existing>=0?media[existing]:null;
            // Older Excel files sometimes anchor a K-lane picture one
            // column to the LEFT (J) while the I-lane photo is already
            // attached at I. Assign this distinct picture to the nearest
            // still-empty action in that same row. Never redirect the
            // duplicate background/foreground layers from one anchor.
            if(existing!==-1&&earlier&&
              !(earlier.row===row&&earlier.col===col)){
              const open=group.map(a=>({
                a,step:steps.findIndex(x=>x.source.action===
                  stage42CellAddress(a.row,a.col))
              })).filter(item=>item.step>=0&&
                steps[item.step].photoIndex===-1&&
                Math.abs(item.a.col-col)<=2)
                .sort((a,b)=>Math.abs(a.a.col-col)-Math.abs(b.a.col-col));
              if(open.length){index=open[0].step;existing=-1}
            }
            if(existing===-1){
              record.assigned=index;
              steps[index].photoIndex=media.length;
            }else{
              const previous=media[existing];
              // The constructor's Excel exporter writes blurred background
              // followed by ORIGINAL foreground at the SAME coordinates.
              // The last layer must win (unlike the old first-layer match).
              if(previous&&previous.row===row&&previous.col===col){
                previous.assigned=-1;
                previous.auxiliary=true;
                record.assigned=index;
                steps[index].photoIndex=media.length;
              }
              // Remaining ambiguous pictures are left for manual review.
            }
          }
        }
      }
      media.push(record);
    }catch(error){warnings.push('Не удалось распознать отдельное изображение: '+String(error.message||error))}
  }
  const orphan=media.filter(x=>x.assigned===-1&&!x.auxiliary).length;
  if(orphan)warnings.push('Не назначено изображений: '+orphan+'. Среди них могут быть логотипы и ISO-пиктограммы.');
  stage42ParseFrv(wb,steps,warnings);
  const checklist=stage42ParseChecklist(wb);
  return {fileName,wb,ws,steps,meta:details.meta,
    agreed:details.agreed,responsibles:details.responsibles,checklist,
    media,warnings,sourceSheet:ws.name,readOnly:true};
}
function stage42ReleaseProposal(proposal){
  if(!proposal)return;
  for(const m of proposal.media||[])if(m.url)URL.revokeObjectURL(m.url);
  proposal.media=[];
  proposal.wb=null;
  proposal.ws=null;
}
