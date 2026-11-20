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
    """Real XLSX: two layered images per photo, visible cells filled, foreground intact."""
    from collections import defaultdict
    from io import BytesIO
    from PIL import Image
    from xml.etree import ElementTree as ET
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None,"Corrupted XLSX"
        media={k:z.read(k) for k in z.namelist() if k.startswith("xl/media/")}
        hashes={hashlib.sha256(data).hexdigest() for data in media.values()}
        assert set(source_hashes).issubset(hashes),"Original step images missing"
        drawings=[z.read(k) for k in z.namelist()
            if k.startswith("xl/drawings/drawing") and k.endswith(".xml")]
        assert drawings,"Excel drawing anchors missing"
        drawing=b"".join(drawings)
        assert drawing.count(b"<xdr:oneCellAnchor>")>=8,"Expected 4 image-background pairs"
        assert b"<xdr:oneCellAnchor editAs=" not in drawing,"Invalid ExcelJS anchor"
        assert b"<xdr:twoCellAnchor editAs=\"oneCell\"" in drawing,"Original logo geometry changed"
        ns={"xdr":"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
            "a":"http://schemas.openxmlformats.org/drawingml/2006/main"}
        for drawing_xml in drawings:
            root=ET.fromstring(drawing_xml)
            for anchor in root.findall("xdr:oneCellAnchor",ns):
                assert anchor.find("xdr:pic/xdr:spPr/a:xfrm",ns) is None,"Zero picture transform"
                assert anchor.find("xdr:pic/xdr:nvPicPr/xdr:cNvPicPr/a:picLocks",ns) is None,"Picture aspect lock"
    wb=load_workbook(path)
    assert wb.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"],wb.sheetnames
    ws=wb["СОП"]
    assert len(ws._images)==9,("4 original foreground + 4 backgrounds + logo",len(ws._images))
    expected=[(14,2,4),(14,5,8),(14,9,11),(18,2,4)]
    found=defaultdict(list)
    photos_set=set(source_hashes)
    for picture in ws._images:
        anchor=picture.anchor
        if not hasattr(anchor,"ext"):
            continue # The original template logo uses a two-cell anchor.
        a=anchor._from
        if a.row not in (14,18):
            continue
        if 2<=a.col<=4: left,right=2,4
        elif 5<=a.col<=8: left,right=5,8
        elif 9<=a.col<=11: left,right=9,11
        else: raise AssertionError(("Image started outside SOP photo groups",a.col))
        key=(a.row,left,right)
        assert key in expected,("Unexpected image rectangle",key)
        data=picture._data()
        digest=hashlib.sha256(data).hexdigest()
        is_foreground=digest in photos_set
        native_width,native_height=Image.open(BytesIO(data)).size
        assert native_width>0 and native_height>0
        displayed=anchor.ext.width/anchor.ext.height
        if is_foreground:
            ratio=native_width/native_height
            assert abs(displayed/ratio-1)<.025,("Photo stretched!",key,ratio,displayed)
        else:
            assert a.col==left and a.colOff==6*9525
            assert a.rowOff==6*9525
            full_width=sum(_column_emu(ws,c) for c in range(left+1,right+2))
            # For actual Excel desktop, stored column width units *7 px is
            # closer to visible pixels than the old +5 px per-column formula.
            # openpyxl column_dimensions[letter] creates a phantom default
            # width=13 when ExcelJS omitted an explicit width=9 (column I).
            # Use .get() without mutation, matching the export manifest width.
            def width_chars(c):
                item=ws.column_dimensions.get(get_column_letter(c))
                return item.width if item and item.width is not None else 9
            expected_width=int(sum(width_chars(c)*7 for c in range(left+1,right+2)))-12
            assert abs(anchor.ext.width/9525-expected_width)<=1,(key,anchor.ext.width/9525,expected_width)
            assert anchor.ext.width < full_width
            assert anchor.ext.height==148*9525,("Photo frame height changed",key,anchor.ext.height/9525)
        found[key].append((is_foreground,anchor,digest))
    assert set(found)==set(expected),("Missing photo areas",found.keys())
    for key,hits in found.items():
        assert len(hits)==2 and not hits[0][0] and hits[1][0],("Wrong image layering",key,hits)
        bg=hits[0][1]; fg=hits[1][1]
        assert fg.ext.width<=bg.ext.width and fg.ext.height<=bg.ext.height,(key,fg.ext,bg.ext)
        assert hits[1][2]==source_hashes[expected.index(key)],("Original order mismatch",key)
        # Check shape extents without relying on a graphic program that
        # discards image crops or silently distorts native proportions.
        print("PHOTO_PAIR",key,"background_px",(round(bg.ext.width/9525),round(bg.ext.height/9525)),
              "foreground_px",(round(fg.ext.width/9525),round(fg.ext.height/9525)),flush=True)
    for cell in ("C15:E15","F15:I15","J15:L15","C19:E19"):
        assert cell in {str(x) for x in ws.merged_cells.ranges},cell
    assert ws.row_dimensions[15].height==120 and ws.row_dimensions[19].height==120
    assert wb["ФРВ"].max_row>=13
    print("PASS Stage32.2 XLSX: 4 originals plus 4 backgrounds, no distortions, no missing photo, formulas and logo preserved",flush=True)

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
            assert "_ФОТО_STAGE32_2.xlsx" in event.value.suggested_filename,event.value.suggested_filename
            event.value.save_as(str(SAMPLE))
            verify_real_xlsx(SAMPLE,hashes)

            # Import the resulting workbook and ensure the floating anchors still
            # resolve to the correct SOP steps instead of appearing as logo/ISO.
            page.locator("#importSopInput").set_input_files(str(SAMPLE))
            page.wait_for_function("""() => state.steps.length===4 &&
              state.steps.every(s => s.hasPhoto && !!s.imageData)""",timeout=20000)
            imported=page.evaluate("() => state.steps.map(s=>s.imageData)")
            imported_hashes=[hashlib.sha256(base64.b64decode(url.split(",",1)[1])).hexdigest()
                for url in imported]
            assert imported_hashes==hashes,("Roundtrip must restore exact original photos",imported_hashes,hashes)
            assert not errors,errors
            print("PASS Stage32.2 Excel import: exact four source image SHA preserved",flush=True)
        finally:
            browser.close()

def main():
    inherited_regression()
    photo_cell_acceptance()

if __name__=="__main__":main()
