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
