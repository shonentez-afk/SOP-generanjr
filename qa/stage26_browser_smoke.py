#!/usr/bin/env python3
"""Stage26 Chrome file://: accepted Stage25 regression plus FRV row/analysis consent."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage26-final-browser-candidate.html"

def previous_regression():
    spec=importlib.util.spec_from_file_location(
        "stage26_old",ROOT/"qa/stage25_browser_smoke.py")
    suite=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(suite)
    suite.RELEASE=RELEASE
    suite.main()

def check_frv_safe_proposals():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1450,"height":940})
        errors=[]
        page.on("pageerror",lambda err:errors.append(str(err)))
        page.on("dialog",lambda d:d.accept())
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            first=page.evaluate(r"""() => {
              const s=createEmptyStep();
              s.action='Осмотреть защитное ограждение';
              s.keyMoments=['Проверить замок'];
              s.reason='Безопасность оператора';
              s.durationSeconds=55;
              state.steps=[s];
              state.meta.operation='Осмотр ограждения';
              state.description='Проверка перед запуском';
              state.documentManager={currentId:'stage26-frv',status:'Черновик',version:1};
              state.frvStudy=null;
              const d=ensureFrvStudy();
              const o={...frvStudyEmptyObservation(1),actionRaw:'Фактически проверить замок',
                actionNormalized:'Ручная проверка',reason:'Ручное обоснование',
                valueType:'OTHER',activityMode:'Manual',durationSec:43,
                evidenceId:'evidence-1',comment:'Записано наблюдателем'};
              d.cycles=[{...frvStudyEmptyCycle(1),observations:[o]}];
              d.analysis={summary:'Ранее сохранённый анализ'};
              d.analysisNeedsReview=true;
              renderFrvStudy();
              window.__frvRow=o;
              window.__frvRowAnswer={
                actionNormalized:'Проверить исправность замка',
                valueType:'VA',activityMode:'Walk',
                reason:'Предлагаемая причина ИИ',
                keyMoment:'Не допустить открытого ограждения',
                qualityKey:'Визуально проверить замок',
                durationSec:900,actionRaw:'Не допускается менять',
                evidenceId:'fake',standardCandidate:true
              };
              window.__frvAnalysisAnswer={
                summary:'Новый анализ фактического наблюдения',
                standardCandidates:[{
                  observationId:o.id,action:'Подтвердить закрытый замок',
                  keyMoment:'Зафиксировать закрытие',
                  reason:'Новая рекомендация по предотвращению запуска',
                  quality:'Качество фиксации',safety:'Нет доступа к движущимся частям',
                  tool:'Визуальный осмотр',standardTimeSec:9999
                }],
                losses:[{observationId:o.id,lossCode:'waiting',cause:'Ожидание',
                  countermeasure:'Проверить доступность',expectedReductionSec:null}],
                risks:['Требуется повторный реальный замер']
              };
              return {same:d.cycles[0].observations[0]===o,
                originalDuration:o.durationSec===43,source:o.actionRaw};
            }""")
            assert first["same"] and first["originalDuration"],first

            def invoke(cmd,selector):
                page.evaluate(cmd)
                page.wait_for_selector(selector,timeout=8000)

            def settle(name):
                page.evaluate(f"""() => Promise.race([
                  window.__{name}Pending,
                  new Promise((_,reject)=>setTimeout(()=>reject(new Error(
                    '{name} preview did not complete')),7000))
                ])""")

            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvRowAnswer);
              window.__rowPending=frvStudySuggestRow(0,0);
            }""","#frvRowSuggestionPreview")
            assert page.locator("#frvRowSuggestionPreview [data-ai-preview-action=\"fill\"]").count()==1
            page.locator('#frvRowSuggestionPreview [data-ai-preview-action="cancel"]').click()
            settle("row")
            assert page.evaluate("""() => window.__frvRow.reason==='Ручное обоснование'
              &&window.__frvRow.durationSec===43&&window.__frvRow.qualityKey===''""")

            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvRowAnswer);
              window.__rowPending=frvStudySuggestRow(0,0);
            }""","#frvRowSuggestionPreview")
            page.locator('#frvRowSuggestionPreview [data-ai-preview-action="fill"]').click()
            settle("row")
            filled=page.evaluate("""() => ({
              raw:window.__frvRow.actionRaw==='Фактически проверить замок',
              time:window.__frvRow.durationSec===43,
              evidence:window.__frvRow.evidenceId==='evidence-1',
              reason:window.__frvRow.reason==='Ручное обоснование',
              normalized:window.__frvRow.actionNormalized==='Ручная проверка',
              quality:window.__frvRow.qualityKey==='Визуально проверить замок',
              key:window.__frvRow.keyMoment==='Не допустить открытого ограждения'
            })""")
            assert all(filled.values()),filled

            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvRowAnswer);
              window.__rowPending=frvStudySuggestRow(0,0);
            }""","#frvRowSuggestionPreview")
            page.locator('#frvRowSuggestionPreview [data-ai-preview-action="replace"]').click()
            settle("row")
            replaced=page.evaluate("""() => ({
              reason:window.__frvRow.reason==='Предлагаемая причина ИИ',
              normalized:window.__frvRow.actionNormalized==='Проверить исправность замка',
              time:window.__frvRow.durationSec===43,
              raw:window.__frvRow.actionRaw==='Фактически проверить замок',
              comment:window.__frvRow.comment==='Записано наблюдателем'
            })""")
            assert all(replaced.values()),replaced

            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvAnalysisAnswer);
              window.__analysisPending=frvStudyAnalyze();
            }""","#frvAnalysisPreview")
            page.locator('#frvAnalysisPreview [data-ai-preview-action="cancel"]').click()
            settle("analysis")
            cancelled=page.evaluate("""() => ({
              summary:state.frvStudy.analysis.summary==='Ранее сохранённый анализ',
              raw:window.__frvRow.actionRaw==='Фактически проверить замок',
              time:window.__frvRow.durationSec===43
            })""")
            assert all(cancelled.values()),cancelled

            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvAnalysisAnswer);
              window.__analysisPending=frvStudyAnalyze();
            }""","#frvAnalysisPreview")
            page.locator('#frvAnalysisPreview [data-ai-preview-action="store"]').click()
            settle("analysis")
            stored=page.evaluate("""() => ({
              summary:state.frvStudy.analysis.summary==='Новый анализ фактического наблюдения',
              time:window.__frvRow.durationSec===43,
              manualReason:window.__frvRow.reason==='Предлагаемая причина ИИ',
              candidate:state.frvStudy.analysis.standardCandidates[0].standardTimeSec===null
            })""")
            assert all(stored.values()),stored

            # Analysis may fill blanks, but must not replace already-authored details.
            page.evaluate("""() => {
              window.__frvRow.keyMoment='';
              window.__frvRow.tool='';
              renderFrvStudy();
            }""")
            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvAnalysisAnswer);
              window.__analysisPending=frvStudyAnalyze();
            }""","#frvAnalysisPreview")
            page.locator('#frvAnalysisPreview [data-ai-preview-action="fill"]').click()
            settle("analysis")
            filled_analysis=page.evaluate("""() => ({
              key:window.__frvRow.keyMoment==='Зафиксировать закрытие',
              tool:window.__frvRow.tool==='Визуальный осмотр',
              reason:window.__frvRow.reason==='Предлагаемая причина ИИ',
              time:window.__frvRow.durationSec===43,
              raw:window.__frvRow.actionRaw==='Фактически проверить замок'
            })""")
            assert all(filled_analysis.values()),filled_analysis

            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvAnalysisAnswer);
              window.__analysisPending=frvStudyAnalyze();
            }""","#frvAnalysisPreview")
            page.locator('#frvAnalysisPreview [data-ai-preview-action="replace"]').click()
            settle("analysis")
            final=page.evaluate("""() => ({
              reason:window.__frvRow.reason==='Новая рекомендация по предотвращению запуска',
              normalized:window.__frvRow.actionNormalized==='Подтвердить закрытый замок',
              raw:window.__frvRow.actionRaw==='Фактически проверить замок',
              time:window.__frvRow.durationSec===43,
              evidence:window.__frvRow.evidenceId==='evidence-1'
            })""")
            assert all(final.values()),final

            previous_analysis=page.evaluate("() => JSON.stringify(state.frvStudy.analysis)")
            invoke("""() => {
              aiAsk=async()=>JSON.stringify(window.__frvAnalysisAnswer);
              window.__analysisPending=frvStudyAnalyze();
            }""","#frvAnalysisPreview")
            page.evaluate("""() => {
              window.__frvRow.comment='Изменено человеком во время предпросмотра';
            }""")
            page.locator('#frvAnalysisPreview [data-ai-preview-action="replace"]').click()
            settle("analysis")
            assert page.evaluate("() => JSON.stringify(state.frvStudy.analysis)")==previous_analysis

            assert not errors,errors
            print("PASS Stage26 Chrome file:// FRV: cancel, fill, replace, analysis-only, stale-guard and no RAW/time/evidence changes",flush=True)
        finally:
            browser.close()

def main():
    print("CHECK Stage26: complete Stage25 browser regression",flush=True)
    previous_regression()
    print("CHECK Stage26: FRV proposal acceptance",flush=True)
    check_frv_safe_proposals()

if __name__=="__main__":
    main()
