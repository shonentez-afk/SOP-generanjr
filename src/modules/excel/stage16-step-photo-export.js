// Stage 16: retain in-memory photos when normalizing a step for Excel output.
// normalizeStepShape() intentionally drops media when hydrating JSON drafts;
// it must not be applied destructively to a live step immediately before export.
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Не удалось прочитать фото'));r.readAsDataURL(blob)})}
function normalizeExcelStepKeepingPhoto(source){
  const step=normalizeStepShape(source);
  step.imageData=typeof source.imageData==='string'?source.imageData:null;
  step.imageBuffer=source.imageBuffer||null;
  step.imageExt=source.imageExt||step.imageExt||null;
  step.hasPhoto=!!(source.hasPhoto||step.imageData||step.imageBuffer);
  return step;
}
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
    return {base64:dataUrl.split(',')[1],extension};
  }catch(e){
    throw new Error('Фото шага '+id+': '+e.message);
  }finally{
    URL.revokeObjectURL(sourceUrl);
  }
}
// Before writing XLSX resolve every indicated photo, keeping the current
// annotated/rendered preview and using IndexedDB only when needed.
async function ensureStepImagesForExport(){
  let expected=0;
  const missing=[];
  for(let index=0;index<state.steps.length;index++){
    const step=state.steps[index];
    delete step._excelPhoto;
    if(!step.hasPhoto&&!step.imageData&&!step.imageBuffer)continue;
    expected++;
    try{
      let blob=null;
      // Current in-memory edit is authoritative, including unsaved drawn annotations.
      if(step.imageData?.startsWith('data:image/')){
        blob=await dataUrlToBlob(step.imageData);
      }else if(step.imageBuffer){
        blob=new Blob([step.imageBuffer],{type:'image/'+(step.imageExt||'jpeg')});
      }
      if(!blob?.size){
        // Both active-step and saved-document keys are supported.
        let rec=await idbGetPhoto(step.id);
        if(!rec&&state.documentManager?.currentId){
          rec=await idbGetPhoto(photoDocumentRecordKey(state.documentManager.currentId,step.id));
        }
        if(!rec)rec=await tryLegacyPhoto(step.id);
        blob=rec?.renderedBlob||rec?.blob||null;
      }
      if(!blob?.size)throw new Error('Данные фотографии отсутствуют');
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
