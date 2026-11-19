// ============================================================
// 3. Icons / logo
// ============================================================
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
function makeLogo(){if(_logo)return _logo;const c=document.createElement('canvas');c.width=360;c.height=64;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,360,64);x.fillStyle='#E30613';x.fillRect(2,4,56,56);x.fillStyle='#fff';x.font='bold 28px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText('TN',30,34);x.fillStyle='#000';x.font='bold 26px Arial';x.textAlign='left';x.fillText('ТЕХНОНИКОЛЬ',70,34);return _logo=c.toDataURL('image/png')}
function renderIconPicker(){const c=$('iconPicker');const groups=['mandatory','warning','prohibition'];c.innerHTML=groups.map(g=>{const meta=ICON_TYPE_META[g],items=ICON_LIB.filter(i=>i.type===g);return `<div class="mb-3"><div class="text-[11px] font-semibold text-slate-500 mb-1.5">${meta.title}</div><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">${items.map(it=>{const on=state.safetyIconIds.includes(it.id);return `<button type="button" data-icon-toggle="${it.id}" title="${escapeHtml(it.label)}" class="flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs text-left ${on?('ring-2 ring-offset-1 ring-blue-500 '+meta.ring):'border-slate-200 bg-white hover:bg-slate-100'}"><img src="${isoIconUrl(it.id)}" data-iso-icon="${it.id}" data-iso-size="64" data-iso-source="0" class="w-6 h-6 flex-shrink-0" loading="lazy" alt="${escapeHtml(it.label)}"><span class="leading-tight">${escapeHtml(it.label)}</span></button>`}).join('')}</div></div>`}).join('');$('iconCountBadge').textContent=state.safetyIconIds.length;bindIsoIconFallbacks(c);c.querySelectorAll('[data-icon-toggle]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.iconToggle;const i=state.safetyIconIds.indexOf(id);if(i>=0)state.safetyIconIds.splice(i,1);else state.safetyIconIds.push(id);stateChanged()}))}

