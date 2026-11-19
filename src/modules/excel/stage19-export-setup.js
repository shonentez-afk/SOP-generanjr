// ============================================================
// 13. XLSX — export
// ============================================================
async function ensureExcelJS(){if(window.ExcelJS)return;const urls=['https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js','https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'];for(const u of urls){try{await new Promise((res,rej)=>{const s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>{s.remove();rej(new Error('CDN fail'))};document.head.appendChild(s)});if(window.ExcelJS)return}catch(e){}}throw new Error('Не удалось загрузить ExcelJS. Проверьте интернет.')}
function textNum(v){const n=Number(v);return Number.isFinite(n)?n:0}
// Stage 15: rasterize embedded SVG in memory before ExcelJS export.
// No image fetching or remote proxy is ever invoked.
const _pngCache=new Map();
function isoIconRasterUrl(id){return isoIconUrl(id)}
async function svgToPngDataUrl(id,sizePx){
  const px=Math.max(16,Math.min(512,Math.round(Number(sizePx)||96)));
  const key=`${String(id||'').toUpperCase()}@${px}`;
  if(_pngCache.has(key))return _pngCache.get(key);
  if(!ISO_ICON_LOCAL_SVGS[String(id||'').toUpperCase()])return null;
  const img=new Image();
  await new Promise((resolve,reject)=>{
    img.onload=resolve;
    img.onerror=()=>reject(new Error('SVG cannot be rasterized: '+id));
    img.src=isoIconUrl(id);
  });
  const canvas=document.createElement('canvas');
  canvas.width=px;canvas.height=px;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas 2D unavailable');
  const iw=img.naturalWidth||px,ih=img.naturalHeight||px;
  const scale=Math.min(px/iw,px/ih);
  const drawW=Math.max(1,Math.round(iw*scale)),drawH=Math.max(1,Math.round(ih*scale));
  ctx.drawImage(img,Math.round((px-drawW)/2),Math.round((px-drawH)/2),drawW,drawH);
  const png=canvas.toDataURL('image/png');
  _pngCache.set(key,png);
  return png;
}
async function buildIconStripPng(ids,iconPx){
  const items=ids.map(id=>ICON_LIB.find(x=>x.id===id)).filter(Boolean);if(!items.length)return null;
  const fetchSize=iconPx*3;
  const loaded=[];
  for(const it of items){try{const data=await svgToPngDataUrl(it.id,fetchSize);if(!data)continue;const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=data});loaded.push(img)}catch(e){}}
  if(!loaded.length)return null;
  const gap=Math.round(iconPx*.25),c=document.createElement('canvas');c.width=loaded.length*(iconPx+gap)-gap;c.height=iconPx;const x=c.getContext('2d');
  loaded.forEach((im,i)=>x.drawImage(im,i*(iconPx+gap),0,iconPx,iconPx));
  let dataUrl=null;
  try{ dataUrl=c.toDataURL('image/png'); }catch(e){ console.warn('ISO icon canvas export failed',e); return null; }
  return{dataUrl,width:c.width,height:c.height,loaded:loaded.length,total:items.length};
}
// Stage 16: retain in-memory photos when normalizing a step for Excel output.
// normalizeStepShape() intentionally drops media when hydrating JSON drafts;
// it must not be applied destructively to a live step immediately before export.
