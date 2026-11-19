function docGetFolderHandle(){try{return await docMetaGet('networkFolderHandle')}catch(e){return null}}
async function docHasFolderAccess(){const h=await docGetFolderHandle();if(!h)return false;try{const p=await h.queryPermission?.({mode:'readwrite'});return p==='granted'}catch(e){return false}}
async function docChooseFolder(){if(!window.showDirectoryPicker)return toast('Прямой выбор папки недоступен в этом режиме браузера. Откройте конструктор через HTTPS/локальный сервер Chrome или Edge.','error');try{const h=await window.showDirectoryPicker({id:'sop-network-folder',mode:'readwrite'});await docMetaPut('networkFolderHandle',h);await docMetaPut('networkFolderName',h.name);await docMetaPut('networkLastFolderChangeAt',Date.now());renderDocumentFolderStatus();renderNetworkSyncInfo();toast(`Папка хранения выбрана: ${h.name}`,'success')}catch(e){if(e.name!=='AbortError')toast('Не удалось выбрать папку: '+e.message,'error')}}
async function docEnsureFolderPermission(){const h=await docGetFolderHandle();if(!h)return null;try{let p=await h.queryPermission?.({mode:'readwrite'});if(p!=='granted'&&h.requestPermission)p=await h.requestPermission({mode:'readwrite'});return p==='granted'?h:null}catch(e){return null}}
async function docWriteNetworkFile(filename,data,mime){const h=await docEnsureFolderPermission();if(!h)return false;const fh=await h.getFileHandle(filename,{create:true});const w=await fh.createWritable();await w.write(data);await w.close();return true}
async function docRemoveNetworkFile(filename){try{const h=await docEnsureFolderPermission();if(!h)return false;await h.removeEntry(filename);return true}catch(e){return false}}
function docSafeFileBase(dm){const n=docFormatNumber(dm);return (n==='Черновик'?`Черновик_${dm.currentId||'new'}`:n).replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()}
async function docSha256(text){try{const data=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){return null}}
async function docEnsureSubdir(name){const h=await docEnsureFolderPermission();if(!h)return null;try{return await h.getDirectoryHandle(name,{create:true})}catch(e){return null}}
async function docBackupNetworkFile(filename,reason='overwrite'){
 try{const h=await docEnsureFolderPermission();if(!h)return false;const src=await h.getFileHandle(filename);const file=await src.getFile();const dir=await h.getDirectoryHandle('.sop-backups',{create:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const safe=filename.replace(/[^\wА-Яа-я0-9.-]+/g,'_');const out=await dir.getFileHandle(`${stamp}__${safe}`,{create:true});const w=await out.createWritable();await w.write(await file.arrayBuffer());await w.close();return true}catch(e){return false}}
async function docAppendJournal(event){
 try{const h=await docEnsureFolderPermission();if(!h)return false;let rows=[];try{const fh=await h.getFileHandle('.sop-sync-log.json');rows=JSON.parse(await (await fh.getFile()).text())||[]}catch(e){};rows.push({...event,documentId:event.documentId||state?.documentManager?.currentId||null,at:Date.now()});if(rows.length>500)rows=rows.slice(-500);const fh=await h.getFileHandle('.sop-sync-log.json',{create:true});const w=await fh.createWritable();await w.write(JSON.stringify(rows,null,2));await w.close();return true}catch(e){console.warn('Журнал библиотеки',e);return false}}
async function docCheckUniquePublished(doc){
 const docs=await docDbGetAll();
 const same=docs.find(d=>d.status==='Опубликован'&&Number(d.seqNo)===Number(doc.seqNo)&&String(d.deptCode)===String(doc.deptCode)&&Number(d.year)===Number(doc.year)&&Number(d.version)===Number(doc.version)&&String(d.id)!==String(doc.id));
 if(same)return {ok:false,source:'local',doc:same};
 try{const remote=await docCollectNetworkDocuments();const rs=remote.find(d=>d.status==='Опубликован'&&Number(d.seqNo)===Number(doc.seqNo)&&String(d.deptCode)===String(doc.deptCode)&&Number(d.year)===Number(doc.year)&&Number(d.version)===Number(doc.version)&&String(d.id)!==String(doc.id));if(rs)return {ok:false,source:'network',doc:rs}}catch(e){}
 return {ok:true};
}
async function docListBackups(){
 const dir=await docEnsureSubdir('.sop-backups'); if(!dir)return [];
 const out=[]; for await(const [name,entry] of dir.entries()){if(entry.kind==='file'&&name.endsWith('.json')){const f=await entry.getFile();out.push({name,size:f.size,modified:f.lastModified})}}
 return out.sort((a,b)=>b.modified-a.modified).slice(0,100);
}
async function docRestoreBackup(backupName){
 if(!confirm('Восстановить выбранную резервную копию? Текущий JSON будет предварительно сохранён в новую резервную копию.'))return;
 try{const h=await docEnsureFolderPermission();if(!h)throw new Error('Нет доступа к папке');const dir=await h.getDirectoryHandle('.sop-backups');const src=await dir.getFileHandle(backupName);const file=await src.getFile();const sep=backupName.indexOf('__');if(sep<0)throw new Error('Неизвестный формат резервной копии');const targetName=backupName.slice(sep+2);await docBackupNetworkFile(targetName,'restore-before');const data=await file.arrayBuffer();const target=await h.getFileHandle(targetName,{create:true});const w=await target.createWritable();await w.write(data);await w.close();await docAppendJournal({action:'restore_backup',file:targetName,backup:backupName});await docSyncFolder({manual:false});await renderBackupList();toast('Резервная копия восстановлена и библиотека синхронизирована','success');}catch(e){toast('Восстановление не выполнено: '+e.message,'error')}
}
async function docReadJournal(){
 try{const h=await docEnsureFolderPermission();if(!h)return [];const fh=await h.getFileHandle('.sop-sync-log.json');const rows=JSON.parse(await (await fh.getFile()).text());return Array.isArray(rows)?rows:[]}catch(e){return []}
}
