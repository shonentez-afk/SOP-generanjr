// Stage 15: 60 self-contained ISO 7010 vector signs.
// The builder inserts the JSON payload before the main application script.
// No network, IndexedDB icon cache, lazy queue or external image proxy is required.
const ISO_ICON_LOCAL_SVGS=JSON.parse(document.getElementById('sop-local-iso-icons').textContent);
const ISO_ICON_LOCAL_URLS=new Map();
const ISO_ICON_PLACEHOLDER='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Crect width="24" height="24" rx="4" fill="%23f1f5f9"/%3E%3C/svg%3E';
function isoIconFileName(id){return `ISO_7010_${String(id||'').trim().toUpperCase()}.svg`}
function isoIconUrl(id){
  const key=String(id||'').trim().toUpperCase();
  if(ISO_ICON_LOCAL_URLS.has(key))return ISO_ICON_LOCAL_URLS.get(key);
  const svg=ISO_ICON_LOCAL_SVGS[key];
  const url=svg?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg):ISO_ICON_PLACEHOLDER;
  ISO_ICON_LOCAL_URLS.set(key,url);
  return url;
}
function isoIconSources(id){return [isoIconUrl(id)]}
function bindIsoIconFallbacks(root=document){
  root.querySelectorAll?.('img[data-iso-icon]').forEach(img=>{
    img.src=isoIconUrl(img.dataset.isoIcon);
    img.style.opacity='1';
    img.dataset.isoDone='1';
    img.dataset.isoQueued='0';
  });
}
