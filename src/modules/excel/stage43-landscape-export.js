// Stage43: XLSX output format only. No mutation of SOP, draft, library,
// importer, preview, AI or FRV. The selection is a transient export option.
const STAGE43_LANDSCAPE_LANES=Object.freeze([[2,4],[5,8],[9,10],[11,13]].map(Object.freeze));
const STAGE43_LANDSCAPE_WIDTHS=Object.freeze([7,18,15,9,12,12,10,8,34,8,17,17,8]);
let stage43ExportFormat='portrait';
function stage43SetExportFormat(value){
  stage43ExportFormat=value==='landscape'?'landscape':'portrait';
  document.querySelectorAll('[data-stage43-export-format]').forEach(b=>{
    const active=b.dataset.stage43ExportFormat===stage43ExportFormat;
    b.setAttribute('aria-pressed',String(active));
    b.style.background=active?'#c00000':'#fff';
    b.style.color=active?'#fff':'#334155';
    b.style.borderColor=active?'#c00000':'#cbd5e1';
  });
}
function stage43ExportToolbar(id){
  const panel=document.createElement('div');
  panel.id=id;
  panel.setAttribute('role','group');
  panel.setAttribute('aria-label','Формат выгрузки СОП');
  panel.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;font-size:12px';
  const label=document.createElement('span');
  label.textContent='Формат СОП:';
  label.style.fontWeight='600';
  panel.append(label);
  for(const [value,title] of [['portrait','Книжный (вертикальный)'],['landscape','Альбомный (горизонтальный)']]){
    const btn=document.createElement('button');
    btn.type='button';
    btn.dataset.stage43ExportFormat=value;
    btn.textContent=title;
    btn.style.cssText='border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer';
    btn.addEventListener('click',()=>stage43SetExportFormat(value));
    panel.append(btn);
  }
  return panel;
}
function stage43InitExportFormat(){
  for(const [anchor,id] of [['generateBtn','stage43EditorExportFormat'],['docDownloadXlsxBtn','stage43LibraryExportFormat']]){
    const btn=$(anchor);
    if(btn&&!$(id))btn.before(stage43ExportToolbar(id));
  }
  stage43SetExportFormat(stage43ExportFormat);
}
// Layout reconstructed from the documented Stage42 real-file audit:
// A9 visualization, A10 action, A11 KM, A12 reason; B/E/I/K anchors.
// Four-action rows use distinct time cells D/H/J/M. Header is a
// reconstruction, not a certified byte-for-byte original corporate blank.
async function stage43WriteLandscape(wb,ws,data,M,status){
  ws.columns=STAGE43_LANDSCAPE_WIDTHS.map(width=>({width}));
  const m=data.meta,steps=data.steps;
  const B={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
  const GRAY={type:'pattern',pattern:'solid',fgColor:{argb:'FFECEAE5'}};
  const DISC={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9D9D9'}};
  const C={horizontal:'center',vertical:'middle',wrapText:true};
  const T={horizontal:'left',vertical:'top',wrapText:true};
  const L={horizontal:'left',vertical:'middle',wrapText:true};
  const RED='FFC00000',MUTED='FF85878C';
  const label={font:{size:10,color:{argb:MUTED}},alignment:L};
  const section={fill:GRAY,font:{size:10,bold:true},alignment:L};
  const sign={font:{size:10},alignment:T};
  const val={font:{size:11,bold:true},alignment:T};
  const ag=data.agreedList.filter(a=>String(a.post||'').trim()||String(a.name||'').trim());
  const signText=a=>a?[a.post||'','____________ '+(a.name||'')].join('\n'):'';
  const resp=data.responsibles.filter(x=>x&&x.trim()).join('\n');
  const rows=Array.from({length:8},(_,i)=>[34,34,32,32,48,48,30,46][i]);
  rows[1]=clamp(Math.max(textLines(m.approverPost,25),textLines('СТАНДАРТНАЯ ОПЕРАЦИОННАЯ - ТЕХНОЛОГИЧЕСКАЯ КАРТА',28))*13+10,34,120);
  rows[2]=clamp(textLines(m.department,20)*15+8,32,180);
  rows[3]=clamp(textLines(resp,34)*12+8,32,180);
  const discH=clamp(Math.ceil((textLines(DISCLAIMER,72)*11+16)/2),48,180);
  rows[4]=Math.max(discH,clamp(textLines(signText(ag[0]),25)*13+10,32,180));
  rows[5]=Math.max(discH,clamp(textLines(signText(ag[1]),25)*13+10,32,180));
  rows[6]=clamp(textLines(signText(ag[2]),25)*13+10,30,180);
  const hasIcons=data.safetyIconIds.length>0;
  rows[7]=clamp(Math.max(textLines(m.safety,30)+(hasIcons?3:0),textLines(m.tools,30),textLines(m.material,44),textLines(m.executor,22))*14+16,hasIcons?68:46,400);
  rows.forEach((h,i)=>{ws.getRow(i+1).height=h});
  M(1,1,1,2,'',{});
  M(1,3,1,5,m.branch,{font:{size:12},alignment:C});
  M(1,6,1,6,'СОП №:',{...label,alignment:C});
  M(1,7,1,10,m.sopNumber,{font:{size:13,bold:true},alignment:C});
  M(1,11,1,11,'Дата:',{...label,alignment:C});
  M(1,12,1,13,'УТВЕРЖДАЮ:',section);
  M(2,1,2,2,'Подразделение:',label);
  M(2,3,2,5,'СТАНДАРТНАЯ ОПЕРАЦИОННАЯ - ТЕХНОЛОГИЧЕСКАЯ КАРТА',{...section,alignment:C});
  M(2,6,2,7,'Время СОП:',{...label,alignment:C});
  M(2,8,2,10,'Ответственная рабочая группа:',label);
  let date='';
  if(m.date){
    const p=String(m.date).split('-').map(Number);
    date=new Date(Date.UTC(p[0],p[1]-1,p[2]));
  }
  M(2,11,2,11,date,{alignment:C});
  if(date)ws.getCell('K2').numFmt='dd.mm.yyyy';
  M(2,12,2,13,m.approverPost,sign);
  M(3,1,3,2,m.department,val);
  M(3,3,6,5,m.operation,{font:{size:20,bold:true,color:{argb:'FFE30613'}},alignment:C});
  M(3,6,3,7,data.totalTimeSeconds/86400,{font:{size:17,bold:true},alignment:C});
  ws.getCell('F3').numFmt='[mm]:ss';
  M(3,8,4,10,resp,sign);
  M(3,11,4,11,'',{});
  M(3,12,3,13,'____________ '+(m.approverName||''),sign);
  M(4,1,4,2,'Рабочее место:',label);
  M(4,6,4,7,'QR',{...label,alignment:C});
  M(4,12,4,13,'СОГЛАСОВАНО:',section);
  M(5,1,5,2,m.workplace,val);
  M(5,6,6,11,DISCLAIMER,{fill:DISC,font:{size:8,color:{argb:'FFFF0000'}},alignment:T});
  M(5,12,5,13,signText(ag[0]),sign);
  M(6,1,6,2,'Исполнитель:',label);
  M(6,12,6,13,signText(ag[1]),sign);
  M(7,1,8,2,m.executor,val);
  M(7,3,7,5,'Требования к безопасности:',section);
  M(7,6,7,8,'Инструмент, оснастка, приспособления:',section);
  M(7,9,7,11,'Материал:',section);
  M(7,12,7,13,signText(ag[2]),sign);
  M(8,3,8,5,(hasIcons?'\n\n':'')+m.safety,{font:{size:10},alignment:T});
  M(8,6,8,8,m.tools,{font:{size:10},alignment:T});
  M(8,9,8,11,m.material,{font:{size:10},alignment:T});
  M(8,12,8,13,'',{});
  try{
    const id=wb.addImage({base64:makeLogo().split(',')[1],extension:'png'});
    ws.addImage(id,sopExcelImageRange(ws,{col:.08,row:.08},110,22));
  }catch(error){console.warn('logo',error)}
  if(hasIcons){
    status.textContent='Загрузка пиктограмм ISO 7010...';
    try{
      const strip=await buildIconStripPng(data.safetyIconIds,24);
      if(strip){
        const width=Math.min(strip.width,STAGE43_LANDSCAPE_WIDTHS.slice(2,5).reduce((a,b)=>a+b*7,0)-12);
        const id=wb.addImage({base64:strip.dataUrl.split(',')[1],extension:'png'});
        ws.addImage(id,sopExcelImageRange(ws,{col:2.05,row:7.05},width,strip.height*width/strip.width));
        if(strip.loaded<strip.total)toast('Загрузилось '+strip.loaded+' из '+strip.total+' пиктограмм ISO 7010','info');
      }else toast('Не удалось загрузить пиктограммы ISO 7010','info');
    }catch(error){console.warn('icons',error);toast('Не удалось загрузить пиктограммы ISO 7010','info')}
    status.textContent='Генерация Excel-файла...';
  }
  const lanes=STAGE43_LANDSCAPE_LANES;
  const rowLabel=(r,text,color=MUTED)=>M(r,1,r,1,text,{fill:GRAY,font:{size:9,color:{argb:color}},alignment:{textRotation:90,horizontal:'center',vertical:'middle',wrapText:true}});
  const width=(a,b)=>STAGE43_LANDSCAPE_WIDTHS.slice(a-1,b).reduce((sum,n)=>sum+n,0);
  const lines=(text,a,b,font)=>textLines(String(text||''),Math.max(10,Math.floor(width(a,b)*10/font)));
  let r=9,photoCount=0;
  const timeRefs=[];
  for(let i=0;i<steps.length;i+=4){
    const g=steps.slice(i,i+4);
    ws.getRow(r).height=g.some(s=>s._excelPhoto)?120:30;
    rowLabel(r,'Визуализация');
    for(let k=0;k<lanes.length;k++){
      const [a,b]=lanes[k],s=g[k];
      M(r,a,r,b,'',{alignment:C});
      if(s?._excelPhoto){
        const frame=sopExcelPhotoVisibleExtent(ws,a,b,r);
        const bg=wb.addImage(await sopExcelPhotoBackground(s._excelPhoto,frame.ext));
        ws.addImage(bg,frame);
        const fg=wb.addImage({base64:s._excelPhoto.base64,extension:s._excelPhoto.extension});
        ws.addImage(fg,sopExcelPhotoForeground(ws,s._excelPhoto,frame));
        photoCount++;
      }
    }
    r++;
    rowLabel(r,'Действие',RED);
    let n=1;
    for(let k=0;k<lanes.length;k++){
      const [a,b]=lanes[k],s=g[k];
      const action=s?(i+k+1)+'. '+s.action:'';
      M(r,a,r,b-1,action,{font:{size:14,bold:true,color:{argb:RED}},alignment:T});
      const t=ws.getCell(r,b);
      t.value=s?(Number(s.durationSeconds)||0)/86400:'';
      t.numFmt='[mm]:ss';t.font={size:13,bold:true,color:{argb:RED}};t.fill=GRAY;t.alignment=C;t.border=B;
      if(s)timeRefs.push(t.address);
      n=Math.max(n,lines(action,a,b-1,14));
    }
    ws.getRow(r).height=clamp(n*18+12,32,409);r++;
    rowLabel(r,'Ключевой момент');
    n=1;
    for(let k=0;k<lanes.length;k++){
      const [a,b]=lanes[k],s=g[k];
      const km=s?s.keyMoments.filter(x=>x&&x.trim()).map((x,j)=>(j+1)+'. '+x).join('\n'):'';
      M(r,a,r,b,km,{font:{size:11},alignment:T});
      n=Math.max(n,lines(km,a,b,11));
    }
    ws.getRow(r).height=clamp(n*15+12,34,409);r++;
    rowLabel(r,'Причина');
    n=1;
    for(let k=0;k<lanes.length;k++){
      const [a,b]=lanes[k],reason=g[k]?.reason||'';
      M(r,a,r,b,reason,{font:{size:11,color:{argb:MUTED}},alignment:T});
      n=Math.max(n,lines(reason,a,b,11));
    }
    ws.getRow(r).height=clamp(n*15+12,28,409);r++;
  }
  if(timeRefs.length)ws.getCell('F3').value={formula:timeRefs.join('+'),result:data.totalTimeSeconds/86400};
  M(r,1,r,13,'! Время действия писать в формате: мм:сс',{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFA6A6A6'}},font:{size:14,bold:true,color:{argb:'FFFFFFFF'}},alignment:L});
  ws.getRow(r).height=26;
  ws.pageSetup.printArea='A1:M'+r;
  return photoCount;
}
stage43InitExportFormat();

// Display the actual release identity after the Stage42 runtime has loaded.
function stage43SetReleaseLabel(){
  const label=$('sopVersionLabel');
  if(label)label.textContent='· Stage43 (форматы экспорта XLSX)';
}
function stage43InitReleaseLabel(){
  const renderAccepted=renderSteps;
  renderSteps=function(){const result=renderAccepted.apply(this,arguments);stage43SetReleaseLabel();return result};
  stage43SetReleaseLabel();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stage43InitReleaseLabel,{once:true});
else queueMicrotask(stage43InitReleaseLabel);
