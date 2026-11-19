#!/usr/bin/env python3
"""Chrome file:// acceptance: both success and failure of Excel keep live steps."""
from __future__ import annotations
import base64
import hashlib
import importlib.util
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage20-a2-safe-export.html"

def use_old_suite(path: str) -> None:
    f=ROOT/path
    spec=importlib.util.spec_from_file_location("stage20_"+f.stem,f)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    print("Stage20 real browser regression:",path,flush=True)
    mod.main()

def check_immutable_export() -> None:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1365,"height":930},accept_downloads=True)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.locator("#meta-operation").fill("Учебная операция")
            page.evaluate("""() => {
              const s=createEmptyStep();
              s.action='Проверить расположение инструмента';
              s.keyMoments=['Не касаться движущихся частей'];
              s.durationSeconds=35;s.frv={vdc:true,m2:'1',m1:'0',move:'2',comment:'Проверка'};
              const c=document.createElement('canvas');c.width=80;c.height=80;
              const g=c.getContext('2d');g.fillStyle='#bd3924';g.fillRect(0,0,80,80);
              s.imageData=c.toDataURL('image/png');s.hasPhoto=true;
              s.photoAnnotations=[{type:'label',x:5,y:10,text:'Фото'}];
              state.steps=[s];state.safetyIconIds=['M001'];
              window.__liveSteps=state.steps;window.__liveStep=state.steps[0];
              window.__liveJson=JSON.stringify(state.steps);
              window.__liveBuffer=s.imageData;
              localStorage.setItem(DRAFT_KEY,'work-in-progress');
            }""")
            with tempfile.TemporaryDirectory() as tmp:
                with page.expect_download(timeout=90000) as event:
                    page.locator("#generateBtn").click()
                downloaded=event.value
                target=Path(tmp)/"from-snapshot.xlsx"
                downloaded.save_as(str(target))
                from qa_image_check import check_xlsx
                check_xlsx(target)
            verdict=page.evaluate("""() => ({
              sameArray:state.steps===window.__liveSteps,
              sameStep:state.steps[0]===window.__liveStep,
              sameJson:JSON.stringify(state.steps)===window.__liveJson,
              containsTemporaryPhoto:Object.hasOwn(state.steps[0],'_excelPhoto'),
              imageDataUnchanged:state.steps[0].imageData===window.__liveBuffer,
              draftExists:!!localStorage.getItem(DRAFT_KEY)
            })""")
            assert verdict=={"sameArray":True,"sameStep":True,"sameJson":True,
                             "containsTemporaryPhoto":False,"imageDataUnchanged":True,"draftExists":True},verdict
            page.evaluate("""() => {
              const s=createEmptyStep();s.action='Фото отсутствует';s.hasPhoto=true;
              state.steps.push(s);
              window.__failedArray=state.steps;
              window.__failedStep=state.steps[1];
              window.__beforeFailure=JSON.stringify(state.steps);
            }""")
            page.locator("#generateBtn").click()
            page.locator("#generateStatus").get_by_text("Excel не создан",exact=False).wait_for(timeout=20000)
            failure=page.evaluate("""() => ({
              sameArray:state.steps===window.__failedArray,
              sameStep:state.steps[1]===window.__failedStep,
              sameJson:JSON.stringify(state.steps)===window.__beforeFailure,
              noExportFields:state.steps.every(s=>!Object.hasOwn(s,'_excelPhoto'))
            })""")
            assert all(failure.values()),failure
            assert not errors,errors
            print("PASS: file:// valid XLSX + no mutation of live editor, failure remains non-destructive",flush=True)
        finally:
            browser.close()

def main():
    use_old_suite("qa/stage18_real_mentor_reply.py")
    use_old_suite("qa/stage16_real_excel_photos.py")
    check_immutable_export()

if __name__=="__main__":
    main()
