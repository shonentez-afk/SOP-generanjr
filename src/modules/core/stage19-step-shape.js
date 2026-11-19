// ============================================================
// 11. Draft / persistence
// ============================================================
function normalizeStepShape(src){
  const base=createEmptyStep();
  const s={...base,...(src||{})};
  s.id=Number(s.id)||base.id;
  s.action=String(s.action||'');
  s.keyMoments=Array.isArray(s.keyMoments)&&s.keyMoments.length?s.keyMoments.map(String).slice(0,3):[''];
  s.reason=String(s.reason||'');
  s.durationSeconds=Number.isFinite(Number(s.durationSeconds))?Math.max(0,Math.round(Number(s.durationSeconds))):parseDuration(s.time||0);
  s.successCriteria=String(s.successCriteria||s.success_criteria||'');
  s.decisionPoints=Array.isArray(s.decisionPoints)?s.decisionPoints.map(String).filter(Boolean):[];
  s.commonPitfalls=Array.isArray(s.commonPitfalls)?s.commonPitfalls.map(String).filter(Boolean):[];
  s.visualMarkers=Array.isArray(s.visualMarkers)?s.visualMarkers.map(String).filter(Boolean):[];
  s.photoHint=String(s.photoHint||s.visualMarkers.join('. ')||'');
  s.imageData=null;s.imageBuffer=null;s.imageExt=s.imageExt||null;
  s.hasPhoto=!!(s.hasPhoto||s.imageData);
  s.photoEdited=!!s.photoEdited;
  s.photoAnnotations=Array.isArray(s.photoAnnotations)?s.photoAnnotations:[];
  s.frv={...base.frv,...(s.frv||{})};
  if(typeof s.frv.vdc==='string')s.frv.vdc=['1','true','yes','on'].includes(s.frv.vdc.toLowerCase());
  else s.frv.vdc=!!s.frv.vdc;
  return s;
}
