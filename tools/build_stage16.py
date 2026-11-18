#!/usr/bin/env python3
"""Stage 16: preserve photographs in SOP Excel export and repair photo editor clicks.

Patch only Stage 15's XLSX photo preparation and photo-button handler.
All other code, AI proxy, pictograms, FRV, TWI and storage schemas stay intact.
"""
from __future__ import annotations
import argparse
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"releases/stage15-local-iso7010-icons.html"
OUT=ROOT/"releases/stage16-excel-photos-and-editor-fixed.html"
PHOTO=ROOT/"src/modules/excel/stage16-step-photo-export.js"

def replace_once(src,old,new,label):
    count=src.count(old)
    if count!=1:
        raise AssertionError(f"{label}: expected one replacement, got {count}")
    return src.replace(old,new,1)

def build():
    baseline=BASE.read_text(encoding="utf-8")
    html=baseline
    a=html.index("async function ensureStepImagesForExport(){")
    b=html.index("async function generateExcel(){",a)
    html=html[:a]+PHOTO.read_text(encoding="utf-8").rstrip()+"\n"+html[b:]

    html=replace_once(html,
        "  state.steps=state.steps.map(normalizeStepShape);\n  recalcTotalTime();\n  await ensureStepImagesForExport();\n  const btn=$('generateBtn'),status=$('generateStatus');",
        "  state.steps=state.steps.map(normalizeExcelStepKeepingPhoto);\n  recalcTotalTime();\n  const btn=$('generateBtn'),status=$('generateStatus');",
        "Keep photo bytes when normalizing live steps")
    html=replace_once(html,
        "  try{\n    await ensureExcelJS();\n    status.textContent='Генерация Excel-файла...';",
        "  try{\n    status.textContent='Проверка фотографий для Excel...';\n    const expectedStepPhotos=await ensureStepImagesForExport();\n    await ensureExcelJS();\n    status.textContent='Генерация Excel-файла...';",
        "Validate photos inside protected Excel export try")
    html=replace_once(html,
        "    let r=15;\n    const vSpans=",
        "    let embeddedStepPhotos=0;\n    let r=15;\n    const vSpans=",
        "Initialize count of embedded photos")

    old_photo="""        if(s?.imageBuffer){
          hasImg=true;
          try{
            const id=wb.addImage({buffer:s.imageBuffer,extension:s.imageExt||'jpeg'});
            ws.addImage(id,{tl:{col:c1-1+0.05,row:r-1+0.05},ext:{width:150,height:95}});
          }catch(e){console.warn('image',e,s.id)}
        }"""
    new_photo="""        if(s?._excelPhoto){
          hasImg=true;
          const id=wb.addImage({base64:s._excelPhoto.base64,extension:s._excelPhoto.extension});
          ws.addImage(id,{tl:{col:c1-1+0.05,row:r-1+0.05},ext:{width:150,height:95}});
          embeddedStepPhotos++;
        }"""
    html=replace_once(html,old_photo,new_photo,
        "Use browser-compatible base64; no silent image catch")

    html=replace_once(html,
        "    status.textContent='Финализация файла...';\n    const buffer=await wb.xlsx.writeBuffer();",
        "    if(embeddedStepPhotos!==expectedStepPhotos){\n"
        "      throw new Error('Количество фотографий в Excel не совпадает с числом фото шагов: '+embeddedStepPhotos+' из '+expectedStepPhotos);\n"
        "    }\n"
        "    if(ws.getImages().length<embeddedStepPhotos)throw new Error('ExcelJS потеряла изображения визуализации до сохранения');\n"
        "    status.textContent='Финализация файла...';\n"
        "    const buffer=await wb.xlsx.writeBuffer();",
        "Fail closed if Excel images are omitted")
    html=replace_once(html,
        "    status.innerHTML='<span class=\"text-green-600 font-medium\">✓ Файл успешно сгенерирован! (3 листа: СОП, ФРВ, Чек-лист)</span>';",
        "    status.innerHTML='<span class=\"text-green-600 font-medium\">✓ Файл успешно сгенерирован! (3 листа: СОП, ФРВ, Чек-лист; фотографий: '+embeddedStepPhotos+')</span>';",
        "Display number of embedded photos")

    # ExcelJS 4.4 emits invalid oneCellAnchor editAs attributes; browsers
    # and openpyxl may drop all drawings despite ZIP media being present.
    # Two-cell anchors are accepted by Excel and openpyxl, and preserve the
    # same pixel extents using sopExcelImageRange().
    html=replace_once(html,
        "    ws.getRow(1).height=9;",
        "    ws.getRow(1).height=9;\n    ws.getRow(2).height=32;",
        "Fix logo row size before defining image anchor")
    html=replace_once(html,
        "      ws.addImage(logoId,{tl:{col:1.05,row:1.08},ext:{width:110,height:22}});",
        "      ws.addImage(logoId,sopExcelImageRange(ws,{col:1.05,row:1.08},110,22));",
        "Use standards-compliant logo anchor")
    html=replace_once(html,
        "    M(14,11,14,12,m.material,{font:{size:10},alignment:C});\n    if(hasIcons){",
        "    M(14,11,14,12,m.material,{font:{size:10},alignment:C});\n    ws.getRow(14).height=clamp((textLines(m.safety,40)+(hasIcons?1:0))*13+34,hasIcons?58:40,130);\n    if(hasIcons){",
        "Compute safety row height before image anchor")
    html=replace_once(html,
        "          ws.addImage(icId,{tl:{col:1.15,row:13.08},ext:{width:strip.width,height:strip.height}});",
        "          ws.addImage(icId,sopExcelImageRange(ws,{col:1.15,row:13.08},strip.width,strip.height));",
        "Use standards-compliant safety-sign anchor")
    html=replace_once(html,
        "      let hasImg=false;\n      for(let k=0;k<3;k++){",
        "      let hasImg=false;\n      ws.getRow(r).height=g.some(st=>st?._excelPhoto)?120:30;\n      for(let k=0;k<3;k++){",
        "Set photo row height before calculating its end anchor")
    html=replace_once(html,
        "          ws.addImage(id,{tl:{col:c1-1+0.05,row:r-1+0.05},ext:{width:150,height:95}});",
        "          ws.addImage(id,sopExcelImageRange(ws,{col:c1-1+0.05,row:r-1+0.05},150,95));",
        "Use standards-compliant step photo anchor")

    # Prevent upload dialog from being called again on an input click bubbling
    # through its own parent drop zone.
    html=replace_once(html,
        "z.addEventListener('click',e=>{if(!e.target.closest('button'))inp.click()});",
        "z.addEventListener('click',e=>{if(e.target.closest('button,input'))return;inp.click()});",
        "Separate upload zone from edit / file input")

    # A failed async open previously appeared as an inert button: make the
    # failure explicit and preserve published/archived read-only documents.
    html=replace_once(html,
        "document.querySelectorAll('[data-edit-photo]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openIllustrationEditor(Number(b.dataset.editPhoto))}));",
        "document.querySelectorAll('[data-edit-photo]').forEach(b=>b.addEventListener('click',async e=>{"
        "e.preventDefault();e.stopPropagation();"
        "if(state.documentManager?.status==='Опубликован'||state.documentManager?.status==='Архив'){"
        "toast('Для разметки фото создайте новую версию СОП','info');return;}"
        "try{await openIllustrationEditor(Number(b.dataset.editPhoto));}"
        "catch(err){console.error('Photo editor open failed',err);document.getElementById('illustrationEditorOverlay')?.remove();toast('Не удалось открыть разметку: '+(err?.message||err),'error');}"
        "}));",
        "Repair photo edit button error feedback")

    start="const AI_PROXY_BASE="
    end="// 2. Generic helpers"
    assert baseline[baseline.index(start):baseline.index(end)]==html[html.index(start):html.index(end)]
    assert baseline.count('id="sop-local-iso-icons"')==html.count('id="sop-local-iso-icons"')==1
    assert baseline.count("const ICON_LIB=[")==html.count("const ICON_LIB=[")==1
    assert "normalizeExcelStepKeepingPhoto" in html
    assert "async function ensureStepImagesForExport()" in html
    assert "embeddedStepPhotos++" in html
    assert "Не удалось открыть разметку" in html
    return html

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-release",action="store_true")
    args=parser.parse_args()
    html=build()
    if args.verify_release:
        if not OUT.exists() or OUT.read_text(encoding="utf-8")!=html:
            raise SystemExit("Stage 16 HTML differs from source; rebuild with tools/build_stage16.py")
        print(f"OK: Stage 16 release reproducible ({len(html)} chars)")
    else:
        OUT.write_text(html,encoding="utf-8")
        print(f"Built {OUT.name} ({len(html)} chars)")

if __name__=="__main__":
    main()
