#!/usr/bin/env python3
"""Stage23: run existing functional regression and screenshot-specific review UI checks."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage23-a3-review-fixes.html"

def previous_functional_tests():
    spec=importlib.util.spec_from_file_location("stage23_previous", ROOT/"qa/stage22_browser_smoke.py")
    suite=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(suite)
    suite.RELEASE=RELEASE
    suite.main()

def validate_review_ui():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
                                  args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1365,"height":920})
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            result=page.evaluate(r"""() => {
              const assert=(ok,label)=>{if(!ok)throw new Error("Stage23 UI: "+label)};
              const step=createEmptyStep();
              step.action='Проверить электроинструмент';
              step.reason='Обеспечение безопасности';
              step.keyMoments=['Проверить шнур и корпус'];
              step.durationSeconds=55;
              step.successCriteria='Не обнаружено повреждений';
              state.documentManager={currentId:'test-sop',status:'Черновик',version:1};
              state.meta.operation='Осмотр электроинструмента';
              state.steps=[step];
              stateToHtml();
              const createIssue=(fix,field='time')=>({
                severity:'improvement',type:'unrealistic',stepId:1,field,
                description:'Время выполнения шага указано как 00:55, что кажется слишком коротким',
                why:'Длительная проверка может быть необходима для безопасности',
                suggestion:'Увеличить время выполнения шага до обоснованного значения',
                fixValue:fix,status:'open',thread:[]
              });
              const show=issue=>{
                reviewIssues=[issue];reviewSummary={summary:'',overall_quality:'good'};
                renderReviewResults(reviewSummary);
                const el=document.getElementById('sopReviewIssues');
                return {text:el.innerText,apply:el.querySelectorAll('[data-apply]').length,
                        dispute:el.querySelectorAll('[data-dispute]').length,
                        defer:el.querySelectorAll('[data-defer]').length};
              };
              const before=show(createIssue('null'));
              assert(before.text.includes('Время выполнения шага указано'),'warning is visible');
              assert(before.text.includes('Увеличить время'),'recommendation is visible');
              assert(!before.text.includes('Готовое исправление'),'null displayed as correction');
              assert(!before.text.includes('null'),'null literal displayed');
              assert(before.apply===0,'Apply button shown for null');
              assert(before.dispute===1&&before.defer===1,'other controls were lost');
              applyIssueFix(0);
              assert(step.durationSeconds===55&&reviewIssues[0].status==='open',
                     'null correction changed duration or review status');
              const normalized=validateReviewResponse({issues:[createIssue('null')]});
              assert(normalized.issues[0].fixValue===null,'AI JSON null-string not normalized');
              const plain=show(createIssue(null));
              assert(plain.apply===0,'JSON null enabled Apply');
              const invalid=show(createIssue('Увеличить длительность'));
              assert(invalid.apply===0,'narrative time advice enabled Apply');
              const malformed=show(createIssue('00:65'));
              assert(malformed.apply===0,'invalid 00:65 enabled Apply');
              const unsupported=show(createIssue('Изменить фото','photo'));
              assert(unsupported.apply===0,'unsupported field enabled Apply');
              const proper=show(createIssue('02:10'));
              assert(proper.apply===1,'valid precise duration has no Apply button');
              assert(proper.text.includes('Готовое исправление'),'valid correction hidden');
              document.querySelector('#sopReviewIssues [data-apply]').click();
              assert(step.durationSeconds===130&&reviewIssues[0].status==='applied',
                     'explicitly selected duration did not apply');
              state.documentManager.status='Опубликован';
              const locked=show(createIssue('03:10'));
              assert(locked.apply===0,'published document may be modified');
              // Rechecking with the same values should not create a false correction.
              state.documentManager.status='Черновик';
              const same=show(createIssue('02:10'));
              assert(same.apply===0,'unchanged duration still marked actionable');
              return {nullHidden:true,validation:true,buttons:true,durationSafe:true,
                      validApply:true,lock:true,previousFunctions:true};
            }""")
            assert all(result.values()),result
            assert not errors,errors
            print("PASS Stage23 Chrome file://: screenshot null hidden, time safe and working Apply",flush=True)
        finally:
            browser.close()

def main():
    previous_functional_tests()
    validate_review_ui()

if __name__=="__main__":
    main()
