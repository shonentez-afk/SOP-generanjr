// A2: the photo repository owns all export photo resolution.
// The exporter only receives a Blob, never reads global state or IndexedDB.
async function readSopStepPhotoBlobForExport(step,documentId){
  if(!step||typeof step!=='object')throw new TypeError('Неверный шаг для поиска фото');
  let blob=null;
  if(typeof step.imageData==='string'&&step.imageData.startsWith('data:image/')){
    blob=await dataUrlToBlob(step.imageData);
  }else if(step.imageBuffer){
    blob=new Blob([step.imageBuffer],{type:'image/'+(step.imageExt||'jpeg')});
  }
  if(!blob?.size){
    let record=await idbGetPhoto(step.id);
    if(!record&&documentId){
      record=await idbGetPhoto(photoDocumentRecordKey(documentId,step.id));
    }
    if(!record)record=await tryLegacyPhoto(step.id);
    blob=record?.renderedBlob||record?.blob||null;
  }
  if(!blob?.size)throw new Error('Данные фотографии отсутствуют');
  return blob;
}
