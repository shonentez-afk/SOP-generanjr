#!/usr/bin/env python3
"""Stage31: Stage30 full browser regression, then precise annotation flows."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage31-photo-precision-browser-candidate.html"

def main():
    previous=ROOT/"qa/stage30_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage30_on_stage31",previous)
    old=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    old.RELEASE=RELEASE
    old.main()
    with sync_playwright() as kit:
        browser=kit.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1510,"height":1050})
        errors=[]
        page.on("pageerror",lambda x:errors.append(str(x)))
        page.on("dialog",lambda d:d.accept())
        page.route("https://**",lambda r:r.abort())
        page.route("http://**",lambda r:r.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.locator("#addStepBtn").click()
            page.locator('[data-step-field="action"]').first.fill("Проверить узел фиксации")
            page.locator("[data-input]").first.set_input_files({
                "name":"annotation-test.png","mimeType":"image/png","buffer":old.small_png()
            })
            page.wait_for_function("() => !!state.steps[0]?.imageData",timeout=9000)
            page.locator("[data-edit-photo]").first.click()
            page.wait_for_selector("#illZoomFit",timeout=8000)
            canvas=page.locator("#illCanvas")
            box=canvas.bounding_box()
            # A label template must update the selected annotation and the Undo stack.
            page.locator("#illTextInput").fill("Исходная подпись")
            page.locator('[data-ill-mode="label"]').click()
            page.mouse.click(box["x"]+90,box["y"]+85)
            page.locator('[data-ill-template="Проверить заполнение"]').click()
            assert page.locator("#illTextInput").input_value()=="Проверить заполнение"
            assert page.locator("#illUndo").is_enabled()
            page.locator("#illUndo").click()
            page.locator("#illSave").click()
            page.wait_for_function("() => !document.getElementById('illustrationEditorOverlay')",timeout=8000)
            ann=page.evaluate("() => state.steps[0].photoAnnotations")
            assert ann and ann[0]["type"]=="label",ann
            assert ann[0]["text"]=="Исходная подпись",ann
            # Geometry: callout's pointer is located at first drag point, not text box.
            page.locator("[data-edit-photo]").first.click()
            page.locator("#illTextInput").fill("Контрольная точка")
            page.locator('[data-ill-mode="callout"]').click()
            box=canvas.bounding_box()
            old.drag(page,(box["x"]+80,box["y"]+90),(box["x"]+240,box["y"]+160))
            page.locator("#illSave").click()
            page.wait_for_function("() => !document.getElementById('illustrationEditorOverlay')",timeout=8000)
            ann=page.evaluate("() => state.steps[0].photoAnnotations")
            assert ann[-1]["type"]=="callout",ann
            assert ann[-1]["x1"]<ann[-1]["x2"],ann
            # Simulate a slow/rejected IndexedDB write: keep unsaved work and restore controls.
            page.locator("[data-edit-photo]").first.click()
            page.locator('[data-ill-mode="badge"]').click()
            box=canvas.bounding_box()
            page.mouse.click(box["x"]+65,box["y"]+55)
            page.evaluate("""() => {window.__savedIdbPutPhoto=idbPutPhoto;
              idbPutPhoto=async()=>{await new Promise(r=>setTimeout(r,200));return false};}""")
            page.locator("#illSave").click()
            assert page.locator("#illSave").is_disabled()
            page.wait_for_function("() => !document.querySelector('#illustrationEditorOverlay[aria-busy]')",timeout=8000)
            assert page.locator("#illustrationEditorOverlay").is_visible()
            assert page.locator("#illSave").is_enabled()
            assert page.locator("#illUndo").is_enabled()
            page.evaluate("() => {idbPutPhoto=window.__savedIdbPutPhoto}")
            page.locator("#illSave").click()
            page.wait_for_function("() => !document.getElementById('illustrationEditorOverlay')",timeout=8000)
            assert len(page.evaluate("() => state.steps[0].photoAnnotations"))==3
            assert not errors,errors
            print("PASS Stage31: label templates undo, callout geometry, IndexedDB failure recovery, original Stage30 regression")
        finally:
            browser.close()

if __name__=="__main__":main()
