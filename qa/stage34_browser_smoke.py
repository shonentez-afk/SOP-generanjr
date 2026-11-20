#!/usr/bin/env python3
"""Stage34: Linux/Windows offline Chrome with three independent FRV studies,
transactional autosave, JSON restore, actual three-sheet XLSX, and Stage33 chain."""
from __future__ import annotations
import importlib.util
import json
import hashlib
from pathlib import Path
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage34-frv-study-library-analysis-browser-candidate.html"
OUT=ROOT/"artifacts"

def regression_stage33_and_excel_photos():
    sp=importlib.util.spec_from_file_location("stage33_reg",ROOT/"qa/stage33_browser_smoke.py")
    mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.old_excel_and_photo_regression()
    mod.frv_research_to_new_sop()

def stage34_library_and_reports():
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        context=browser.new_context(viewport={"width":1500,"height":1100},accept_downloads=True)
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("dialog",lambda d:d.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvStudyNewBtn").click()
            page.locator("#frvs-operationId").fill("Проверка приводного агрегата")
            page.locator("#frvs-workplace").fill("Линия 7")
            page.locator("#frvStudyCycles [data-fs='actionRaw']").nth(0).fill("Проверить подшипник")
            page.locator("#frvStudyCycles [data-fs='durationSec']").nth(0).fill("40")
            page.locator("#frvStudyCycles [data-fs='valueType']").nth(0).select_option("VA")
            page.locator("#frvStudyAddRowBtn").click()
            page.locator("#frvStudyCycles [data-fs='actionRaw']").nth(1).fill("Поиск инструмента")
            page.locator("#frvStudyCycles [data-fs='durationSec']").nth(1).fill("20")
            page.locator("#frvStudyCycles [data-fs='valueType']").nth(1).select_option("NVA_Waste")
            page.locator("#frvStudyAddRowBtn").click()
            page.locator("#frvStudyCycles [data-fs='actionRaw']").nth(2).fill("Ожидание материала")
            page.locator("#frvStudyCycles [data-fs='durationSec']").nth(2).fill("10")
            page.locator("#frvStudyCycles [data-fs='valueType']").nth(2).select_option("WAIT")
            page.locator('#frvStudyCycles [data-frvs-phase="0"]').select_option("baseline")
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""",timeout=15000)
            study_id=page.evaluate("() => state.frvStudy.libraryId")
            assert study_id
            pre=page.evaluate("""async () => ({
              live:state.frvStudy.cycles[0].observations.map(o=>({
                action:o.actionRaw,duration:o.durationSec,type:o.valueType})),
              saved:(await frv34StoreGet(state.frvStudy.libraryId))?.payload.cycles[0].observations.map(o=>({
                action:o.actionRaw,duration:o.durationSec,type:o.valueType}))
            })""")
            print("STAGE34_PRE_RELOAD",pre,flush=True)
            assert pre["live"]==pre["saved"],("Autosave not an exact observation snapshot",pre)
            page.reload(wait_until="domcontentloaded")
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvStudyOpenBtn").click()
            page.wait_for_selector("#frvStudyLibraryItems [data-frv-open]",timeout=12000)
            page.locator('#frvStudyLibraryItems [data-frv-open]').first.click()
            page.wait_for_function("(id) => state.frvStudy?.libraryId === id",arg=study_id,timeout=15000)
            stored=page.evaluate("""() => ({
              id:state.frvStudy.libraryId,name:state.frvStudy.operationId,
              rows:state.frvStudy.cycles[0].observations.length,
              total:frv34AnalyticsData().total
            })""")
            if stored["total"]!=70:
                print("STAGE34_POST_RELOAD",page.evaluate("""() =>
                  state.frvStudy.cycles[0].observations.map(o=>({
                    action:o.actionRaw,duration:o.durationSec,type:o.valueType}))"""),flush=True)
            assert stored=={"id":study_id,"name":"Проверка приводного агрегата",
              "rows":3,"total":70},stored
            # Repeat the sequence without manufacturing fresh measured seconds.
            page.locator('[data-frvs-repeat="0"]').click()
            assert page.evaluate("""() => state.frvStudy.cycles[1].observations.every(
               x=>x.durationSec===null)""")
            page.locator('#frvStudyCycles [data-frvs-phase="1"]').select_option("improved")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(3).fill("32")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(4).fill("8")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(5).fill("5")
            result=page.evaluate("""() => {
              const x=frv34AnalyticsData();
              return {total:x.total,loss:x.lossSec,
                missing:x.missing,pareto:x.pareto.map(p=>p.durationSec),
                comparable:x.comparison.comparable,
                baseline:x.comparison.baselineSec,after:x.comparison.improvedSec};
            }""")
            assert result=={"total":115,"loss":43,"missing":0,"pareto":[28,15],
              "comparable":False,"baseline":70,"after":45},result
            page.locator('summary:has-text("Сравнение «до / после»")').click()
            page.locator("#frv34CompareApproved").check()
            assert page.evaluate("() => frv34AnalyticsData().comparison.deltaSec")==25
            assert page.evaluate("() => frv34AnalyticsData().comparison.deltaPct")>35
            # AI proposes metadata only; every suggestion requires human action.
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify({classifications:[
                {observationId:state.frvStudy.cycles[0].observations[1].id,
                 valueType:'NVA_Waste',lossCode:'search_tool',
                 reason:'Вероятен поиск инструмента',confidence:'medium'}]});
              aiGuardCanApply=()=>true;
            }""")
            before=page.evaluate("() => state.frvStudy.cycles[0].observations[1].durationSec")
            page.locator("#frvStudyClassifyBtn").click()
            page.wait_for_selector("#frv34AiClassifications [data-frv34-classify]",timeout=10000)
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[1].durationSec")==before
            page.locator("#frv34AiClassifications [data-frv34-classify]").first.click()
            assert page.evaluate("() => state.frvStudy.cycles[0].observations[1].lossCode")=="search_tool"
            # Exact backup roundtrip; do not overwrite another study.
            page.locator('summary:has-text("Резервная копия JSON")').click()
            with page.expect_download() as d:
                page.locator("#frvStudyDownloadBtn").click()
            json_path=OUT/"stage34-frv-study-backup.json"
            d.value.save_as(str(json_path))
            backup=json.loads(json_path.read_text(encoding="utf-8"))
            assert backup["schemaVersion"]=="FRV-1.3"
            assert len(backup["cycles"])==2
            assert backup["cycles"][0]["observations"][0]["durationSec"]==40
            with page.expect_download(timeout=60000) as d:
                page.locator("#frvStudyExportXlsxBtn").click()
            xlsx=OUT/"stage34-frv-study-report.xlsx"
            d.value.save_as(str(xlsx))
            wb=load_workbook(xlsx)
            assert wb.sheetnames==["Наблюдения","Анализ","Улучшения"],wb.sheetnames
            ws=wb["Наблюдения"]
            values=[ws.cell(row=r,column=5).value for r in range(6,12)]
            assert values==[40,20,10,32,8,5],values
            assert wb["Анализ"]["B6"].value==115,wb["Анализ"]["B6"].value
            assert "Проверка приводного агрегата" in ws["A2"].value
            # The current study stays intact when a new study is opened.
            page.locator("#frvStudyNewBtn").click()
            page.locator("#frvs-operationId").fill("Независимый замер B")
            page.locator('#frvStudyCycles [data-fs="actionRaw"]').nth(0).fill("Действие B")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').nth(0).fill("15")
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""",timeout=15000)
            second=page.evaluate("() => state.frvStudy.libraryId")
            assert second!=study_id
            page.locator("#frvStudyRestoreJsonInput").set_input_files(str(json_path))
            page.wait_for_function("""() => state.frvStudy.cycles.length===2 &&
              state.frvStudy.operationId==='Проверка приводного агрегата'""",timeout=15000)
            restored=page.evaluate("""() => ({
              id:state.frvStudy.libraryId,source:state.frvStudy.restoredFrom,
              durations:state.frvStudy.cycles.flatMap(c=>c.observations.map(o=>o.durationSec))
            })""")
            assert restored["id"] not in (second,study_id),restored
            assert restored["durations"]==[40,20,10,32,8,5]
            page.locator("#frvStudyOpenBtn").click()
            page.wait_for_function("""() =>
              document.querySelectorAll('#frvStudyLibraryItems [data-frv-open]').length>=3
            """,timeout=15000)
            assert page.locator("#frvStudyLibraryItems [data-frv-open]").count()>=3
            # Storage failure must be reported, while external Excel remains possible.
            page.evaluate("""() => {
              window.__originalPut=frv34StorePut;
              frv34StorePut=async()=>{throw new Error('simulated quota failure')};
            }""")
            page.locator("#frvs-workplace").fill("НЕ СОХРАНЕНО")
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='error'""",timeout=15000)
            page.evaluate("() => {frv34StorePut=window.__originalPut}")
            assert not errors,errors
            print("PASS Stage34: IDB 3 studies, reload, repeated cycles, Pareto, AI approval, XLSX/JSON recovery, explicit storage error",flush=True)
        finally:
            browser.close()

def stage34_sop_excel_with_unrelated_research():
    """Original user issue: independent FRV study, new SOP, step6 M1+M2 error."""
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        context=browser.new_context(viewport={"width":1550,"height":1100},accept_downloads=True)
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.locator('[data-tab="frvstudy"]').click()
            page.locator("#frvStudyNewBtn").click()
            page.locator("#frvs-operationId").fill("Исследование ФРВ для первой работы")
            page.locator('#frvStudyCycles [data-fs="actionRaw"]').first.fill("Реальное наблюдение")
            page.locator('#frvStudyCycles [data-fs="durationSec"]').first.fill("18.5")
            page.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'
            """,timeout=15000)
            research_id=page.evaluate("() => state.frvStudy.libraryId")
            page.locator('[data-tab="editor"]').click()
            page.evaluate("async () => {await docNew()}")
            # Another SOP is separate. Introduce stale split like user's Step 6.
            page.evaluate("""() => {
              state.steps=Array.from({length:6},(_,i)=>{
                const step=createEmptyStep();
                step.action='Действие другого СОП '+(i+1);
                step.durationSeconds=30;
                if(i===5)step.frv={vdc:false,m1:50,m2:15,move:'',comment:'Старое распределение'};
                return step;
              });
              state.meta.operation='Другой независимый СОП';
              stateChanged();
              window.__step6Before=JSON.stringify(state.steps[5]);
            }""")
            assert page.evaluate("() => computeFrv().errors.some(x=>x.startsWith('Шаг 6:'))")
            # Cancel must not change data, nor download anything.
            page.locator("#generateBtn").click()
            page.wait_for_selector("#sopFrvExportValidationPreview",timeout=15000)
            assert "Шаг 6" in page.locator("#sopFrvExportValidationPreview").inner_text()
            page.locator('#sopFrvExportValidationPreview [data-ai-preview-action="cancel"]').click()
            assert page.evaluate("() => JSON.stringify(state.steps[5])===window.__step6Before")
            # Direct repair route must select the ordinary SOP FRV, never the independent study.
            page.locator("#generateBtn").click()
            page.wait_for_selector("#sopFrvExportValidationPreview",timeout=15000)
            page.locator('#sopFrvExportValidationPreview [data-ai-preview-action="edit"]').click()
            assert page.locator('#tab-frv').is_visible()
            assert page.locator('#frvRowsContainer [data-frv="m1"]').count()==6
            assert page.evaluate("() => JSON.stringify(state.steps[5])===window.__step6Before")
            # Export with human-acknowledged exclusion: SOP survives, source unchanged.
            page.locator('[data-tab="editor"]').click()
            with page.expect_download(timeout=120000) as dl:
                page.locator("#generateBtn").click()
                page.locator('#sopFrvExportValidationPreview [data-ai-preview-action="export"]').click()
            file_path=OUT/"stage34-sop-with-unverified-frv.xlsx"
            dl.value.save_as(str(file_path))
            workbook=load_workbook(file_path)
            assert workbook.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"],workbook.sheetnames
            frv=workbook["ФРВ"]
            assert frv["E18"].value==0 and frv["F18"].value==0
            assert "ФРВ не подтверждена" in str(frv["G18"].value)
            assert "ФРВ не подтверждена" in str(frv["J18"].value)
            # Safe export should preserve other valid classifications.
            assert frv["C18"].value is not None
            unchanged=page.evaluate("""async (id) => ({
              same:JSON.stringify(state.steps[5])===window.__step6Before,
              independent:(await frv34StoreGet(id))?.payload.cycles[0].observations[0].durationSec
            })""",research_id)
            assert unchanged=={"same":True,"independent":18.5},unchanged
            assert not errors,errors
            print("PASS Stage34.1: unrelated FRV study kept, Step6 mismatch modal cancel/edit/acknowledged XLSX and original values intact",flush=True)
        finally:
            browser.close()

def main():
    regression_stage33_and_excel_photos()
    stage34_library_and_reports()
    stage34_sop_excel_with_unrelated_research()

if __name__=="__main__":main()
