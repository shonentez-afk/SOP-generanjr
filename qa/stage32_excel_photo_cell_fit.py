#!/usr/bin/env python3
"""Stage32: complete Stage31 smoke + exact real XLSX merged-cell picture anchors."""
from __future__ import annotations
import base64
import hashlib
import importlib.util
import sys
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage32-excel-photo-fill-browser-candidate.html"
SAMPLE=ROOT/"artifacts/stage32-full-cell-photo-example.xlsx"

def inherited_regression():
    path=ROOT/"qa/stage31_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage31_on_stage32",path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RELEASE=RELEASE
    module.main()

def _column_emu(ws,col):
    col_name=get_column_letter(col)
    info=ws.column_dimensions.get(col_name)
    width=info.width if info and info.width is not None else 8.43
    return round((width*7+5)*9525)

def verify_real_xlsx(path,source_hashes):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None,"Corrupted XLSX"
        media=[z.read(k) for k in z.namelist() if k.startswith("xl/media/")]
        hashes={hashlib.sha256(data).hexdigest() for data in media}
        assert set(source_hashes).issubset(hashes),(source_hashes,hashes)
        drawings=[z.read(k) for k in z.namelist()
            if k.startswith("xl/drawings/drawing") and k.endswith(".xml")]
        assert drawings,"Excel drawing anchors missing"
        drawing=b"".join(drawings)
        assert drawing.count(b"<xdr:twoCellAnchor")>=4,"Expected 4 two-cell photo anchors"
        assert b"editAs=\"oneCell\"" in drawing,"Logo/icon existing fixed geometry should be unchanged"
    wb=load_workbook(path)
    assert wb.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"],wb.sheetnames
    ws=wb["СОП"]
    if len(ws._images)!=5:
        import json
        with zipfile.ZipFile(path) as diag:
            names=diag.namelist()
            print("STAGE32_DRAWING_DIAG",json.dumps({
                "imagesRead":len(ws._images),
                "xml":{name:diag.read(name).decode("utf-8","replace")[:9500]
                    for name in names
                    if (name.startswith("xl/drawings/") and name.endswith(".xml"))
                       or name=="xl/worksheets/_rels/sheet1.xml.rels"},
                "sheetTail":diag.read("xl/worksheets/sheet1.xml").decode("utf-8","replace")[-2400:],
            },ensure_ascii=False),flush=True)
    assert len(ws._images)==5,("Four step photos plus unchanged logo",len(ws._images))
    expected={(14,2,4),(14,5,8),(14,9,11),(18,2,4)}
    seen=set()
    for picture in ws._images:
        anchor=picture.anchor
        if not hasattr(anchor,"to"):
            continue  # Existing logo, not a step photo
        a=anchor._from
        if a.row not in (14,18):
            continue
        z=anchor.to
        assert a.row==z.row,(a.row,z.row)
        key=(a.row,a.col,z.col)
        assert key in expected,("Unexpected photo region",key)
        assert key not in seen,("Duplicate image region",key)
        seen.add(key)
        assert a.colOff==4*9525 and a.rowOff==4*9525,(a.colOff,a.rowOff)
        first=a.col+1
        last=z.col+1
        full_width=sum(_column_emu(ws,c) for c in range(first,last+1))
        occupied=sum(_column_emu(ws,c) for c in range(first,last)) + z.colOff - a.colOff
        ratio=occupied/full_width
        assert .94<ratio<1.0,("Not filled across merged width",key,ratio)
        row=ws.row_dimensions[a.row+1]
        full_height=round((row.height or 15)*12700)
        height=z.rowOff-a.rowOff
        h_ratio=height/full_height
        assert .94<h_ratio<1.0,("Not filled across row height",key,h_ratio)
        assert anchor.editAs=='twoCell',("Step photo should resize with row/column",anchor.editAs)
        print("PHOTO_CELL",key,"width",round(ratio*100,1),"%","height",round(h_ratio*100,1),"%",flush=True)
    assert seen==expected,("Missing photo anchors",seen,expected)
    for cell in ("C15:E15","F15:I15","J15:L15","C19:E19"):
        assert cell in {str(x) for x in ws.merged_cells.ranges},cell
    assert ws.row_dimensions[15].height==120 and ws.row_dimensions[19].height==120
    assert wb["ФРВ"].max_row>=13
    print("PASS Stage32 XLSX: all four source photos retained, anchors fill four merged cells, logo and other sheets preserved",flush=True)

def photo_cell_acceptance():
    with sync_playwright() as kit:
        browser=kit.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1440,"height":950},accept_downloads=True)
        errors=[]
        page.on("pageerror",lambda x:errors.append(str(x)))
        page.on("dialog",lambda d:d.accept())
        page.route("https://**",lambda r:r.abort())
        page.route("http://**",lambda r:r.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            dataurls=page.evaluate(r"""() => {
              state.meta.operation='Проверка растяжения фотографий в Excel';
              state.safetyIconIds=[];
              const sizes=[[840,260],[170,360],[340,340],[520,300]];
              state.steps=sizes.map(([w,h],i)=>{
                const s=createEmptyStep();
                s.id=800001+i;
                s.action='Осмотр узла '+(i+1);
                s.keyMoments=['Проверить крепления'];
                s.reason='Обеспечить безопасность';
                s.durationSeconds=30+i*4;
                const c=document.createElement('canvas');
                c.width=w;c.height=h;
                const ctx=c.getContext('2d');
                ctx.fillStyle=['#127a90','#f08040','#65b354','#6434ba'][i];
                ctx.fillRect(0,0,w,h);
                ctx.fillStyle='#fff';ctx.fillRect(5,5,15,15);
                const url=c.toDataURL('image/png');
                s.imageData=url;s.imageExt='png';s.hasPhoto=true;
                return s;
              });
              stateToHtml();
              return state.steps.map(s=>s.imageData);
            }""")
            hashes=[hashlib.sha256(base64.b64decode(s.split(",",1)[1])).hexdigest() for s in dataurls]
            with page.expect_download(timeout=90000) as event:
                page.locator("#generateBtn").click()
            SAMPLE.parent.mkdir(parents=True,exist_ok=True)
            event.value.save_as(str(SAMPLE))
            verify_real_xlsx(SAMPLE,hashes)

            # Import the resulting workbook and ensure the floating anchors still
            # resolve to the correct SOP steps instead of appearing as logo/ISO.
            page.locator("#importSopInput").set_input_files(str(SAMPLE))
            page.wait_for_function("""() => state.steps.length===4 &&
              state.steps.every(s => s.hasPhoto && !!s.imageData)""",timeout=20000)
            assert len(page.evaluate("() => state.steps"))==4
            assert not errors,errors
            print("PASS Stage32 offline import roundtrip: 4 photos in correct SOP steps",flush=True)
        finally:
            browser.close()

def main():
    inherited_regression()
    photo_cell_acceptance()

if __name__=="__main__":main()
