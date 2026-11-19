#!/usr/bin/env python3
"""Stage30: Stage29 full browser suite + real photo-editor UX and persistence."""
from __future__ import annotations
import importlib.util
import struct
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage30-photo-editor-browser-candidate.html"

def small_png(w=900,h=600):
    raw=b''.join(b'\0'+bytes([110,170,215])*w for _ in range(h))
    def chunk(tag,data):
        return struct.pack("!I",len(data))+tag+data+struct.pack("!I",zlib.crc32(tag+data)&0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',w,h,8,2,0,0,0))+
            chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

def existing_regression():
    p=ROOT/"qa/stage29_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage29_on_stage30",p)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.RELEASE=RELEASE
    m.main()

def drag(page,a,b):
    page.mouse.move(*a)
    page.mouse.down()
    page.mouse.move(*b,steps=5)
    page.mouse.up()

def photo_editor_acceptance():
    with sync_playwright() as kit:
        browser=kit.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1510,"height":1050})
        errors=[]
        dialogs=[]
        confirm={"accept":True}
        page.on("pageerror",lambda err:errors.append(str(err)))
        def handle(d):
            dialogs.append(d.message)
            d.accept() if confirm["accept"] else d.dismiss()
        page.on("dialog",handle)
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.locator("#addStepBtn").click()
            page.locator('[data-step-field="action"]').first.fill("Проверить фиксатор кожуха")
            page.locator("[data-input]").first.set_input_files({
                "name":"photo-test.png","mimeType":"image/png","buffer":small_png()
            })
            page.wait_for_function("() => !!state.steps[0]?.imageData",timeout=9000)
            original=page.evaluate("""async () => {
              const id=state.steps[0].id,rec=await idbGetPhoto(id);
              return {id,data:await blobToDataUrl(rec.blob),len:rec.blob.size};
            }""")
            page.locator("[data-edit-photo]").first.click()
            page.wait_for_selector("#illZoomFit",timeout=8000)
            assert page.locator("#illUndo").is_disabled()
            assert page.locator("#illRedo").is_disabled()
            initial_zoom=page.locator("#illZoomValue").inner_text()
            before=page.locator("#illCanvas").bounding_box()
            page.locator("#illZoomIn").click()
            after=page.locator("#illCanvas").bounding_box()
            assert after["width"]>before["width"]*1.04,(before,after)
            assert page.locator("#illZoomValue").inner_text()!=initial_zoom
            page.locator("#illZoomFit").click()
            assert page.locator("#illCanvas").is_visible()

            # One draw + one badge + delete + undo/redo of deletion.
            box=page.locator("#illCanvas").bounding_box()
            page.locator('[data-ill-mode="rect"]').click()
            drag(page,(box["x"]+45,box["y"]+45),(box["x"]+180,box["y"]+115))
            assert page.locator("#illUndo").is_enabled()
            page.locator('[data-ill-mode="badge"]').click()
            page.mouse.click(box["x"]+250,box["y"]+120)
            page.locator("#illDeleteSelected").click()
            page.locator("#illUndo").click()
            assert page.locator("#illRedo").is_enabled()
            page.locator("#illRedo").click()
            page.locator("#illUndo").click()

            # Text input Backspace must not delete shapes; text changes undoable.
            page.locator("#illTextInput").fill("Проверить")
            page.locator('[data-ill-mode="label"]').click()
            page.mouse.click(box["x"]+75,box["y"]+145)
            page.locator("#illTextInput").fill("Проверить фиксатор")
            page.locator("#illTextInput").press("Backspace")
            assert page.locator("#illTextInput").input_value()=="Проверить фиксато"
            page.locator("#illZoomFit").click()  # input blur commits text revision
            page.locator("#illUndo").click()
            page.locator("#illRedo").click()
            assert page.locator("#illUndo").is_enabled()

            # Unsaved work must be explicitly confirmed, not silently discarded.
            confirm["accept"]=False
            page.locator("#illCancel").click()
            assert page.locator("#illustrationEditorOverlay").is_visible()
            assert any("не сохранена" in msg for msg in dialogs),dialogs
            confirm["accept"]=True
            page.locator("#illCancel").click()
            assert page.locator("#illustrationEditorOverlay").count()==0
            assert page.evaluate("() => (state.steps[0].photoAnnotations||[]).length")==0

            # Reopen: retained original, new fresh history; clear and undo all.
            page.locator("[data-edit-photo]").first.click()
            assert page.locator("#illUndo").is_disabled()
            box=page.locator("#illCanvas").bounding_box()
            page.locator('[data-ill-mode="rect"]').click()
            drag(page,(box["x"]+50,box["y"]+45),(box["x"]+190,box["y"]+140))
            page.locator("#illTextInput").fill("Точка контроля")
            page.locator('[data-ill-mode="label"]').click()
            page.mouse.click(box["x"]+220,box["y"]+100)
            assert page.locator("#illUndo").is_enabled()
            page.locator("#illClear").click()
            assert page.locator("#illUndo").is_enabled()
            page.locator("#illUndo").click() # undo clear => both restored
            page.locator("#illSave").click()
            page.wait_for_function("() => !document.getElementById('illustrationEditorOverlay')",timeout=8000)
            saved=page.evaluate("""async () => {
              const step=state.steps[0],rec=await idbGetPhoto(step.id);
              return {
                shapes:(step.photoAnnotations||[]).map(x=>({type:x.type,text:x.text||'',x:x.x,w:x.w})),
                original:await blobToDataUrl(rec.blob),
                rendered:!!rec.renderedBlob,ext:rec.renderedExt,
                image:!!step.imageData,edited:step.photoEdited
              };
            }""")
            assert [x["type"] for x in saved["shapes"]]==["rect","label"],saved
            assert saved["rendered"] and saved["image"] and saved["edited"],saved
            assert saved["original"]==original["data"],"Original photo was overwritten"
            assert saved["shapes"][0]["w"]>10 and saved["shapes"][0]["w"]<400,saved

            page.locator("[data-edit-photo]").first.click()
            assert page.locator("#illUndo").is_disabled()
            page.locator("#illCancel").click()
            assert page.locator("#illustrationEditorOverlay").count()==0
            assert not errors,errors
            print("PASS Stage30 Chrome photo: undo/redo deletion, clear restore, text/backspace, zoom, unsaved discard guard, original photo untouched, rendered JPEG persists",flush=True)
        finally:
            browser.close()

def main():
    existing_regression()
    photo_editor_acceptance()

if __name__=="__main__":
    main()
