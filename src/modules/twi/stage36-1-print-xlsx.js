// Stage36.1: print-ready TWI Job Instruction export (not a new TWI editor).
// The Job Breakdown Sheet uses actual SOP Important Steps, Key Points and
// Reasons; the separate instructor sheet uses the reviewed 4-stage TWI plan.
// No AI call, photo rewrite, document mutation or network access on export.
const TWI_PRINT_SCHEME={
  navy:'FF19364C',blue:'FF285D79',pale:'FFEAF3F8',white:'FFFFFFFF',
  ink:'FF1C3444',muted:'FF64748B',line:'FFCEDAE3',warn:'FFFFF0D1',
  warnText:'FF9A5A0B',light:'FFF7FAFC'
};
function twiPrintText(value){
  return String(value===null||value===undefined?'':value).replace(/\r\n?/g,'\n').trim();
}
function twiPrintSnapshot(){
  const source=state||{};
  const t=JSON.parse(JSON.stringify(source.twi||{}));
  // Read values visible in the form, without calling htmlToTwi(): that
  // function would modify the live document, including published SOPs.
  const protectedDoc=['Опубликован','Архив'].includes(source.documentManager?.status);
  if(!protectedDoc){
    const fields={
      trainer:'twi-trainer',trainee:'twi-trainee',
      'prepare.purpose':'twi-purpose','prepare.known':'twi-known',
      'prepare.prep':'twi-prep','prepare.interest':'twi-interest',
      'present.round1':'twi-round1','present.round2':'twi-round2',
      'present.round3':'twi-round3','tryOut.perform':'twi-tryout',
      'tryOut.explain':'twi-explain','tryOut.check':'twi-check',
      'tryOut.correct':'twi-correct','followUp.help':'twi-help',
      'followUp.control':'twi-frequency','followUp.observe':'twi-observe',
      'followUp.close':'twi-close'
    };
    for(const [key,id] of Object.entries(fields)){
      const input=$(id);if(!input)continue;
      if(key.includes('.')){
        const [section,field]=key.split('.');
        t[section]=t[section]||{};t[section][field]=input.value;
      }else t[key]=input.value;
    }
  }
  const steps=(Array.isArray(source.steps)?source.steps:[]).map((step,i)=>({
    index:i+1,action:twiPrintText(step.action),
    keyPoints:(Array.isArray(step.keyMoments)?step.keyMoments:[])
      .map(twiPrintText).filter(Boolean),
    reason:twiPrintText(step.reason)
  }));
  return {meta:JSON.parse(JSON.stringify(source.meta||{})),twi:t,
    steps,docStatus:source.documentManager?.status||'Черновик',
    sourceSignature:twiSourceSignature()};
}
function twiPrintIssues(data){
  if(!data.steps.length||data.steps.every(x=>!x.action))
    throw new Error('Добавьте основные шаги в СОП перед экспортом TWI.');
  if(!twiHasGeneratedContent(data.twi))
    throw new Error('Сначала сформируйте план TWI из СОП в этой вкладке.');
  const issues=[];
  if(data.twi.sourceSignature&&data.twi.sourceSignature!==data.sourceSignature)
    issues.push('СОП изменился после генерации TWI — обновите план обучения.');
  for(const step of data.steps){
    if(!step.action){issues.push('Шаг '+step.index+': отсутствует действие.');continue;}
    if(!step.keyPoints.length)issues.push('Шаг '+step.index+': нет ключевых моментов.');
    if(step.keyPoints.length&&!step.reason)
      issues.push('Шаг '+step.index+': нет причины ключевых моментов.');
  }
  if(!twiPrintText(data.meta.safety))
    issues.push('В СОП не указаны требования безопасности.');
  return issues;
}
function twiPrintWrap(text,width){
  const result=[];
  for(const raw of (twiPrintText(text)||' ').split('\n')){
    const words=raw.trim().split(/\s+/).filter(Boolean);
    if(!words.length){result.push('');continue;}
    let line='';
    for(const word of words){
      if(!line){line=word;continue;}
      if(line.length+word.length+1<=width)line+=' '+word;
      else{result.push(line);line=word;}
    }
    if(line)result.push(line);
  }
  return result.length?result:[''];
}
function twiPrintChunks(text,width,maxLines){
  const lines=twiPrintWrap(text,width),parts=[];
  for(let i=0;i<lines.length;i+=maxLines)
    parts.push(lines.slice(i,i+maxLines).join('\n'));
  return parts.length?parts:[''];
}
function twiPrintHeight(parts,chars,base=16){
  return Math.max(28,Math.min(240,Math.max(...parts.map((x,i)=>
    twiPrintWrap(x,chars[i]).length))*base+14));
}
function twiPrintTitle(ws,ref,value,options={}){
  ws.mergeCells(ref);
  const cell=ws.getCell(ref.split(':')[0]);
  cell.value=value;
  cell.font={name:'Arial',size:options.size||10,bold:!!options.bold,
    color:{argb:options.color||TWI_PRINT_SCHEME.ink}};
  cell.alignment={vertical:'middle',horizontal:options.center?'center':'left',
    wrapText:true,indent:options.center?0:1};
  if(options.fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:options.fill}};
  if(options.border)cell.border={
    bottom:{style:'thin',color:{argb:TWI_PRINT_SCHEME.line}}};
  return cell;
}
function twiPrintPage(ws,orientation,repeatRange){
  ws.views=[{state:'frozen',ySplit:Number(repeatRange.split(':')[1])||8,
    showGridLines:false}];
  ws.pageSetup={
    paperSize:9,orientation,fitToPage:true,fitToWidth:1,fitToHeight:0,
    margins:{left:.32,right:.32,top:.55,bottom:.55,header:.2,footer:.2},
    horizontalCentered:true
  };
  ws.headerFooter.oddFooter='&LTWI · Job Instruction&RСтраница &P из &N';
  ws.pageSetup.printTitlesRow=repeatRange;
}
function twiPrintRow(ws,r,values,colorAlternate=false){
  const row=ws.getRow(r);
  for(let col=1;col<=values.length;col++){
    const cell=row.getCell(col);
    cell.value=values[col-1];
    cell.font={name:'Arial',size:10,color:{argb:TWI_PRINT_SCHEME.ink},
      bold:col===1};
    cell.alignment={vertical:'top',horizontal:col===1?'center':'left',
      wrapText:true,indent:col===1?0:1};
    cell.border={bottom:{style:'hair',color:{argb:TWI_PRINT_SCHEME.line}},
      right:{style:'hair',color:{argb:TWI_PRINT_SCHEME.line}}};
    if(colorAlternate)cell.fill={type:'pattern',pattern:'solid',
      fgColor:{argb:TWI_PRINT_SCHEME.light}};
  }
  return row;
}
function twiPrintBreakdown(wb,data,issues){
  const ws=wb.addWorksheet('Карта разбора работы');
  twiPrintPage(ws,'landscape','1:10');
  ws.columns=[{width:7},{width:39},{width:50},{width:49}];
  twiPrintTitle(ws,'A1:D1','TWI  /  JOB INSTRUCTION  /  КАРТА РАЗБОРА РАБОТЫ',
    {size:16,bold:true,fill:TWI_PRINT_SCHEME.navy,color:TWI_PRINT_SCHEME.white});
  ws.getRow(1).height=36;
  twiPrintTitle(ws,'A2:D2','Для наставника: важные шаги (ЧТО) — ключевые моменты (КАК) — причины (ПОЧЕМУ).', {size:10,fill:TWI_PRINT_SCHEME.pale});
  ws.getRow(2).height=25;
  const m=data.meta||{},t=data.twi||{};
  twiPrintTitle(ws,'A3:B3','Операция: '+twiPrintText(m.operation),{bold:true,border:true});
  twiPrintTitle(ws,'C3:D3','СОП № / версия: '+twiPrintText(m.sopNumber),{border:true});
  twiPrintTitle(ws,'A4:B4','Участок: '+twiPrintText(m.department),{border:true});
  twiPrintTitle(ws,'C4:D4','Рабочее место: '+twiPrintText(m.workplace),{border:true});
  twiPrintTitle(ws,'A5:B5','Инструмент и оснастка: '+twiPrintText(m.tools),{border:true});
  twiPrintTitle(ws,'C5:D5','Материалы: '+twiPrintText(m.material),{border:true});
  twiPrintTitle(ws,'A6:D6','Безопасность / СИЗ: '+twiPrintText(m.safety),{border:true,fill:TWI_PRINT_SCHEME.pale});
  twiPrintTitle(ws,'A7:B7','Наставник: '+twiPrintText(t.trainer),{border:true});
  twiPrintTitle(ws,'C7:D7','Обучаемый: '+twiPrintText(t.trainee),{border:true});
  twiPrintTitle(ws,'A8:B8','Дата СОП: '+twiPrintText(m.date),{border:true});
  twiPrintTitle(ws,'C8:D8','Статус СОП: '+data.docStatus,{border:true});
  twiPrintTitle(ws,'A9:D9',issues.length?
    'ПРОЕКТ — ТРЕБУЕТ ПРОВЕРКИ: '+issues.length+' замечаний к исходным данным.':
    'Проверено наличие шагов и заполнение ключевых моментов/причин в исходном СОП.',
    {size:9,fill:issues.length?TWI_PRINT_SCHEME.warn:TWI_PRINT_SCHEME.pale,
      color:issues.length?TWI_PRINT_SCHEME.warnText:TWI_PRINT_SCHEME.ink});
  ws.getRow(9).height=24;
  const labels=['№','ВАЖНЫЕ ШАГИ · ЧТО?','КЛЮЧЕВЫЕ МОМЕНТЫ · КАК?','ПРИЧИНЫ · ПОЧЕМУ?'];
  const head=ws.getRow(10);
  head.values=labels;head.height=35;
  for(let c=1;c<=4;c++){
    const cell=head.getCell(c);
    cell.font={name:'Arial',size:11,bold:true,color:{argb:TWI_PRINT_SCHEME.white}};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:TWI_PRINT_SCHEME.blue}};
  }
  let row=11;
  for(const st of data.steps){
    const kp=st.keyPoints.map((x,i)=>(i+1)+'. '+x).join('\n');
    const left=twiPrintChunks(st.action||'— не заполнено',33,10);
    const middle=twiPrintChunks(kp||'— не указаны',43,10);
    const right=twiPrintChunks(st.reason||'— не указаны',42,10);
    const max=Math.max(left.length,middle.length,right.length);
    for(let i=0;i<max;i++){
      const parts=[i===0?st.index:st.index+' (прод.)',left[i]||'',middle[i]||'',right[i]||''];
      const r=twiPrintRow(ws,row,parts,st.index%2===0);
      const lineCount=Math.max(...parts.slice(1).map((v,j)=>
        twiPrintWrap(v,[33,43,42][j]).length));
      r.height=Math.max(32,Math.min(220,lineCount*14+16));
      row++;
    }
  }
  row++;
  twiPrintTitle(ws,'A'+row+':D'+row,
    'Ключевой момент — то, что влияет на безопасность, качество или облегчает работу. Причина должна объяснять, почему он важен.',
    {size:9,fill:TWI_PRINT_SCHEME.pale});
  ws.getRow(row).height=30;
  row++;
  twiPrintTitle(ws,'A'+row+':B'+row,'Подготовил: ___________________________');
  twiPrintTitle(ws,'C'+row+':D'+row,'Дата проверки: ________________________');
  ws.getRow(row).height=29;
  if(issues.length){
    row++;
    twiPrintTitle(ws,'A'+row+':D'+row,'ПРОВЕРИТЬ ПЕРЕД ОБУЧЕНИЕМ:',{
      bold:true,fill:TWI_PRINT_SCHEME.warn,color:TWI_PRINT_SCHEME.warnText});
    ws.getRow(row).height=24;
    for(const issue of issues){
      row++;
      twiPrintTitle(ws,'A'+row+':D'+row,'• '+issue,{size:9});
      ws.getRow(row).height=25;
    }
  }
  ws.pageSetup.printArea='A1:D'+row;
  return ws;
}
const TWI_PRINT_SECTIONS=[
  {title:'1. ПОДГОТОВИТЬ РАБОТНИКА',fields:[
    ['Цель обучения','prepare','purpose'],['Что работник уже знает','prepare','known'],
    ['Подготовка рабочего места','prepare','prep'],['Поставить задачу и заинтересовать','prepare','interest']]},
  {title:'2. ПРЕДСТАВИТЬ РАБОТУ',fields:[
    ['Показ операции целиком','present','round1'],['Важные шаги и ключевые моменты','present','round2'],
    ['Проверить понимание причин','present','round3']]},
  {title:'3. ПРОБНОЕ ВЫПОЛНЕНИЕ',fields:[
    ['Самостоятельное выполнение','tryOut','perform'],['Объяснение шагов, моментов и причин','tryOut','explain'],
    ['Что проверяет наставник','tryOut','check'],['Исправление ошибок','tryOut','correct']]},
  {title:'4. СОПРОВОЖДЕНИЕ',fields:[
    ['К кому обратиться за помощью','followUp','help'],['Что контролировать','followUp','control'],
    ['Какие признаки наблюдать','followUp','observe'],['Критерии окончания обучения','followUp','close']]}
];
function twiPrintInstructor(wb,data,issues){
  const ws=wb.addWorksheet('План наставника');
  twiPrintPage(ws,'portrait','1:6');
  ws.columns=[{width:7},{width:38},{width:68}];
  twiPrintTitle(ws,'A1:C1','TWI  /  JOB INSTRUCTION  /  ПЛАН НАСТАВНИКА',
    {size:15,bold:true,fill:TWI_PRINT_SCHEME.navy,color:TWI_PRINT_SCHEME.white});
  ws.getRow(1).height=36;
  twiPrintTitle(ws,'A2:C2','Четыре этапа инструктажа: подготовить → показать → пробное выполнение → сопровождать.',
    {size:10,fill:TWI_PRINT_SCHEME.pale});
  ws.getRow(2).height=27;
  twiPrintTitle(ws,'A3:C3','Операция: '+twiPrintText(data.meta?.operation),{bold:true,border:true});
  twiPrintTitle(ws,'A4:C4','Наставник: '+twiPrintText(data.twi.trainer)+
    '    Обучаемый: '+twiPrintText(data.twi.trainee),{border:true});
  twiPrintTitle(ws,'A5:C5','СОП №: '+twiPrintText(data.meta?.sopNumber)+
    '    Дата СОП: '+twiPrintText(data.meta?.date),{border:true});
  twiPrintTitle(ws,'A6:C6',issues.length?
    'ПРОЕКТ: проверьте отмеченные пропуски перед проведением инструктажа.':
    'Инструктор использует карту разбора работы с другого листа.',
    {fill:issues.length?TWI_PRINT_SCHEME.warn:TWI_PRINT_SCHEME.pale,
      color:issues.length?TWI_PRINT_SCHEME.warnText:TWI_PRINT_SCHEME.ink});
  for(let r=3;r<=6;r++)ws.getRow(r).height=27;
  let row=7;
  for(const [si,section] of TWI_PRINT_SECTIONS.entries()){
    twiPrintTitle(ws,'A'+row+':C'+row,section.title,{size:11,bold:true,
      fill:TWI_PRINT_SCHEME.blue,color:TWI_PRINT_SCHEME.white});
    ws.getRow(row).height=28;row++;
    for(const [name,group,field] of section.fields){
      const txt=twiPrintText(data.twi?.[group]?.[field])||'— не заполнено';
      const chunks=twiPrintChunks(txt,56,11);
      for(let i=0;i<chunks.length;i++){
        twiPrintRow(ws,row,[i===0?'•':'↳',i===0?name:'Продолжение',chunks[i]],si%2===1);
        const lines=twiPrintWrap(chunks[i],56).length;
        ws.getRow(row).height=Math.max(29,Math.min(220,lines*14+13));
        if(txt==='— не заполнено'){
          ws.getCell('C'+row).font={name:'Arial',size:10,italic:true,
            color:{argb:TWI_PRINT_SCHEME.warnText}};
        }
        row++;
      }
    }
  }
  row++;
  twiPrintTitle(ws,'A'+row+':C'+row,
    'Практическая проверка: работник выполняет операцию и объясняет важные шаги, ключевые моменты и причины.',
    {size:9,fill:TWI_PRINT_SCHEME.pale});
  ws.getRow(row).height=33;row++;
  twiPrintTitle(ws,'A'+row+':C'+row,
    'Подпись наставника: _____________________    Дата: ______________');
  ws.getRow(row).height=28;row++;
  twiPrintTitle(ws,'A'+row+':C'+row,
    'Ознакомление обучаемого: ________________    Дата: ______________');
  ws.getRow(row).height=28;row++;
  twiPrintTitle(ws,'A'+row+':C'+row,
    'Методическая основа: https://www.lean.org/lexicon-terms/training-within-industry-twi/',
    {size:8,color:TWI_PRINT_SCHEME.muted});
  ws.getRow(row).height=24;
  ws.pageSetup.printArea='A1:C'+row;
  return ws;
}
function twiCreatePrintWorkbook(data,issues){
  const wb=new ExcelJS.Workbook();
  wb.creator='SOP Constructor';
  wb.subject='TWI Job Instruction - print-ready from accepted SOP/TWI fields';
  wb.title='TWI JI — '+twiPrintText(data.meta?.operation);
  wb.created=new Date();
  twiPrintBreakdown(wb,data,issues);
  twiPrintInstructor(wb,data,issues);
  return wb;
}
async function exportTwiPrintXlsx(){
  const btn=$('twiExportXlsxBtn'),status=$('twiExportStatus');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  if(status)status.textContent='Проверяю TWI и исходный СОП…';
  try{
    const data=twiPrintSnapshot();
    const issues=twiPrintIssues(data);
    if(issues.length&&!confirm('TWI содержит '+issues.length+
      ' замечаний к исходным данным. Сохранить печатный ПРОЕКТ с явной пометкой?\n\n'+
      issues.slice(0,8).join('\n')+(issues.length>8?'\n…':''))){
      if(status)status.textContent='Экспорт отменён. СОП и TWI не изменены.';
      return;
    }
    await ensureExcelJS();
    const wb=twiCreatePrintWorkbook(data,issues);
    if(status)status.textContent='Формирую листы для печати…';
    const buffer=await wb.xlsx.writeBuffer();
    const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);
    try{
      const a=document.createElement('a');
      a.href=url;
      const operation=twiPrintText(data.meta.operation).replace(/[\\/:*?"<>|]+/g,'_')
        .replace(/\s+/g,' ').slice(0,60)||'Без_названия';
      a.download='TWI_JI_'+operation+'.xlsx';
      document.body.appendChild(a);a.click();a.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
    if(status)status.textContent='Готово: 2 листа A4 для печати'+
      (issues.length?' · проект с замечаниями':'');
    toast('TWI сохранён в XLSX для печати (карта работы + план наставника)','success');
  }catch(e){
    if(status)status.textContent='Ошибка экспорта: '+e.message;
    toast('Не удалось скачать TWI XLSX: '+e.message,'error');
    console.error('[TWI print]',e);
  }finally{btn.disabled=false}
}
(function bindTwiPrintExport(){
  $('twiExportXlsxBtn')?.addEventListener('click',exportTwiPrintXlsx);
})();
