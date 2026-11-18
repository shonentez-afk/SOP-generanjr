#!/usr/bin/env python3
"""Stage 16: real Chrome file:// UI + image-bearing XLSX acceptance test.

Checks the actual file attachment, the "Разметить" button and editor,
saving non-destructive markup, and an exported XLSX ZIP with real images.
Runs without any HTTP(S) access, using the browser's actual IndexedDB.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import struct
import tempfile
import zlib
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage16-excel-photos-and-editor-fixed.html"

def demo_png(width=240,height=160):
    """Construct a 240x160 RGB PNG with a recognizable color gradient."""
    def chunk(kind,payload):
        data=kind+payload
        return struct.pack("!I",len(payload))+data+struct.pack("!I",zlib.crc32(data)&0xffffffff)
    rows=[]
    for y in range(height):
        raw=bytearray([0])
        for x in range(width):
            raw.extend(((x*255)//width, (y*255)//height, 70 if x<width//2 else 210))
        rows.append(bytes(raw))
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack("!IIBBBBB",width,height,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(b"".join(rows)))+chunk(b"IEND",b"")

def assert_excel_photos(path,expected_photo_sha):
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None: raise AssertionError("XLSX damaged")
        names=archive.namelist()
        photos={name:archive.read(name) for name in names if name.startswith("xl/media/")}
        if len(photos)<3:
            raise AssertionError(f"Need logo, ISO sign and actual step photo; got {list(photos)}")
        photo_hits=[name for name,data in photos.items() if hashlib.sha256(data).hexdigest()==expected_photo_sha]
        if len(photo_hits)!=1:
            raise AssertionError(f"Edited step photo not embedded into XLSX (matches={photo_hits})")
        drawing_files=[name for name in names if name.startswith("xl/drawings/") and name.endswith(".xml")]
        if not drawing_files:
            raise AssertionError("XLSX has media but no Excel drawing anchors")
        xml=b"".join(archive.read(name) for name in drawing_files)
        if xml.count(b"<xdr:pic>")<3:
            raise AssertionError("XLSX drawing does not anchor all 3 illustrations")
        from openpyxl import load_workbook
        wb=load_workbook(path,read_only=False)
        if wb.sheetnames[:3]!=['СОП','ФРВ','Чек-лист оценки СОП']:
            raise AssertionError("Workbook sheet names/regression unexpected: "+repr(wb.sheetnames))
        if len(wb['СОП']._images)<3:
            print("XLSX_IMAGE_ANCHORS",json.dumps({
              "openpyxlImageCount":len(wb['СОП']._images),
              "mediaNames":list(photos),
              "drawingXml":xml.decode('utf-8','replace')[:6200],
              "sheet1Drawing":archive.read('xl/worksheets/sheet1.xml').decode('utf-8','replace')[-1900:],
              "rels":{x:archive.read(x).decode('utf-8','replace')[:1800] for x in names if x.startswith('xl/drawings/_rels/')},
            },ensure_ascii=False),flush=True)
            raise AssertionError("openpyxl cannot see all three anchored pictures")
        return {"media":list(photos),"matchingStepPhoto":photo_hits[0],"drawingPics":xml.count(b"<xdr:pic>"),"openpyxlImages":len(wb['СОП']._images)}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--chrome-channel",default="chrome")
    parser.add_argument("--screenshot",default="")
    args=parser.parse_args()
    assert RELEASE.is_file(),RELEASE
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel=args.chrome_channel,args=["--no-sandbox","--disable-dev-shm-usage"])
        ctx=browser.new_context(viewport={"width":1440,"height":1000},accept_downloads=True)
        page=ctx.new_page()
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
        page.locator("#addStepBtn").click()
        page.locator("[data-step-field='action']").first.fill("Учебная операция — закрепить клемму")
        page.locator("input[data-input]").first.set_input_files(
            {"name":"training.png","mimeType":"image/png","buffer":demo_png()}
        )
        page.locator("button[data-edit-photo]").first.wait_for(state="visible",timeout=20000)
        page.locator("button[data-edit-photo]").first.click()
        page.wait_for_timeout(200)
        diag=page.evaluate("""async () => ({
          isReadOnly:document.body.classList.contains('document-readonly'),
          docStatus:state.documentManager?.status,
          photoData:!!state.steps[0]?.imageData,
          photoBytes:state.steps[0]?.imageBuffer?.byteLength,
          hasPhoto:state.steps[0]?.hasPhoto,
          idbRecord:!!(await idbGetPhoto(state.steps[0].id))?.blob,
          overlay:!!document.getElementById('illustrationEditorOverlay'),
          buttonDisabled:document.querySelector('[data-edit-photo]')?.disabled,
          toasts:document.getElementById('toastContainer')?.innerText||''
        })""")
        print("PHOTO_EDITOR_DIAGNOSTIC",json.dumps({"state":diag,"errors":errors},ensure_ascii=False),flush=True)
        try:
            page.locator("#illustrationEditorOverlay").wait_for(state="visible",timeout=5000)
        except Exception:
            if args.screenshot:
                dest=Path(args.screenshot)
                dest.parent.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(dest),full_page=True)
            raise
        page.locator("[data-ill-mode='rect']").click()
        canvas=page.locator("#illCanvas")
        canvas.scroll_into_view_if_needed()
        pos=canvas.bounding_box()
        if not pos: raise AssertionError("Editor canvas did not open")
        x,y=pos["x"]+35,pos["y"]+30
        page.mouse.move(x,y)
        page.mouse.down()
        page.mouse.move(x+90,y+60,steps=6)
        page.mouse.up()
        page.locator("#illSave").click()
        page.locator("#illustrationEditorOverlay").wait_for(state="detached",timeout=15000)
        # Repeat the actual button click after saving and prove the markup
        # editor can reopen an existing layered illustration.
        page.locator("button[data-edit-photo]").first.click()
        page.locator("#illustrationEditorOverlay").wait_for(state="visible",timeout=15000)
        page.locator("#illCancel").click()
        page.locator("#illustrationEditorOverlay").wait_for(state="detached",timeout=15000)
        image=page.evaluate("""() => {
            if(!state.steps[0].photoEdited || !state.steps[0].photoAnnotations.length)
                throw Error('Markup was not saved');
            return state.steps[0].imageData;
        }""")
        if not image.startswith("data:image/jpeg;base64,"):
            raise AssertionError("Edited rendered JPEG is not present in live step")
        photo_sha=hashlib.sha256(base64.b64decode(image.split(",",1)[1])).hexdigest()
        page.evaluate("""() => {state.safetyIconIds=['M004'];renderIconPicker();}""")

        with tempfile.TemporaryDirectory() as tmp:
            with page.expect_download(timeout=90000) as event:
                page.locator("#generateBtn").click()
            download=event.value
            out=Path(tmp)/"exported.xlsx"
            download.save_as(str(out))
            result=assert_excel_photos(out,photo_sha)
            if args.screenshot:
                dest=Path(args.screenshot)
                dest.parent.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(dest),full_page=True)
            # Force a no-in-memory-blob export: the photo must be read from
            # real persisted IndexedDB and still match the annotated preview.
            page.evaluate("""() => {
                state.steps[0].imageData=null;state.steps[0].imageBuffer=null;
                state.steps[0].hasPhoto=true;
            }""")
            with page.expect_download(timeout=90000) as second:
                page.locator("#generateBtn").click()
            out2=Path(tmp)/"exported-restored.xlsx"
            second.value.save_as(str(out2))
            second_result=assert_excel_photos(out2,photo_sha)

            # A missing indicated photo must not produce a deceptively valid file.
            page.evaluate("""() => {
              const s=createEmptyStep();
              s.action='Нет фото в IndexedDB';
              s.hasPhoto=true;
              state.steps.push(s);
            }""")
            page.locator("#generateBtn").click()
            page.locator("#generateStatus").get_by_text("Excel не создан",exact=False).wait_for(timeout=15000)
            if errors: raise AssertionError("Uncaught browser errors: "+str(errors[:6]))
            print(json.dumps({"editor":"opened_and_saved_markup","firstExcel":result,"IndexedDBExcel":second_result,"missingPhoto":"blocked_as_expected","browserErrors":errors},ensure_ascii=False,indent=2))
        browser.close()

if __name__=="__main__":
    main()
