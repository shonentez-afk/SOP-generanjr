#!/usr/bin/env python3
"""Stage39 desktop Chrome: step order, duplication, photo IDB, collapse and safe undo."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage39-step-management-browser-candidate.html"


def open_page(context,errors):
    page=context.new_page()
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.on("dialog",lambda dialog:dialog.accept())
    page.route("http://**",lambda route:route.abort())
    page.route("https://**",lambda route:route.abort())
    page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
    return page


def prepare(page):
    return page.evaluate("""async () => {
      const photoCanvas=document.createElement('canvas');
      photoCanvas.width=96;photoCanvas.height=64;
      const ctx=photoCanvas.getContext('2d');
      ctx.fillStyle='#cbd5e1';ctx.fillRect(0,0,96,64);
      ctx.fillStyle='#135c90';ctx.fillRect(12,12,68,40);
      const blob=await new Promise(resolve=>photoCanvas.toBlob(resolve,'image/png'));
      const first=createEmptyStep();
      first.action='Установить узел';
      first.keyMoments=['Соблюдать направление','Проверить посадку'];
      first.reason='1. Исключить перекос\\n2. Не повредить деталь';
      first.durationSeconds=40;
      first.frv={vdc:false,m1:5,m2:0,move:'',comment:'Исходный замер'};
      first.frvSource={studyId:'original-study',observedTimeSec:12};
      const record={annotations:[{type:'rect',x:0.1,y:0.2,w:0.5,h:0.5,
        color:'#e30613'}],updatedAt:Date.now()};
      if(!(await idbPutPhoto(first.id,blob,'png',record)))throw Error('IDB setup failed');
      if(!(await updateStepPhotoFromRecord(first,await idbGetPhoto(first.id))))
        throw Error('Photo restore failed');
      const second=createEmptyStep();
      second.action='Проверить состояние';second.keyMoments=['Оценить состояние'];
      second.reason='Обеспечить исправность';second.durationSeconds=20;
      const third=createEmptyStep();
      third.action='Записать результат';third.keyMoments=['Сделать запись'];
      third.reason='Обеспечить прослеживаемость';third.durationSeconds=10;
      state.meta.operation='Монтаж узла';
      state.meta.safety='СИЗ и блокировка оборудования';
      state.meta.sopNumber='STAGE39';
      state.meta.department='Цех 1';
      state.meta.workplace='Монтаж';
      state.meta.executor='Оператор';
      state.meta.tools='Инструмент';
      state.meta.material='Узел';
      state.meta.date='2026-11-23';
      state.steps=[first,second,third];
      stateToHtml();
      window.stage39Initial=JSON.stringify(state.steps.map(s=>({
        id:s.id,action:s.action,reason:s.reason,frv:s.frv,frvSource:s.frvSource})));
      return state.steps.map(s=>s.id);
    }""")


def run_stage39():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
             args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            context=browser.new_context(viewport={"width":1510,"height":1020},
                                        accept_downloads=True)
            page=open_page(context,errors)
            ids=prepare(page)
            source,second,third=ids
            assert "Stage39" in page.locator("#sopVersionLabel").inner_text()
            assert page.locator("#stage39UndoBtn").is_disabled()
            assert page.locator('[data-stage39="up"][data-id="'+str(source)+'"]').is_disabled()
            assert page.locator('[data-stage39="down"][data-id="'+str(third)+'"]').is_disabled()

            # Moving changes order, never step IDs, photo pointers, FRV or TWI.
            page.locator('[data-stage39="down"][data-id="'+str(source)+'"]').click()
            assert page.evaluate("() => state.steps.map(s=>s.id)")==[second,source,third]
            assert page.evaluate("id => state.steps.find(s=>s.id===id).frvSource.studyId",source)=="original-study"
            assert not page.locator("#stage39UndoBtn").is_disabled()
            page.locator("#stage39UndoBtn").focus()
            page.keyboard.press("Control+z")
            assert page.evaluate("() => state.steps.map(s=>s.id)")==ids

            # Collapse is view-only, doesn't change the draft or step content.
            page.evaluate("() => window.stage39BeforeCollapse=JSON.stringify(state.steps)")
            page.locator('[data-stage39="collapse"][data-id="'+str(source)+'"]').click()
            assert page.evaluate("""() => {
              const c=document.querySelector('#stepsContainer > .step-card');
              return c.children[1].classList.contains('hidden') &&
                document.querySelector('[data-stage39="collapse"]').getAttribute('aria-expanded')==='false';
            }""")
            assert page.evaluate("() => JSON.stringify(state.steps)===window.stage39BeforeCollapse")
            page.locator('[data-stage39="collapse"][data-id="'+str(source)+'"]').click()
            assert not page.evaluate("""() => document.querySelector('#stepsContainer > .step-card')
               .children[1].classList.contains('hidden')""")

            # A duplicate gets a unique ID and a separately persisted photo.
            page.locator('[data-stage39="duplicate"][data-id="'+str(source)+'"]').click()
            page.wait_for_function("() => state.steps.length===4",timeout=18000)
            copied=page.evaluate("() => state.steps[1].id")
            assert copied not in ids
            copied_ok=page.evaluate("""async args => {
              const original=state.steps.find(s=>s.id===args[0]);
              const cloned=state.steps.find(s=>s.id===args[1]);
              const a=await idbGetPhoto(args[0]),b=await idbGetPhoto(args[1]);
              return !!(a?.blob&&b?.blob&&a.stepId!==b.stepId&&
                cloned.hasPhoto&&cloned.imageData&&cloned.imageData.startsWith('data:')&&
                cloned.photoAnnotations.length===original.photoAnnotations.length&&
                cloned.reason===original.reason&&
                cloned.keyMoments.join('|')===original.keyMoments.join('|')&&
                cloned.frv.m1===''&&!cloned.frvSource&&original.frvSource.studyId==='original-study');
            }""",[source,copied])
            assert copied_ok,"Duplicated photo/provenance unsafe"
            print("PASS Stage39: distinct cloned photo, no fabricated FRV measurement",flush=True)

            # Delete original with photo: IDB original stays, undo reinstates it.
            page.locator('[data-remove="'+str(source)+'"]').click()
            assert page.evaluate("id => !state.steps.some(s=>s.id===id)",source)
            assert page.evaluate("async id => !!(await idbGetPhoto(id))?.blob",source)
            # Text edits made after deletion must survive structural undo.
            page.locator('[data-step-field="action"][data-id="'+str(second)+'"]').fill(
                "Проверить состояние после удаления")
            page.locator("#stage39UndoBtn").click()
            assert page.evaluate("id => state.steps.some(s=>s.id===id&&s.hasPhoto)",source)
            assert page.evaluate("id => state.steps.find(s=>s.id===id).action",
                                 second)=="Проверить состояние после удаления"
            assert page.evaluate("async id => !!(await idbGetPhoto(id))?.blob",source)
            # Undo duplication removes only the duplicate, never original.
            page.locator("#stage39UndoBtn").click()
            assert page.evaluate("() => state.steps.map(s=>s.id)")==ids
            assert page.evaluate("async id => !!(await idbGetPhoto(id))?.blob",source)

            # External document replacement invalidates previous undo history.
            page.locator('[data-stage39="down"][data-id="'+str(source)+'"]').click()
            page.evaluate("""() => {
              state.steps=[createEmptyStep(),createEmptyStep()];
              renderSteps();
            }""")
            assert page.locator("#stage39UndoBtn").is_disabled()

            # A published/archived SOP is protected even with programmatic call.
            locked=page.evaluate("""() => {
              state.documentManager.status='Опубликован';
              applyDocumentLock();
              const before=state.steps.map(s=>s.id).join(',');
              stage39Move(state.steps[0].id,1);
              return {
                same:before===state.steps.map(s=>s.id).join(','),
                up:document.querySelector('[data-stage39="up"]').disabled,
                duplicate:document.querySelector('[data-stage39="duplicate"]').disabled
              };
            }""")
            assert locked["same"] and locked["up"] and locked["duplicate"],locked
            # Even a published SOP can be visually collapsed without mutation.
            first_id=page.evaluate("() => state.steps[0].id")
            page.locator('[data-stage39="collapse"][data-id="'+str(first_id)+'"]').click()
            assert page.evaluate("""() => document.querySelector('#stepsContainer > .step-card')
              .children[1].classList.contains('hidden')""")
            assert not errors,errors
            print("PASS Stage39: reorder, Ctrl+Z, collapse, duplicate, delete/undo, IDB photos, edit retention, stale-document guard, published lock",flush=True)
        finally:
            browser.close()


def previous_regression():
    spec=importlib.util.spec_from_file_location("qa37",ROOT/"qa/stage37_desktop_audit_browser.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()


def main():
    run_stage39()
    previous_regression()


if __name__=="__main__":
    main()
