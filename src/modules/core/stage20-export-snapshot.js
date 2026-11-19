// A2. Source-owned, non-destructive SOP snapshot for Excel output.
// Input is the current editor data; output is a private export-only copy.
// Never allocate step IDs, write to global state, or touch IndexedDB here.
function normalizeExcelStepKeepingPhoto(source){
  const src=source||{};
  const base={id:0,action:'',keyMoments:[''],reason:'',durationSeconds:0,
    successCriteria:'',decisionPoints:[],commonPitfalls:[],visualMarkers:[],
    photoHint:'',imageData:null,imageBuffer:null,imageExt:null,hasPhoto:false,
    photoEdited:false,photoAnnotations:[],
    frv:{vdc:false,m2:'',m1:'',move:'',comment:''}};
  const step={...base,...src};
  step.id=Number(step.id)||0;
  step.action=String(step.action||'');
  step.keyMoments=Array.isArray(step.keyMoments)&&step.keyMoments.length
    ?step.keyMoments.map(String).slice(0,3):[''];
  step.reason=String(step.reason||'');
  step.durationSeconds=Number.isFinite(Number(step.durationSeconds))
    ?Math.max(0,Math.round(Number(step.durationSeconds))):parseDuration(step.time||0);
  step.successCriteria=String(step.successCriteria||step.success_criteria||'');
  step.decisionPoints=Array.isArray(step.decisionPoints)?step.decisionPoints.map(String).filter(Boolean):[];
  step.commonPitfalls=Array.isArray(step.commonPitfalls)?step.commonPitfalls.map(String).filter(Boolean):[];
  step.visualMarkers=Array.isArray(step.visualMarkers)?step.visualMarkers.map(String).filter(Boolean):[];
  step.photoHint=String(step.photoHint||step.visualMarkers.join('. ')||'');
  // The original Stage16 bug dropped these fields during export normalization.
  step.imageData=typeof src.imageData==='string'?src.imageData:null;
  step.imageBuffer=src.imageBuffer||null;
  step.imageExt=src.imageExt||step.imageExt||null;
  step.hasPhoto=!!(src.hasPhoto||step.imageData||step.imageBuffer);
  step.photoEdited=!!step.photoEdited;
  step.photoAnnotations=Array.isArray(step.photoAnnotations)?step.photoAnnotations:[];
  step.frv={...base.frv,...(step.frv||{})};
  if(typeof step.frv.vdc==='string')step.frv.vdc=['1','true','yes','on'].includes(step.frv.vdc.toLowerCase());
  else step.frv.vdc=!!step.frv.vdc;
  return step;
}
function createSopExportSnapshot(source){
  if(!source||!Array.isArray(source.steps))throw new TypeError('Отсутствуют шаги СОП для экспорта');
  // structuredClone preserves Blob, ArrayBuffer and typed image bytes,
  // unlike JSON serialization. Clone before any normalization.
  const data=structuredClone({
    meta:source.meta||{},
    responsibles:source.responsibles||[],
    agreedList:source.agreedList||[],
    safetyIconIds:source.safetyIconIds||[],
    frvMeta:source.frvMeta||{},
    checklist:source.checklist||[],
    documentManager:source.documentManager||{},
    steps:source.steps
  });
  data.steps=data.steps.map(normalizeExcelStepKeepingPhoto);
  data.totalTimeSeconds=data.steps.reduce((sum,s)=>sum+(Number(s.durationSeconds)||0),0);
  return data;
}
