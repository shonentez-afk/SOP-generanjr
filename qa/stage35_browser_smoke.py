#!/usr/bin/env python3
"""Stage35 real Chrome file:// UX/integrity audit, plus complete Stage34.1 regression."""
from __future__ import annotations
import importlib.util
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage35-frv-ux-functional-audit-browser-candidate.html"
OUT=ROOT/"artifacts"

def accepted_regression():
    sp=importlib.util.spec_from_file_location(
        "stage34_accepted",ROOT/"qa/stage34_browser_smoke.py")
    m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
    m.RELEASE=RELEASE
    m.main()

def full_frvs_ux_audit():
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        context=browser.new_context(viewport={"width":1500,"height":1024},accept_downloads=True)
        page=context.new_page()
        errors=[]
        delete_allowed=[False]
        page.on("pageerror",lambda e:errors.append(str(e)))
        def dialog_action(d):
            if d.message.startswith("Удалить") and not delete_allowed[0]:
                d.dismiss()
            else:
                d.accept()
        page.on("dialog",dialog_action)
        page.route("http://**",lambda r:r.abort())
        page.route("https://**",lambda r:r.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvStudyNewBtn").click()
            page.locator("#frvs-operationId").fill("FRV35_UNIQUE_ALPHA")
            page.locator("#frvs-workplace").fill("Участок ALPHA")
            page.locator("#frvStudyCycles [data-fs='actionRaw']").first.fill("Осмотр подшипника")
            page.locator("#frvStudyCycles [data-fs='durationSec']").first.fill("31.25")
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""",
              timeout=20000)
            first=page.evaluate("""async () => ({
              id:state.frvStudy.libraryId,
              actual:state.frvStudy.cycles[0].observations[0].durationSec,
              stored:(await frv34StoreGet(state.frvStudy.libraryId))?.payload.cycles[0]
                .observations[0].durationSec,
              active:frv35SelectedStudyId
            })""")
            assert first["actual"]==first["stored"]==31.25,first
            assert first["id"]==first["active"],first

            # SOP document creation must never silently select/create a
            # different FRV research, even if it resets state.frvStudy.
            page.locator('[data-tab="editor"]').click()
            page.evaluate("async () => {await docNew()}")
            assert page.evaluate("() => state.frvStudy===null")
            page.evaluate("""() => {
              state.steps=[createEmptyStep()];
              state.steps[0].action='Совсем другой СОП';
              state.steps[0].durationSeconds=17;
              state.meta.operation='Другая технологическая операция';
              stateChanged();
            }""")
            page.locator('[data-tab="frvstudy"]').click()
            page.wait_for_function("""id => state.frvStudy?.libraryId===id""",
              arg=first["id"],timeout=20000)
            assert page.locator("#frvs-operationId").input_value()=="FRV35_UNIQUE_ALPHA"
            assert page.locator("#frvStudyCycles [data-fs='durationSec']").first.input_value()=="31.25"
            assert page.evaluate("() => state.steps[0].action")=="Совсем другой СОП"

            # Reload (including draft localStorage state) must recover the
            # independently selected research from IndexedDB.
            page.reload(wait_until="domcontentloaded")
            page.locator('[data-tab="frvstudy"]').click()
            page.wait_for_function("""id => state.frvStudy?.libraryId===id""",
              arg=first["id"],timeout=20000)
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[0].durationSec")==31.25

            # A second research stays isolated and searchable.
            page.locator("#frvStudyNewBtn").click()
            page.locator("#frvs-operationId").fill("FRV35_UNIQUE_BETA")
            page.locator("#frvStudyCycles [data-fs='actionRaw']").first.fill("Смазка редуктора")
            page.locator("#frvStudyCycles [data-fs='durationSec']").first.fill("18")
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""",
              timeout=20000)
            second=page.evaluate("() => state.frvStudy.libraryId")
            assert second!=first["id"]
            page.locator("#frvStudyOpenBtn").click()
            page.locator("#frvStudyLibrarySearch").fill("FRV35_UNIQUE_ALPHA")
            page.wait_for_function("""() =>
              document.querySelectorAll('#frvStudyLibraryItems [data-frv-open]').length===1""",
              timeout=15000)
            page.locator("#frvStudyLibraryItems [data-frv-archive]").first.click()
            page.wait_for_function("""() =>
              document.querySelectorAll('#frvStudyLibraryItems [data-frv-open]').length===0""",
              timeout=15000)
            page.locator("#frvStudyShowArchived").check()
            page.wait_for_function("""() =>
              document.querySelectorAll('#frvStudyLibraryItems [data-frv-open]').length===1""",
              timeout=15000)
            page.locator("#frvStudyLibraryItems [data-frv-archive]").first.click()
            page.wait_for_function("""() =>
              document.querySelector('#frvStudyLibraryItems')?.textContent?.includes('В архив')""",
              timeout=15000)
            page.locator("#frvStudyLibraryItems [data-frv-open]").first.click()
            page.wait_for_function("id => state.frvStudy?.libraryId===id",
                arg=first["id"],timeout=20000)
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[0].durationSec")==31.25

            # Optional AI classification can NEVER change a measured row if
            # its action/time/comment changed since generation.
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify({classifications:[{
                observationId:state.frvStudy.cycles[0].observations[0].id,
                valueType:'VA',reason:'Исключительно предложение для проверки',
                confidence:'medium'}]});
              aiGuardCanApply=()=>true;
            }""")
            page.locator("#frvStudyClassifyBtn").click()
            page.wait_for_selector("#frv34AiClassifications [data-frv34-classify]",
                                   timeout=10000)
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[0].valueType")=="OTHER"
            page.locator("#frvStudyCycles [data-fs='durationSec']").first.fill("32.75")
            page.wait_for_function("""() =>
              document.querySelector('#frv34AiClassifications')?.textContent?.includes('УСТАРЕЛО')""",
              timeout=15000)
            assert page.locator("#frv34AiClassifications [data-frv34-classify]").count()==0
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[0].valueType")=="OTHER"
            page.locator("#frv34AiClassifications [data-frv34-reject]").click()
            assert page.evaluate("() => state.frvStudy.aiClassifications.length")==0

            # Duplicate cycle copies names but not fictitious measurements.
            page.locator('[data-frvs-repeat="0"]').click()
            assert page.evaluate("() => state.frvStudy.cycles[1].observations[0].durationSec") is None
            page.locator('#frvStudyCycles [data-frvs-phase="0"]').select_option("baseline")
            page.locator('#frvStudyCycles [data-frvs-phase="1"]').select_option("improved")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(1).fill("24.5")
            page.locator('summary:has-text("Сравнение «до / после»")').click()
            page.locator("#frv34CompareApproved").check()
            assert page.evaluate("() => state.frvStudy.comparisonApproved") is True
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(1).fill("22.25")
            assert page.evaluate("() => state.frvStudy.comparisonApproved") is False
            assert page.evaluate("() => frv34AnalyticsData().comparison.comparable") is False

            # Accidentally clicking delete must not lose a measured observation.
            page.locator('[data-frvs-rm="0:0"]').click()
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[0].durationSec")==32.75
            assert page.evaluate("() => state.frvStudy.cycles.length")==2
            delete_allowed[0]=True
            page.locator('[data-frvs-rmcycle="1"]').click()
            assert page.evaluate("() => state.frvStudy.cycles.length")==1

            # Failure to write a newly created study must leave active research
            # and the persisted current study identifier untouched.
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""",
              timeout=15000)
            page.evaluate("""() => {
              window.__frvPut=frv34StorePut;
              frv34StorePut=async()=>{throw Error('test IDB unavailable')};
            }""")
            page.locator("#frvStudyNewBtn").click()
            page.wait_for_function("""id => !frv34SwitchBusy &&
               state.frvStudy?.libraryId===id""",
               arg=first["id"],timeout=15000)
            assert page.evaluate("() => frv35SelectedStudyId")==first["id"]
            page.evaluate("() => {frv34StorePut=window.__frvPut}")
            assert page.locator("#frvs-operationId").input_value()=="FRV35_UNIQUE_ALPHA"

            page.locator("#frvStudyOpenBtn").click()
            page.screenshot(path=str(OUT/"stage35-frv-ux-audit.png"),full_page=True)
            assert not errors,errors
            print("PASS Stage35: independent active FRV after new SOP/reload, searchable archive,"
                  " stale AI blocked, cycle re-approval, safe delete and failed-new rollback",
                  flush=True)
        finally:
            browser.close()

def main():
    accepted_regression()
    full_frvs_ux_audit()

if __name__=="__main__":
    main()
