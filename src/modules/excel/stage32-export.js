// ExcelJS 4.4 serializes an unsupported editAs attribute on oneCellAnchor.
// Use standards-valid twoCellAnchor (editAs=oneCell) while preserving pixel
// dimensions and original top-left placement in the SOP template.
function sopExcelImageRange(ws,tl,widthPx,heightPx){
  const startCol=Math.floor(tl.col),startRow=Math.floor(tl.row);
  const col=ws.getColumn(startCol+1),row=ws.getRow(startRow+1);
  const startColOff=Math.floor((tl.col-startCol)*(col.isCustomWidth?col.width*10000:640000));
  const startRowOff=Math.floor((tl.row-startRow)*(row.height?row.height*10000:180000));
  const colEmu=i=>Math.max(90000,Math.round(((ws.getColumn(i+1).width||8.43)*7+5)*9525));
  const rowEmu=i=>Math.max(90000,Math.round((ws.getRow(i+1).height||15)*12700));
  let endCol=startCol,endRow=startRow;
  let endColOff=startColOff+Math.round(widthPx*9525);
  let endRowOff=startRowOff+Math.round(heightPx*9525);
  while(endColOff>=colEmu(endCol)&&endCol<1000){endColOff-=colEmu(endCol);endCol++}
  while(endRowOff>=rowEmu(endRow)&&endRow<10000){endRowOff-=rowEmu(endRow);endRow++}
  return {tl,br:{nativeCol:endCol,nativeColOff:endColOff,nativeRow:endRow,nativeRowOff:endRowOff},editAs:'oneCell'};
}
// Stage32: fill the exact merged Excel photo area (one logical row, several
// columns). Anchors use actual EMU offsets, not ExcelJS 4.4 fractional-column
// offsets which mis-size drawings when column widths are customised.
// The source photo bytes and all pixels remain intact; if the photo aspect
// differs from the merged rectangle, Excel stretches it to fill the frame.
function sopExcelPhotoCellRange(ws,firstCol,lastCol,rowNumber,marginPx=4){
  if(!Number.isInteger(firstCol)||!Number.isInteger(lastCol)||
     !Number.isInteger(rowNumber)||firstCol<1||lastCol<firstCol||rowNumber<1){
    throw new RangeError('Неверная объединённая область фотографии в Excel');
  }
  const pxToEmu=9525;
  const gap=Math.max(0,Number(marginPx)||0)*pxToEmu;
  const lastColumn=ws.getColumn(lastCol);
  const row=ws.getRow(rowNumber);
  // Excel column widths are character units; match the existing workbook
  // writer's width conversion. Excel row heights are in points.
  const lastWidthEmu=Math.round(((lastColumn.width||8.43)*7+5)*pxToEmu);
  const rowHeightEmu=Math.round((row.height||15)*12700);
  if(gap*2>=lastWidthEmu || gap*2>=rowHeightEmu){
    throw new RangeError('Недостаточная высота или ширина фотообласти Excel');
  }
  return {
    tl:{
      nativeCol:firstCol-1,nativeColOff:Math.round(gap),
      nativeRow:rowNumber-1,nativeRowOff:Math.round(gap)
    },
    br:{
      nativeCol:lastCol-1,nativeColOff:lastWidthEmu-Math.round(gap),
      nativeRow:rowNumber-1,nativeRowOff:rowHeightEmu-Math.round(gap)
    },
    editAs:'twoCell' // picture follows changes to merged-cell geometry
  };
}
// Stage32.1: explicit fixed drawing extent in pixels. This is intentionally
// distinct from twoCellAnchor: Excel 2019/365 uses the oneCell xdr:ext as a
// definitive displayed picture size, not just the cell attachment corners.
// Stage32.2: Excel display widths in the user's desktop workbook are closer
// to width * 7 px (without the extra 5 px per column that makes image frames
// intrude into the next merged cell). Keep a safe 6 px inset.
function sopExcelPhotoVisibleExtent(ws,firstCol,lastCol,rowNumber){
  sopExcelPhotoCellRange(ws,firstCol,lastCol,rowNumber);
  const paddingPx=6;
  let availableWidthPx=0;
  for(let col=firstCol;col<=lastCol;col++){
    const width=ws.getColumn(col).width||8.43;
    availableWidthPx+=width*7;
  }
  const availableHeightPx=(ws.getRow(rowNumber).height||15)*96/72;
  const width=Math.floor(availableWidthPx-2*paddingPx);
  const height=Math.floor(availableHeightPx-2*paddingPx);
  if(width<=0||height<=0)throw new RangeError('Недостаточно места для фото Excel');
  return {tl:{
    nativeCol:firstCol-1,nativeColOff:paddingPx*9525,
    nativeRow:rowNumber-1,nativeRowOff:paddingPx*9525
  },ext:{width,height}};
}
// Every source photo remains a separate, unchanged foreground image in XLSX.
// A light, blurred duplicate fills the remaining cell background; the original
// is fitted (never stretched or cropped), so diagrams, labels, and faces keep
// their native proportions. The foreground is written *after* the background:
// XLSX re-import naturally picks the last image anchored to the step.
async function sopExcelPhotoBackground(photo,extent){
  const img=new Image();
  img.src='data:image/'+photo.extension+';base64,'+photo.base64;
  if(typeof img.decode==='function')await img.decode();
  else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Фото не декодируется'))});
  const c=document.createElement('canvas');
  c.width=Math.max(32,Math.round(extent.width*2));
  c.height=Math.max(32,Math.round(extent.height*2));
  const ctx=c.getContext('2d');
  if(!ctx)throw new Error('Canvas недоступен для фона фотографии');
  ctx.fillStyle='#edf0f3';ctx.fillRect(0,0,c.width,c.height);
  const scale=Math.max(c.width/img.naturalWidth,c.height/img.naturalHeight);
  const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  ctx.save();
  ctx.filter='blur(24px)';
  ctx.globalAlpha=.34;
  ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.58)';
  ctx.fillRect(0,0,c.width,c.height);
  return {base64:c.toDataURL('image/jpeg',.82).split(',')[1],extension:'jpeg'};
}
function sopExcelPhotoForeground(ws,photo,area){
  const ratio=Math.min(area.ext.width/photo.width,area.ext.height/photo.height);
  if(!Number.isFinite(ratio)||ratio<=0)throw new Error('Неверные пропорции фотографии');
  const width=Math.max(1,Math.min(area.ext.width,Math.round(photo.width*ratio)));
  const height=Math.max(1,Math.min(area.ext.height,Math.round(photo.height*ratio)));
  let col=area.tl.nativeCol;
  let off=Math.round(area.tl.nativeColOff+(area.ext.width-width)*9525/2);
  const emuPerPx=9525;
  while(col<12){
    const columnWidth=Math.round((ws.getColumn(col+1).width||8.43)*7*emuPerPx);
    if(off<columnWidth)break;
    off-=columnWidth;col++;
  }
  return {tl:{
    nativeCol:col,nativeColOff:off,
    nativeRow:area.tl.nativeRow,
    nativeRowOff:Math.round(area.tl.nativeRowOff+(area.ext.height-height)*emuPerPx/2)
  },ext:{width,height}};
}
// ExcelJS 4.4 writes an unsupported editAs attribute on oneCellAnchor, causing
// some spreadsheet readers to discard the picture. Rewrite only this XML tag,
// and do not decode/re-encode image bytes, formulas, workbook, or any ZIP entry
// other than the drawing XML. ZIP entries are copied with original compression.
async function sopXlsxFixPictureAnchors(input,expectedPictures){
  if(typeof DecompressionStream!=='function')throw new Error('Требуется актуальный Chrome/Edge для экспорта изображений Excel');
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  const get16=(a,p)=>a[p]|a[p+1]<<8;
  const get32=(a,p)=>(a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0;
  const set16=(a,p,v)=>{a[p]=v&255;a[p+1]=(v>>>8)&255};
  const set32=(a,p,v)=>{set16(a,p,v);set16(a,p+2,v>>>16)};
  const concat=parts=>{const size=parts.reduce((s,b)=>s+b.length,0),out=new Uint8Array(size);let pos=0;for(const b of parts){out.set(b,pos);pos+=b.length}return out};
  const crcTable=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[i]=c>>>0}
  const crc32=a=>{let c=0xffffffff;for(const b of a)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0};
  async function unzipRaw(buffer,method){
    if(method===0)return buffer;
    if(method!==8)throw new Error('Неподдерживаемое сжатие XLSX');
    const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(get32(bytes,i)===0x06054b50 && i+22+get16(bytes,i+20)===bytes.length){eocd=i;break}
  }
  if(eocd<0)throw new Error('Не найден ZIP-каталог XLSX');
  const num=get16(bytes,eocd+10),centralStart=get32(bytes,eocd+16);
  if(get16(bytes,eocd+8)!==num||num===65535||centralStart===0xffffffff)throw new Error('Слишком большой XLSX ZIP');
  let pointer=centralStart,offset=0,modified=0;
  const locals=[],central=[],enc=new TextEncoder(),dec=new TextDecoder();
  for(let index=0;index<num;index++){
    if(get32(bytes,pointer)!==0x02014b50)throw new Error('Повреждён каталог XLSX');
    const len=46+get16(bytes,pointer+28)+get16(bytes,pointer+30)+get16(bytes,pointer+32);
    const oldC=bytes.slice(pointer,pointer+len),name=dec.decode(oldC.subarray(46,46+get16(oldC,28)));
    const compressedSize=get32(oldC,20),method=get16(oldC,10),off=get32(oldC,42);
    if(get32(bytes,off)!==0x04034b50)throw new Error('Повреждена запись XLSX');
    const localNameLen=get16(bytes,off+26),localExtraLen=get16(bytes,off+28);
    const payloadStart=off+30+localNameLen+localExtraLen;
    if(payloadStart+compressedSize>bytes.length)throw new Error('Повреждено содержимое XLSX');
    let payload=bytes.slice(payloadStart,payloadStart+compressedSize);
    let effectiveMethod=method,crc=get32(oldC,16),compressed=compressedSize,uncompressed=get32(oldC,24);
    if(/^xl\/drawings\/drawing\d+\.xml$/.test(name)){
      const xml=dec.decode(await unzipRaw(payload,method));
      const re=/<xdr:oneCellAnchor editAs="oneCell">/g;
      const count=(xml.match(re)||[]).length;
      if(count){
        // The oneCellAnchor's xdr:ext explicitly supplies the photo width/height.
        // Remove ExcelJS's invalid editAs attribute, keeping all picture media.
        const fixed=xml.replace(/<xdr:oneCellAnchor editAs="oneCell">([\s\S]*?)<\/xdr:oneCellAnchor>/g,(block,inside)=>
          '<xdr:oneCellAnchor>'+
          inside.replace(/<a:xfrm><a:off x="0" y="0"\/><a:ext cx="0" cy="0"\/><\/a:xfrm>/g,'')
                .replace(/<a:picLocks noChangeAspect="1"\/>/g,'')+
          '</xdr:oneCellAnchor>');
        const plain=enc.encode(fixed);
        payload=plain;compressed=plain.length;uncompressed=plain.length;effectiveMethod=0;crc=crc32(plain);modified+=count;
      }
    }
    const local=bytes.slice(off,off+30+localNameLen+localExtraLen);
    set16(local,6,get16(oldC,8)&~8);set16(local,8,effectiveMethod);
    set32(local,14,crc);set32(local,18,compressed);set32(local,22,uncompressed);
    locals.push(local,payload);
    set16(oldC,8,get16(oldC,8)&~8);set16(oldC,10,effectiveMethod);
    set32(oldC,16,crc);set32(oldC,20,compressed);set32(oldC,24,uncompressed);set32(oldC,42,offset);
    central.push(oldC);
    offset+=local.length+payload.length;
    pointer+=len;
  }
  if(modified!==expectedPictures)throw new Error('Неверное число фото-якорей в Excel: '+modified+' из '+expectedPictures);
  const centralStartNew=offset,centralSizeNew=central.reduce((s,x)=>s+x.length,0);
  const footer=bytes.slice(eocd);
  set32(footer,12,centralSizeNew);set32(footer,16,centralStartNew);
  return concat([...locals,...central,footer]).buffer;
}

function excelPhotoMimeFromBytes(bytes){
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';
  if(bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10)return 'png';
  return null;
}
async function excelPhotoBlobToAsset(blob,id){
  if(!(blob instanceof Blob)||!blob.size)throw new Error('Пустые данные изображения');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const ext=excelPhotoMimeFromBytes(bytes);
  const sourceUrl=URL.createObjectURL(blob);
  const img=new Image();
  try{
    img.src=sourceUrl;
    if(typeof img.decode==='function')await img.decode();
    else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Изображение не декодируется'))});
    if(!img.naturalWidth||!img.naturalHeight)throw new Error('Некорректные размеры фото');
    let dataUrl;
    let extension=ext;
    if(ext){
      dataUrl=await blobToDataUrl(new Blob([bytes],{type:'image/'+ext}));
    }else{
      // Rare legacy WebP/GIF/BMP photos must be converted: Excel supports JPEG/PNG.
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Canvas недоступен');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      dataUrl=canvas.toDataURL('image/png');extension='png';
    }
    if(!dataUrl.startsWith('data:image/')||!dataUrl.includes(';base64,'))throw new Error('Не удалось закодировать фотографию');
    return {base64:dataUrl.split(',')[1],extension,width:img.naturalWidth,height:img.naturalHeight};
  }catch(e){
    throw new Error('Фото шага '+id+': '+e.message);
  }finally{
    URL.revokeObjectURL(sourceUrl);
  }
}
// Before writing XLSX resolve every indicated photo, keeping the current
// annotated/rendered preview and using IndexedDB only when needed.
async function ensureStepImagesForExport(steps,documentId){
  if(!Array.isArray(steps))throw new TypeError('Неверный снимок шагов для экспорта');
  let expected=0;
  const missing=[];
  for(let index=0;index<steps.length;index++){
    const step=steps[index];
    delete step._excelPhoto;
    if(!step.hasPhoto&&!step.imageData&&!step.imageBuffer)continue;
    expected++;
    try{
      // A2: the photo repository resolves data from the captured step/document.
      // Only this private export snapshot receives transient _excelPhoto.
      const blob=await readSopStepPhotoBlobForExport(step,documentId);
      step._excelPhoto=await excelPhotoBlobToAsset(blob,index+1);
    }catch(e){
      console.warn('SOP photo XLSX preparation failed',step.id,e);
      missing.push((index+1)+' ('+e.message+')');
    }
  }
  if(missing.length){
    throw new Error('Excel не создан: отсутствуют/повреждены фото шагов '+missing.join(', ')+'. Восстановите фотографии или загрузите их повторно.');
  }
  return expected;
}
async function generateExcel(){
  if(!state.steps.length){toast('Добавьте хотя бы один шаг','error');return;}
  // Sync the user's form values once, then capture an isolated snapshot.
  htmlFieldToState();
  const btn=$('generateBtn'),status=$('generateStatus');
  btn.disabled=true;status.classList.remove('hidden');status.textContent='Проверка библиотеки ExcelJS...';
  try{
    const exportData=createSopExportSnapshot(state);
    status.textContent='Проверка фотографий для Excel...';
    const expectedStepPhotos=await ensureStepImagesForExport(exportData.steps,exportData.documentManager?.currentId);
    await ensureExcelJS();
    status.textContent='Генерация Excel-файла...';
    const wb=new ExcelJS.Workbook();
    wb.subject='SOP XLSX PHOTO FIT STAGE32.2';
    const ws=wb.addWorksheet('СОП',{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    const m=exportData.meta;
    const respList=exportData.responsibles.filter(x=>x&&x.trim()).join('\n');
    const ag=exportData.agreedList.filter(a=>(a.post&&a.post.trim())||(a.name&&a.name.trim()));
    ws.columns=[{width:1.75},{width:5.5},{width:19.1},{width:18.5},{width:8.9},{width:17.6},{width:4.9},{width:13.1},{width:9},{width:13.9},{width:23.1},{width:9.1},{width:1.6}];
    const B={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
    const GRAY={type:'pattern',pattern:'solid',fgColor:{argb:'FFECEAE5'}};
    const DISC_GRAY={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9D9D9'}};
    const NOTE_GRAY={type:'pattern',pattern:'solid',fgColor:{argb:'FFA6A6A6'}};
    const RED='FFC00000',BRAND_RED='FFE30613',DISC_RED='FFFF0000',GRAYTXT='FF85878C';
    const C={horizontal:'center',vertical:'middle',wrapText:true};
    const L={horizontal:'left',vertical:'middle',wrapText:true};
    const T={horizontal:'left',vertical:'top',wrapText:true};
    const TJ={horizontal:'justify',vertical:'top',wrapText:true};
    const lbl={size:8,color:{argb:GRAYTXT}};
    const val={bold:true,size:14};
    function M(r1,c1,r2,c2,v,opt={}){
      const cell=ws.getCell(r1,c1);cell.value=v;
      if(opt.fill)cell.fill=opt.fill;
      if(opt.font)cell.font=opt.font;
      cell.alignment=opt.alignment||L;
      if(r1!==r2||c1!==c2)ws.mergeCells(r1,c1,r2,c2);
      for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++){
        const cc=ws.getCell(r,c);cc.border=B;if(opt.fill)cc.fill=opt.fill;
      }
    }
    ws.getRow(1).height=9;
    ws.getRow(2).height=32;
    try{
      const logoId=wb.addImage({base64:makeLogo().split(',')[1],extension:'png'});
      ws.addImage(logoId,sopExcelImageRange(ws,{col:1.05,row:1.08},110,22));
    }catch(e){console.warn('logo',e)}

    // === ОРИГИНАЛЬНАЯ ШАПКА СОП: сохраняем геометрию исходного шаблона ===
    M(2,2,2,3,'',{});
    M(2,4,2,6,m.branch,{font:{size:11},alignment:C});
    M(2,7,2,9,'СОП №:',{font:{size:10,color:{argb:GRAYTXT}},alignment:C});
    M(2,10,2,10,'Дата:',{font:{size:10,color:{argb:GRAYTXT}},alignment:C});
    M(2,11,2,12,'УТВЕРЖДАЮ:',{font:{bold:true,size:11,color:{argb:GRAYTXT}},alignment:{horizontal:'right',vertical:'middle',wrapText:true}});
    M(3,2,3,3,'Подразделение:',{font:lbl});
    M(3,4,3,6,'СТАНДАРТНАЯ ОПЕРАЦИОННАЯ  -  ТЕХНОЛОГИЧЕСКАЯ КАРТА',{fill:GRAY,font:{size:11,color:{argb:GRAYTXT}},alignment:C});
    M(3,7,3,9,m.sopNumber,{font:{bold:true,size:11},alignment:C});
    const dcell=ws.getCell(3,10);
    if(m.date){const p=m.date.split('-').map(Number);dcell.value=new Date(Date.UTC(p[0],p[1]-1,p[2]));dcell.numFmt='dd.mm.yyyy';}
    else dcell.value='';
    dcell.border=B;dcell.alignment=C;
    M(3,11,3,12,m.approverPost,{font:{size:11,color:{argb:GRAYTXT}},alignment:T});
    M(4,2,4,3,m.department,{font:val});
    M(4,4,10,6,m.operation,{font:{bold:true,size:22,color:{argb:BRAND_RED}},alignment:C});
    M(4,7,4,8,'Время СОП:',{font:{size:9,color:{argb:GRAYTXT}},alignment:C});
    M(4,9,5,10,'Ответственная рабочая группа:',{font:{size:10,color:{argb:GRAYTXT}},alignment:T});
    M(4,11,4,12,'____________ '+(m.approverName||''),{font:{size:10},alignment:T});
    M(5,2,5,3,'Рабочее место:',{font:lbl});
    M(5,7,6,8,exportData.totalTimeSeconds/86400,{font:{bold:true,size:18},alignment:C});
    ws.getCell(5,7).numFmt='mm:ss';
    M(5,11,5,12,'СОГЛАСОВАНО:',{font:{bold:true,size:11,color:{argb:GRAYTXT}},alignment:{horizontal:'right',vertical:'middle',wrapText:true}});
    M(6,2,6,3,m.workplace,{font:val});
    M(6,9,10,10,respList,{font:{size:9},alignment:T});
    M(6,11,6,12,ag[0]?.post||'',{font:{size:9},alignment:T});
    M(7,2,7,3,'Исполнитель:',{font:lbl});
    M(7,7,10,8,'QR',{font:{size:10,color:{argb:GRAYTXT}},alignment:C});
    M(7,11,7,12,ag[0]?.name?('____________ '+ag[0].name):'',{font:{size:9},alignment:T});
    M(8,2,10,3,m.executor,{font:val});
    M(8,11,8,12,ag[1]?.post||'',{font:{size:9},alignment:T});
    M(9,11,9,12,ag[1]?.name?('____________ '+ag[1].name):'',{font:{size:9},alignment:T});
    M(10,11,10,12,ag[2]?.post||'',{font:{size:9},alignment:T});
    M(11,2,12,10,DISCLAIMER,{fill:DISC_GRAY,font:{size:8,color:{argb:DISC_RED}},alignment:TJ});
    M(11,11,11,12,ag[2]?.name?('____________ '+ag[2].name):'',{font:{size:9},alignment:T});
    M(12,11,12,12,'',{});
    ws.getRow(11).height=26;ws.getRow(12).height=18;

    M(13,2,13,5,'Требования к безопасности:',{fill:GRAY,font:{bold:true,size:10}});
    M(13,6,13,10,'Инструмент, оснастка, приспособления:',{fill:GRAY,font:{bold:true,size:10}});
    M(13,11,13,12,'Материал:',{fill:GRAY,font:{bold:true,size:10}});
    const hasIcons=exportData.safetyIconIds.length>0;
    M(14,2,14,5,(hasIcons?'\n':'')+m.safety,{font:{size:9},alignment:T});
    M(14,6,14,10,m.tools,{font:{size:10},alignment:C});
    M(14,11,14,12,m.material,{font:{size:10},alignment:C});
    ws.getRow(14).height=clamp((textLines(m.safety,40)+(hasIcons?1:0))*13+34,hasIcons?58:40,130);
    if(hasIcons){
      status.textContent='Загрузка пиктограмм ISO 7010...';
      try{
        const strip=await buildIconStripPng(exportData.safetyIconIds,24);
        if(strip){
          const icId=wb.addImage({base64:strip.dataUrl.split(',')[1],extension:'png'});
          ws.addImage(icId,sopExcelImageRange(ws,{col:1.15,row:13.08},strip.width,strip.height));
          if(strip.loaded<strip.total)toast(`Загрузилось ${strip.loaded} из ${strip.total} пиктограмм ISO 7010`,'info');
        } else toast('Не удалось загрузить пиктограммы ISO 7010 — файл создан без них','info');
      }catch(e){console.warn('icons',e);toast('Не удалось загрузить пиктограммы ISO 7010','info')}
      status.textContent='Генерация Excel-файла...';
    }
    ws.getRow(14).height=clamp((textLines(m.safety,40)+(hasIcons?1:0))*13+34,hasIcons?58:40,130);
    for(let rr=2;rr<=10;rr++)if(!ws.getRow(rr).height)ws.getRow(rr).height=18;
    ws.getRow(2).height=32;
    ws.getRow(3).height=clamp(Math.max(textLines('СТАНДАРТНАЯ ОПЕРАЦИОННАЯ - ТЕХНОЛОГИЧЕСКАЯ КАРТА',34),textLines(m.approverPost,20),textLines(m.sopNumber,16))*13+10,26,70);
    ws.getRow(4).height=22;

    let embeddedStepPhotos=0;
    let r=15;
    const vSpans=[[3,5],[6,9],[10,12]], aSpans=[[3,4,5],[6,8,9],[10,11,12]], timeCellRefs=[];
    for(let i=0;i<exportData.steps.length;i+=3){
      const g=exportData.steps.slice(i,i+3);
      M(r,2,r,2,'Визуализация',{fill:GRAY,font:{size:8,color:{argb:GRAYTXT}},alignment:{textRotation:90,horizontal:'center',vertical:'middle'}});
      let hasImg=false;
      ws.getRow(r).height=g.some(st=>st?._excelPhoto)?120:30;
      for(let k=0;k<3;k++){
        const [c1,c2]=vSpans[k],s=g[k];
        M(r,c1,r,c2,'',{alignment:C});
        if(s?._excelPhoto){
          hasImg=true;
          const frame=sopExcelPhotoVisibleExtent(ws,c1,c2,r);
          const background=await sopExcelPhotoBackground(s._excelPhoto,frame.ext);
          const backgroundId=wb.addImage(background);
          ws.addImage(backgroundId,frame);
          const foregroundId=wb.addImage({base64:s._excelPhoto.base64,extension:s._excelPhoto.extension});
          ws.addImage(foregroundId,sopExcelPhotoForeground(ws,s._excelPhoto,frame));
          embeddedStepPhotos++;
        }
      }
      ws.getRow(r).height=hasImg?120:30;
      r++;

      M(r,2,r,2,'Действие',{fill:GRAY,font:{size:8,color:{argb:RED}},alignment:{textRotation:90,horizontal:'center',vertical:'middle'}});
      let actLines=1;
      for(let k=0;k<3;k++){
        const [a1,a2,tc]=aSpans[k],s=g[k];
        if(s){
          M(r,a1,r,a2,(i+k+1)+'. '+s.action,{font:{bold:true,size:14,color:{argb:RED}},alignment:T});
          const t=ws.getCell(r,tc);t.value=(s.durationSeconds||0)/86400;t.numFmt='mm:ss';t.font={bold:true,size:14,color:{argb:RED}};t.fill=GRAY;t.alignment=C;t.border=B;
          timeCellRefs.push(t.address);
          actLines=Math.max(actLines,textLines((i+k+1)+'. '+s.action,22));
        }else{
          M(r,a1,r,a2,'',{});const t=ws.getCell(r,tc);t.border=B;t.fill=GRAY;
        }
      }
      ws.getRow(r).height=clamp(actLines*17+10,32,90);r++;

      M(r,2,r,2,'Ключевой момент',{fill:GRAY,font:{size:8},alignment:{textRotation:90,horizontal:'center',vertical:'middle'}});
      let kmLines=1;
      for(let k=0;k<3;k++){
        const [c1,c2]=vSpans[k],s=g[k];
        const km=s?s.keyMoments.filter(x=>x&&x.trim()).map((x,xi)=>(xi+1)+'. '+x).join('\n'):'';
        M(r,c1,r,c2,km||'',{font:{size:10},alignment:TJ});
        kmLines=Math.max(kmLines,textLines(km,30));
      }
      ws.getRow(r).height=clamp(kmLines*13+8,34,220);r++;

      M(r,2,r,2,'Причина',{fill:GRAY,font:{size:8,color:{argb:GRAYTXT}},alignment:{textRotation:90,horizontal:'center',vertical:'middle'}});
      let rsLines=1;
      for(let k=0;k<3;k++){
        const [c1,c2]=vSpans[k],s=g[k];
        M(r,c1,r,c2,s?(s.reason||''):'',{font:{size:11,color:{argb:GRAYTXT}},alignment:C});
        rsLines=Math.max(rsLines,textLines(s?.reason||'',30));
      }
      ws.getRow(r).height=clamp(rsLines*13+8,26,90);r++;
    }
    if(timeCellRefs.length)ws.getCell(5,7).value={formula:timeCellRefs.join('+')};
    r++;
    M(r,2,r,5,'! Время действия писать в формате: мм:сс',{fill:NOTE_GRAY,font:{bold:true,size:14,color:{argb:'FFFFFFFF'}},alignment:L});
    ws.getRow(r).height=26;

    // === ФРВ: геометрия и подписи как в исходном шаблоне ===
    const fw=wb.addWorksheet('ФРВ',{pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1}});
    fw.columns=[{width:12},{width:38},{width:12},{width:10},{width:8},{width:8},{width:34},{width:12},{width:4},{width:40}];
    function F(r1,c1,r2,c2,v,opt={}){
      const cell=fw.getCell(r1,c1);cell.value=v;
      if(opt.fill)cell.fill=opt.fill;if(opt.font)cell.font=opt.font;cell.alignment=opt.alignment||L;
      if(r1!==r2||c1!==c2)fw.mergeCells(r1,c1,r2,c2);
      for(let rr=r1;rr<=r2;rr++)for(let cc=c1;cc<=c2;cc++){const c=fw.getCell(rr,cc);c.border=B;if(opt.fill)c.fill=opt.fill}
    }
    const fm=exportData.frvMeta,obs=(fm.observers&&fm.observers.trim())?fm.observers:respList;
    F(1,3,1,6,'Раб.Место/операция',{font:{bold:true}});
    F(1,7,1,7,m.operation,{font:{bold:true}});
    F(1,8,1,8,m.date?(()=>{const p=m.date.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])})():'',{});
    if(m.date)fw.getCell(1,8).numFmt='dd.mm.yyyy';
    F(2,1,2,2,'Фотография рабочего времени',{font:{bold:true,size:11,color:{argb:BRAND_RED}}});
    F(2,3,2,3,'Наблюдал:',{font:{bold:true}});F(2,4,4,5,obs,{alignment:T});F(2,8,2,8,'___:___',{});
    F(3,1,4,2,'Требования к безопасности:',{fill:GRAY,font:{bold:true}});F(5,3,5,8,m.safety,{alignment:T});
    F(6,1,6,2,'Инструмент, приспособления ( )',{fill:GRAY,font:{bold:true}});F(6,4,6,6,'Исполнитель',{fill:GRAY,font:{bold:true},alignment:C});F(6,7,6,8,'Материалы ( )',{fill:GRAY,font:{bold:true}});
    F(7,1,7,2,m.tools,{alignment:T});F(7,4,7,6,m.executor,{alignment:T});F(7,7,7,8,m.material,{alignment:T});
    F(9,1,9,2,'Качество:',{fill:GRAY,font:{bold:true}});F(9,4,9,6,'Прочие условия:',{fill:GRAY,font:{bold:true}});F(10,1,10,2,fm.quality,{alignment:T});F(10,4,10,6,fm.other,{alignment:T});
    F(11,10,12,10,'Назначение ФРВ/хронометража:\n'+(fm.purpose||'зафиксировать текущее исполнение операции'),{alignment:T});
    ['Время, ч:м:с','Действие, ключ.момент','Длит-ть, сек','ВДЦ, сек','М2','М1','Комментарий','Перемещения, метр'].forEach((hd,i)=>{const c=fw.getCell(12,i+1);c.value=hd;c.border=B;c.fill=GRAY;c.font={bold:true,size:9,color:{argb:BRAND_RED}};c.alignment=C});
    const notes=['Серая заливка в таблице - авторассчёт. не трогать!','1. Шапку таблицы заполнить сразу и далее - по мере наблюдения.','2. Заполнить наблюдаемые действия и их ключевые моменты','3. В комментарии записать обнаруженные нестыковки и предложения по исключению или модернизации действия','4. В Столбцах ВДЦ, М2и М1 - оставить только 1 соответствующее значение','5. Зафиксировать текущую длительность операции'];
    const {rows,cum,sumV,sumM2,sumM1,sumMove}=computeFrv(exportData.steps);
    let fr=13,cumSec=0;const firstRow=fr;
    rows.forEach((rw,idx)=>{
      const aCell=fw.getCell(fr,1);aCell.value=cumSec/86400;aCell.numFmt='h:mm:ss';
      fw.getCell(fr,2).value=rw.action;
      const cCell=fw.getCell(fr,3);cCell.value=rw.durSec/86400;cCell.numFmt='h:mm:ss';
      fw.getCell(fr,4).value=rw.vdcSec;
      fw.getCell(fr,5).value=rw.m2;fw.getCell(fr,6).value=rw.m1;fw.getCell(fr,7).value=rw.comment;fw.getCell(fr,8).value=rw.mv||'';
      for(let c=1;c<=8;c++){fw.getCell(fr,c).border=B;fw.getCell(fr,c).alignment=(c===2||c===7)?T:C;fw.getCell(fr,c).font={size:9};}
      if(notes[idx])fw.getCell(fr,10).value=notes[idx];
      cumSec+=rw.durSec;fr++;
    });
    const lastAct=fr-1;
    const aEnd=fw.getCell(fr,1);aEnd.value=cumSec/86400;aEnd.numFmt='h:mm:ss';
    const cTotal=fw.getCell(fr,3);cTotal.value={formula:`A${fr}-A${firstRow}`};cTotal.numFmt='h:mm:ss';
    fw.getCell(fr,4).value=0;fw.getCell(fr,5).value=0;fw.getCell(fr,6).value=0;
    for(let c=1;c<=6;c++){fw.getCell(fr,c).border=B;fw.getCell(fr,c).alignment=C}
    fr++;
    fw.getCell(fr,1).value=1/86400;fw.getCell(fr,1).numFmt='h:mm:ss';fw.getCell(fr,2).value='новый цикл';for(let c=1;c<=2;c++)fw.getCell(fr,c).border=B;fr++;
    const cSum=fw.getCell(fr,3);cSum.value={formula:`SUM(C${firstRow}:C${lastAct})`};cSum.numFmt='h:mm:ss';
    fw.getCell(fr,4).value={formula:`SUM(D${firstRow}:D${lastAct})`};fw.getCell(fr,5).value={formula:`SUM(E${firstRow}:E${lastAct})`};fw.getCell(fr,6).value={formula:`SUM(F${firstRow}:F${lastAct})`};
    for(let c=3;c<=6;c++){fw.getCell(fr,c).border=B;fw.getCell(fr,c).alignment=C;fw.getCell(fr,c).font={bold:true};}
    fr+=2;fw.getCell(fr,3).value='текущее';fw.getCell(fr,4).value='целевое';fw.getCell(fr,5).value='Эффект';for(let c=3;c<=5;c++){fw.getCell(fr,c).font={bold:true};fw.getCell(fr,c).alignment=C}
    fr++;
    const tOp=parseFloat(fm.tOp),tV=parseFloat(fm.tVdc),tM2=parseFloat(fm.tM2),tM1=parseFloat(fm.tM1),tMove=parseFloat(fm.tMove);
    const indRows=[['Вр.операции, мин',cum,tOp],['ВДЦ- Время Добавления Ценности, мин',sumV,tV],['М2- Необх.Действия, не создающие ценности (muda2)',sumM2,tM2],['М1- Лишние действия, не создающие ценности (muda1)',sumM1,tM1],['Длина перемещений, м.',sumMove,tMove],['Площадь, м2','',parseFloat(fm.tArea)],['Вход.запасы (от-до), шт.','',NaN],['Исход.(готовые) запасы (от-до), шт.','',NaN]];
    indRows.forEach(rw=>{
      fw.getCell(fr,2).value=rw[0];
      if(rw[1]!=='')fw.getCell(fr,3).value=rw[1];
      if(rw[2]!==''&&!isNaN(rw[2])){fw.getCell(fr,4).value=rw[2];if(rw[1]!==''&&!isNaN(rw[1])){fw.getCell(fr,5).value={formula:`C${fr}-D${fr}`};fw.getCell(fr,6).value={formula:`(D${fr}-C${fr})/C${fr}`};fw.getCell(fr,6).numFmt='0%'}}else fw.getCell(fr,5).value='- 0';
      for(let c=2;c<=6;c++){fw.getCell(fr,c).border=B;fw.getCell(fr,c).alignment=C;fw.getCell(fr,c).font={size:9}}fr++;
    });
    fr++;F(fr,2,fr,9,'М2- Напр.: сопутствующая работа - выдача и получение задания, оформление документации, подготовка инструмента, технолог.маркировка, замеры, контроль качества',{font:{size:8}});

    // === Чек-лист: сохраняем исходную структуру ===
    const ws2=wb.addWorksheet('Чек-лист оценки СОП');
    ws2.columns=[{width:6},{width:55},{width:8},{width:6},{width:8},{width:45}];
    function M2(r1,c1,r2,c2,v,opt={}){const cell=ws2.getCell(r1,c1);cell.value=v;if(opt.fill)cell.fill=opt.fill;if(opt.font)cell.font=opt.font;cell.alignment=opt.alignment||L;if(r1!==r2||c1!==c2)ws2.mergeCells(r1,c1,r2,c2);for(let rr=r1;rr<=r2;rr++)for(let cc=c1;cc<=c2;cc++){const x=ws2.getCell(rr,cc);x.border=B;if(opt.fill)x.fill=opt.fill}}
    let r2=1;
    M2(r2,1,r2,6,'В чем ценность этого СОПа?',{fill:GRAY,font:{bold:true,size:12},alignment:L});r2++;
    M2(r2,1,r2,6,'Чек-лист оценки СОП (стандартной операционной процедуры)',{fill:GRAY,font:{bold:true,size:12},alignment:C});r2+=2;
    ['№ п/п','Проверяемые требования','Оценка','Вес','Балл','Комментарий'].forEach((hd,i)=>{const c=ws2.getCell(r2,i+1);c.value=hd;c.border=B;c.fill=GRAY;c.font={bold:true,size:10};c.alignment=C});r2++;
    exportData.checklist.forEach(item=>{ws2.getCell(r2,1).value=item.id;ws2.getCell(r2,2).value=item.req;ws2.getCell(r2,3).value=item.score;ws2.getCell(r2,4).value=item.weight;ws2.getCell(r2,5).value=+(item.score*item.weight).toFixed(2);ws2.getCell(r2,6).value=item.comment;const lines=Math.max(textLines(item.req,55),textLines(item.comment,45));for(let c=1;c<=6;c++){const cell=ws2.getCell(r2,c);cell.border=B;cell.alignment=(c===2||c===6)?L:C;cell.font={size:10}}ws2.getRow(r2).height=clamp(lines*14+6,20,80);r2++});
    M2(r2,1,r2,2,'ИТОГО',{fill:GRAY,font:{bold:true},alignment:{horizontal:'right',vertical:'middle'}});
    const tScore=exportData.checklist.reduce((s,i)=>s+i.score*i.weight,0),tWeight=exportData.checklist.reduce((s,i)=>s+i.weight,0);
    ws2.getCell(r2,3).value=+(tScore/tWeight).toFixed(2);ws2.getCell(r2,3).font={bold:true,size:11};ws2.getCell(r2,3).border=B;ws2.getCell(r2,3).alignment=C;r2++;
    M2(r2,2,r2,6,'*Оценка: замечаний нет - ставится "1", незначительные замечания "0,7"; сделана начальная работа - "0,3"; требование не выполнено - "0"',{font:{size:9,italic:true,color:{argb:'FF64748B'}}});r2+=2;
    M2(r2,2,r2,2,'ОТЧЁТ ПОДГОТОВИЛ:',{font:{bold:true,size:10}});M2(r2,3,r2,3,'ДАТА',{font:{bold:true,size:10},alignment:C});r2++;
    M2(r2,2,r2,2,'С РЕЗУЛЬТАТАМИ ОЗНАКОМЛЕН:',{font:{bold:true,size:10}});

    if(embeddedStepPhotos!==expectedStepPhotos){
      throw new Error('Количество фотографий в Excel не совпадает с числом фото шагов: '+embeddedStepPhotos+' из '+expectedStepPhotos);
    }
    if(ws.getImages().length<embeddedStepPhotos*2)throw new Error('ExcelJS потеряла изображения визуализации до сохранения');
    status.textContent='Финализация файла...';
    const rawBuffer=await wb.xlsx.writeBuffer();
    const buffer=embeddedStepPhotos?await sopXlsxFixPictureAnchors(rawBuffer,embeddedStepPhotos*2):rawBuffer;
    const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    try{const dm=exportData.documentManager||{};const ok=await docWriteNetworkFile(docSafeFileBase(dm)+'.xlsx',buffer,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');if(ok)status.textContent='Файл сформирован и сохранён в выбранную папку.'}catch(ne){console.warn('Сохранение XLSX на сетевой диск',ne)}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download=`СОП_${m.sopNumber||'бн'}_${(m.operation||'без_названия').replace(/[^a-zA-Zа-яА-Я0-9]/g,'_')}_ФОТО_STAGE32_2.xlsx`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.innerHTML='<span class="text-green-600 font-medium">✓ Фото без искажений — Stage 32.2 (3 листа: СОП, ФРВ, Чек-лист; фотографий: '+embeddedStepPhotos+')</span>';
    toast('СОП успешно создан!');
    // XLSX download is not a commit or publish: preserve the working draft.
    saveDraft();
  }catch(e){
    console.error(e);status.innerHTML=`<span class="text-red-600">✕ Ошибка: ${escapeHtml(e.message)}</span>`;toast('Ошибка генерации: '+e.message,'error');
  }finally{btn.disabled=false}
}

