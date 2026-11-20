// Stage34 standalone FRV report. This is an OUTPUT, never an Excel input.
// Uses bundled local ExcelJS, does not alter SOP's accepted XLSX/photo exporter.
async function frv34ExportXlsx(){
  frvStudySyncFields();
  const d=ensureFrvStudy(),btn=$('frvStudyExportXlsxBtn');
  if(btn)btn.disabled=true;
  try{
    try{await frvStudyFlush()}catch(e){
      // The external Excel copy is the emergency escape when browser storage
      // is unavailable: do not make the rescue copy depend on IndexedDB.
      toast('Локальное сохранение не удалось: выгружаем внешнюю копию в Excel.','warning');
    }
    if(typeof ExcelJS==='undefined')throw new Error('Локальная библиотека ExcelJS не загружена');
    const wb=new ExcelJS.Workbook();
    wb.creator='Конструктор СОП — Анализ ФРВ';
    wb.title='Исследование ФРВ · '+String(d.operationId||'Операция');
    wb.subject='FRV-STUDY-34 · исследование и фактические замеры';
    wb.created=new Date();
    const fmt=n=>Number.isFinite(Number(n))?Number(n):null;
    const a=frv34AnalyticsData(d),date=new Date().toLocaleString('ru-RU');
    const sheet=(name,widths)=>{
      const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:6}]});
      ws.columns=widths.map(w=>({width:w}));
      ws.pageSetup={paperSize:9,orientation:'landscape',
        fitToPage:true,fitToWidth:1,fitToHeight:0};
      return ws;
    };
    const header=(ws,title,notes,columnCount)=>{
      ws.mergeCells(1,1,1,columnCount);
      const main=ws.getCell(1,1);
      main.value=title;main.font={bold:true,size:16,color:{argb:'FF173B57'}};
      ws.getRow(1).height=28;
      ws.mergeCells(2,1,2,columnCount);
      ws.getCell(2,1).value='Операция: '+String(d.operationId||'Без названия')+
        ' · Место: '+String(d.workplace||'—')+
        ' · Номер: '+String(d.studyId||'—');
      ws.mergeCells(3,1,3,columnCount);
      ws.getCell(3,1).value='Экспорт: '+date+' · '+notes;
      ws.getRow(3).height=22;
    };
    const tableHeading=(ws,index,labels)=>{
      const row=ws.getRow(index);
      labels.forEach((s,i)=>{
        const cell=row.getCell(i+1);
        cell.value=s;cell.font={bold:true,color:{argb:'FFFFFFFF'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF214F6D'}};
        cell.alignment={vertical:'middle',wrapText:true};
      });
      row.height=30;
    };
    const addRow=(ws,values,band=false)=>{
      const row=ws.addRow(values);
      if(band)row.eachCell(cell=>cell.fill={
        type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F6FA'}});
      row.alignment={vertical:'top',wrapText:true};
      return row;
    };
    const obs=sheet('Наблюдения',[12,15,14,55,18,25,24,38,13,13]);
    header(obs,'ФРВ — ФАКТИЧЕСКИЕ НАБЛЮДЕНИЯ',
      'Время только по реально измеренным действиям (сек). Пустое — замер отсутствует.',10);
    tableHeading(obs,5,['Цикл','Группа','№','Фактическое действие','Время, сек',
      'Тип времени','Вид потери','Комментарий','Перем., м','В проект СОП']);
    let rowNum=5;
    for(const c of d.cycles||[])for(const o of c.observations||[]){
      const n=frvStudyMeasuredDuration(o);
      const row=addRow(obs,[
        c.cycleNo,c.phase==='baseline'?'До':c.phase==='improved'?'После':'Без группы',
        o.seqNo,o.actionRaw||'',n===null?null:n,
        FRV_VALUE_LABELS[o.valueType]||'Не определено',
        FRV_LOSS_LABELS[o.lossCode]||'',o.comment||'',
        o.distanceM===null||o.distanceM===''?null:fmt(o.distanceM),
        o.standardCandidate?'Да':'Нет'],rowNum%2===1);
      row.getCell(5).numFmt='0.00';row.getCell(9).numFmt='0.0';
      row.height=28;rowNum++;
    }
    obs.autoFilter={from:'A5',to:'J'+Math.max(6,rowNum)};
    obs.getColumn(4).alignment={wrapText:true};
    const stats=sheet('Анализ',[43,19,25,25,24,24]);
    header(stats,'АНАЛИЗ ЗАТРАТ РАБОЧЕГО ВРЕМЕНИ',
      'Все расчёты выполнены локально по измеренным секундам без ИИ.',6);
    tableHeading(stats,5,['Показатель','Секунды','Доля от измеренных','Примечание']);
    const metric=[
      ['Всего измерено',a.total,a.total?1:null,'Пустые замеры не приравнены к 0'],
      ['ВДЦ — добавление ценности',a.by.VA,a.total?a.by.VA/a.total:null,''],
      ['М2 — необходимая работа',a.by.NVA_Necessary,
        a.total?a.by.NVA_Necessary/a.total:null,''],
      ['М1 — потери',a.by.NVA_Waste,
        a.total?a.by.NVA_Waste/a.total:null,''],
      ['Ожидание',a.by.WAIT,a.total?a.by.WAIT/a.total:null,'Отдельно от М1'],
      ['Перерыв',a.by.BREAK,a.total?a.by.BREAK/a.total:null,'Отдельно от М1'],
      ['Не классифицировано',a.by.OTHER,
        a.total?a.by.OTHER/a.total:null,''],
      ['Неизмеренных или неполных строк',a.missing,null,'Строки, не секунды']
    ];
    for(const data of metric){
      const row=addRow(stats,data);
      row.getCell(2).numFmt='0.00';row.getCell(3).numFmt='0.0%';
    }
    let p=stats.addRow([]).number+1;
    tableHeading(stats,p,['Парето · тип потери','Секунды','% потерь','Накоплено, %','Замеров']);
    for(const entry of a.pareto){
      const row=addRow(stats,[entry.label,entry.durationSec,
        entry.sharePct/100,entry.cumulativePct/100,entry.count]);
      row.getCell(2).numFmt='0.00';row.getCell(3).numFmt='0.0%';row.getCell(4).numFmt='0.0%';
    }
    p=stats.addRow([]).number+1;
    tableHeading(stats,p,['Повторное действие','Число замеров','Среднее, сек',
      'Медиана, сек','Разброс CV, %','Мин–макс, сек']);
    for(const e of a.repeatStats){
      const row=addRow(stats,[e.action,e.samples,e.meanSec,e.medianSec,
        e.cvPct===null?null:e.cvPct/100,e.minSec+' – '+e.maxSec]);
      row.getCell(3).numFmt='0.00';row.getCell(4).numFmt='0.00';
      row.getCell(5).numFmt='0.0%';
    }
    p=stats.addRow([]).number+1;
    tableHeading(stats,p,['Сравнение до / после','Число циклов','Среднее, сек','Примечание']);
    const cp=a.comparison;
    addRow(stats,['До улучшения',cp.baselineCount,cp.baselineSec,
      'Только полностью замеренные циклы']);
    addRow(stats,['После улучшения',cp.improvedCount,cp.improvedSec,
      'Только полностью замеренные циклы']);
    addRow(stats,['Измеренная разница, сек',null,cp.deltaSec,
      cp.comparable?'Сравнимость подтверждена инженером':'Недостаточно данных или нет подтверждения сравнимости']);
    const imp=sheet('Улучшения',[16,55,42,48,23,27]);
    header(imp,'ПРЕДЛОЖЕНИЯ И РЕШЕНИЯ ПО УЛУЧШЕНИЯМ',
      'Оценки ИИ не являются фактическими измерениями и не назначают нормы.',6);
    tableHeading(imp,5,['Источник','Проблема / наблюдение','Предполагаемая причина',
      'Предложенная мера','Статус решения','Эффект, сек (оценка)']);
    const suggestions=Array.isArray(d.analysis?.losses)?d.analysis.losses:[];
    for(const x of suggestions){
      addRow(imp,[x.observationId||'',
        FRV_LOSS_LABELS[x.lossCode]||x.lossCode||'Потеря',
        x.cause||'Требует подтверждения',x.countermeasure||'',
        x.reviewStatus||'Требует проверки',
        x.expectedReductionSec===null?null:fmt(x.expectedReductionSec)]);
    }
    for(const x of d.improvements||[]){
      if(!x.countermeasure)continue;
      addRow(imp,[x.id||'',x.problem||'',x.cause||'',
        x.countermeasure,x.status||'Не рассмотрено',
        x.expectedReductionSec??null]);
    }
    if(!suggestions.length&&!(d.improvements||[]).some(x=>x.countermeasure))
      addRow(imp,['','Пока нет предложений','','','','']);
    for(const ws of [obs,stats,imp]){
      ws.eachRow(row=>row.eachCell(cell=>{
        if(cell.value!==null)cell.alignment={vertical:'middle',wrapText:true};
      }));
    }
    const bytes=await wb.xlsx.writeBuffer();
    const blob=new Blob([bytes],{
      type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    const safe=String(d.operationId||d.studyId||'Исследование').replace(
      /[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g,'_').slice(0,60);
    link.href=url;link.download='ФРВ_Анализ_'+safe+'_'+
      new Date().toISOString().slice(0,10)+'.xlsx';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    toast('Исследование и анализ сохранены в Excel (3 листа).','success');
  }catch(e){console.error('[FRV Excel]',e);toast('Ошибка Excel-экспорта ФРВ: '+e.message,'error')}
  finally{if(btn)btn.disabled=false}
}
(function bindFrv34Excel(){
  $('frvStudyExportXlsxBtn')?.addEventListener('click',frv34ExportXlsx);
})();
