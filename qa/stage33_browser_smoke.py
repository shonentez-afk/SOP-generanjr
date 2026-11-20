#!/usr/bin/env python3
"""Stage33 full Stage32.2 regression + independently started FRV->SOP acceptance."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage33-frv-research-to-sop-browser-candidate.html"

def old_excel_and_photo_regression():
    spec=importlib.util.spec_from_file_location("stage32_in_33",
        ROOT/"qa/stage32_excel_photo_cell_fit.py")
    old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
    # Historic Stage22 regression expected FRV AI suggestions to become real
    # measured cycles. Run that accepted suite against the frozen Stage32.2
    # baseline, then validate the Stage33 photo export with new semantics.
    old.inherited_regression()
    old.RELEASE=RELEASE
    old.SAMPLE=ROOT/"artifacts/stage33-stage32-photo-regression.xlsx"
    old.photo_cell_acceptance()

def frv_research_to_new_sop():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1500,"height":1000})
        errors=[]
        page.on("pageerror",lambda err: errors.append(str(err)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.route("https://**",lambda r:r.abort())
        page.route("http://**",lambda r:r.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            assert page.evaluate("() => state.steps.length") == 0
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvs-processDescription").fill(
                "Осмотреть электрооборудование, выполнить подготовку и контроль")
            page.locator("#frvs-operationId").fill("Проверка электропитания")
            page.locator("#frvs-workplace").fill("Участок А")
            rows=page.locator('#frvStudyCycles [data-fs="actionRaw"]')
            assert rows.count()==1
            rows.nth(0).fill("Осмотреть питание")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(0).fill("28.5")
            page.locator('#frvStudyCycles [data-fs="valueType"]').nth(0).select_option("VA")
            page.locator("#frvStudyAddRowBtn").click()
            page.locator('#frvStudyCycles [data-fs="actionRaw"]').nth(1).fill("Ожидать материалы")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(1).fill("14")
            page.locator('#frvStudyCycles [data-fs="valueType"]').nth(1).select_option("WAIT")
            assert not page.locator('#frvStudyCycles [data-fs="standardCandidate"]').nth(1).is_checked()
            page.locator("#frvStudyAddRowBtn").click()
            page.locator('#frvStudyCycles [data-fs="actionRaw"]').nth(2).fill("Проверить работу")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(2).fill("23")
            page.locator('#frvStudyCycles [data-fs="valueType"]').nth(2).select_option("VA")
            result=page.evaluate("""() => {
              const x=frvStudyInsights();
              return {steps:state.steps.length,total:x.total,va:x.by.VA,
                wait:x.by.WAIT,complete:x.completeCycles};
            }""")
            assert result=={"steps":0,"total":65.5,"va":51.5,"wait":14,"complete":1},result
            page.locator("#frvStudyValidateBtn").click()
            assert not page.locator("#frvStudyValidation").inner_text().startswith("Исправьте")
            page.locator("#frvStudyMakeSokBtn").click()
            draft=page.evaluate("""() => state.frvStudy.standardCandidate.steps.map(x=>({
                title:x.action,observed:x.observedTimeSec,planned:x.plannedTimeSec
            }))""")
            assert draft==[
                {"title":"Осмотреть питание","observed":28.5,"planned":28.5},
                {"title":"Проверить работу","observed":23,"planned":23}],draft
            # Manually edit proposed time; measured value must remain untouched.
            page.locator('[data-frvs-step="plannedTimeSec"]').nth(0).fill("27")
            assert page.evaluate("""() => state.frvStudy.cycles[0].observations[0].durationSec""")==28.5
            # Introduce an already open SOP, including a reserved image record.
            page.evaluate("""async () => {
              const old=createEmptyStep();old.action='НЕ СТИРАТЬ СТАРЫЙ СОП';
              old.durationSeconds=60;old.keyMoments=['Исходный пункт'];
              const c=document.createElement('canvas');c.width=80;c.height=50;
              c.getContext('2d').fillRect(0,0,80,50);
              const photo=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
              if(!photo||!(await idbPutPhoto(old.id,photo,'png')))throw new Error('Photo backup fixture failed');
              old.hasPhoto=true;old.imageExt='png';
              old.imageData=c.toDataURL('image/png');
              old.imageBuffer=await photo.arrayBuffer();
              state.steps=[old];
              state.meta.operation='Существующий СОП';
              state.documentManager.status='Черновик';
              stateChanged();stateToHtml();window.__oldId=old.id;
            }""")
            page.locator("#frvStudySendSopBtn").click()
            page.wait_for_selector("#frvSafeSopTransferPreview",timeout=8000)
            page.locator('#frvSafeSopTransferPreview [data-ai-preview-action="cancel"]').click()
            assert page.evaluate("() => state.steps[0].action")=="НЕ СТИРАТЬ СТАРЫЙ СОП"
            page.locator("#frvStudySendSopBtn").click()
            page.locator('#frvSafeSopTransferPreview [data-ai-preview-action="create"]').click()
            page.wait_for_function("""() => state.steps.length===2 &&
              state.steps[0].action==='Осмотреть питание'""",timeout=8000)
            transfer=page.evaluate("""() => ({
              project:state.meta.operation,count:state.steps.length,
              duration:state.steps[0].durationSeconds,
              measured:state.steps[0].frvSource.observedTimeSec,
              planned:state.steps[0].frvSource.projectTimeSec,
              source:state.steps[0].frvSource.observationIds.length,
              unaltered:state.frvStudy.cycles[0].observations[0].durationSec,
              backup:frvStudyHasBackup(),
              twi:state.twi.enabled
            })""")
            assert transfer=={"project":"Проверка электропитания","count":2,
                "duration":27,"measured":28.5,"planned":27,
                "source":1,"unaltered":28.5,"backup":True,"twi":False},transfer
            persisted=page.evaluate("""() => collectDraft().steps[0].frvSource""")
            assert persisted["observedTimeSec"]==28.5 and persisted["projectTimeSec"]==27
            assert len(persisted["observationIds"])==1
            # Return to previous SOP and verify source draft is retained.
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvStudyRestoreBtn").click()
            page.wait_for_selector("#frvRestoreSopPreview",timeout=8000)
            page.locator('#frvRestoreSopPreview [data-ai-preview-action="restore"]').click()
            page.wait_for_function("""() => state.steps.length===1 &&
              state.steps[0].action==='НЕ СТИРАТЬ СТАРЫЙ СОП'""",timeout=15000)
            assert page.evaluate("() => state.meta.operation")=="Существующий СОП"
            page.wait_for_function("() => !!state.steps[0].imageData && !!state.steps[0].hasPhoto",timeout=15000)
            assert page.evaluate("() => state.steps[0].id===window.__oldId")
            assert page.evaluate("async () => !!(await idbGetPhoto(state.steps[0].id))?.blob")
            assert page.evaluate("() => state.frvStudy.cycles[0].observations.length")==3
            # New AI suggestions never become measured cycles by themselves.
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify({sequence:[{
                actionRaw:'Проверить наличие инструкции',
                actionNormalized:'Проверить инструкцию',durationSec:999
              }]});
              aiGuardCanApply=()=>true;
            }""")
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvStudyBuildBtn").click()
            page.wait_for_function("""() => state.frvStudy.suggestedActions.length===1""",timeout=9000)
            assert page.evaluate("""() => state.frvStudy.cycles.length""")==1
            page.locator("#frvs-acceptSuggestions").click()
            check=page.evaluate("""() => ({
              cycleCount:state.frvStudy.cycles.length,
              count:state.frvStudy.cycles[0].observations.length,
              last:state.frvStudy.cycles[0].observations.at(-1),
              exported:frvStudyExport().cycles[0].observations.at(-1).durationSec
            })""")
            assert check["cycleCount"]==1
            assert check["count"]==4
            assert check["last"]["source"]=="AI-draft"
            assert check["last"]["durationSec"] is None
            assert check["exported"] is None
            assert not errors,errors
            print("PASS Stage33: independent FRV, 3 measured actions, 2 SOP steps, safe cancel/restore, AI drafts unmeasured",flush=True)
        finally:
            browser.close()

def main():
    old_excel_and_photo_regression()
    frv_research_to_new_sop()

if __name__=="__main__":main()
