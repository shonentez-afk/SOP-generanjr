// Stage42 — side-effect-free workbook inspection and a provenance-aware SOP proposal.
// The accepted Stage41 importSopFromXlsx() is intentionally untouched.
// No state writes, no IndexedDB writes, no Yandex calls during parsing.
function stage42CellText(value){
  if(value==null)return '';
  if(value instanceof Date)return value.toLocaleDateString('ru-RU');
  if(Array.isArray(value?.richText))return value.richText.map(x=>x.text||'').join('');
  if(typeof value==='object'&&value.text!==undefined)return String(value.text);
  if(typeof value==='object'&&value.result!==undefined)return stage42CellText(value.result);
  return String(value);
}
function stage42IsHeading(txt){
  return /^(?:Действие(?:я)?|Ключевой момент|КМ|Причина|Почему важно|Визуализация|QR|Время|Длительность)$/iu.test(String(txt||'').trim());
}
function stage42CleanAction(txt){return String(txt||'').replace(/^\s*\d{1,3}\s*[.)]\s*/u,'').trim()}
function stage42ActionCandidate(txt){
  const v=String(txt||'').trim();
  return v.length>=8&&!stage42IsHeading(v)&&!/^[-+.\d/\s:]+$/u.test(v)
    &&!/^(\d{1,3}:\d{2}|СОП №|Дата:|УТВЕРЖДАЮ)/iu.test(v);
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
    if(!/СОП №/iu.test(rd.text(numberRow,c)))continue;
    for(let rr=numberRow+1;rr<=Math.min(numberRow+3,ws.rowCount);rr++){
      const v=rd.text(rr,c);
      if(v&&!/СОП №|Дата:|УТВЕРЖДАЮ/iu.test(v)){put('sopNumber',v);break}
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
      if(iso){put('date',iso);break}
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
  const rd=makeReader(ws),mm=buildMergeMap(ws);
  const isMaster=(r,c)=>!mm[r+':'+c]||mm[r+':'+c]===stage42CellAddress(r,c);
  let labels=0,actions=0,numbered=0,firstActionRow=0;
  const maxRow=Math.min(ws.rowCount||0,2000),maxCol=Math.min(ws.columnCount||13,13);
  for(let r=1;r<=maxRow;r++){
    for(let c=1;c<=Math.min(7,maxCol);c++){
      if(!isMaster(r,c)||!/^Действие(?:я)?$/iu.test(rd.text(r,c)))continue;
      labels++;
      for(let col=c+1;col<=maxCol;col++){
        if(isMaster(r,col)&&stage42ActionCandidate(rd.text(r,col))){
          actions++;
          if(!firstActionRow)firstActionRow=r;
        }
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
  rated.sort((a,b)=>
    b.count-a.count || b.labels-a.labels ||
    Number(/СОП|SOP/iu.test(b.ws.name))-Number(/СОП|SOP/iu.test(a.ws.name)) ||
    a.index-b.index);
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
  const rd=makeReader(ws),mm=buildMergeMap(ws),warnings=[],steps=[];
  const master=(r,c)=>!mm[r+':'+c]||mm[r+':'+c]===stage42CellAddress(r,c);
  const actionRows=[];
  for(let r=1;r<=ws.rowCount;r++)for(let c=1;c<=Math.min(7,ws.columnCount||7);c++){
    if(/^Действие(?:я)?$/iu.test(rd.text(r,c))&&master(r,c)){
      actionRows.push({row:r,labelCol:c});break;
    }
  }
  const anchors=[];
  for(const ar of actionRows)for(let c=ar.labelCol+1;c<=Math.min(ws.columnCount,13);c++){
    if(!master(ar.row,c))continue;
    const value=rd.text(ar.row,c);
    if(!stage42ActionCandidate(value))continue;
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
    const moments=km.text?km.text.split(/\n+/u).map(x=>x.replace(/^\s*\d+\s*[.)]\s*/u,'').trim()).filter(Boolean):[];
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
    if(moments.length>3)warnings.push('В шаге '+steps.length+' более трёх КМ. Разделите их перед загрузкой.');
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
        source:ws.name+'!'+stage42CellAddress(row,col),assigned:-1};
      // Preserve accepted C:E/F:I/J:L matching and visualization-row rule.
      if(vizRows.has(row)){
        const nextAction=actionRows.find(a=>a.row>row)?.row;
        const targetCol=col>=3&&col<=5?3:col>=6&&col<=9?6:col>=10&&col<=12?10:0;
        if(nextAction&&targetCol){
          const index=steps.findIndex(s=>s.source.action===stage42CellAddress(nextAction,targetCol));
          if(index!==-1&&!media.some(m=>m.assigned===index)){
            record.assigned=index;steps[index].photoIndex=media.length;
          }
        }
      }
      media.push(record);
    }catch(error){warnings.push('Не удалось распознать отдельное изображение: '+String(error.message||error))}
  }
  const orphan=media.filter(x=>x.assigned===-1).length;
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
