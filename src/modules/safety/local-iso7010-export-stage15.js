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
