#!/usr/bin/env python3
"""Stage21 Chrome file:// acceptance: drafts, library, review discussions and regression."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage21-review-history.html"

def previous_regressions():
    file=ROOT/"qa/stage20_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage21_old_browser",file)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def test_review_history():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
                                  args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1365,"height":920})
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            first=page.evaluate("""() => {
              const step=createEmptyStep();step.action='Установить ограждение';
              step.reason='Предотвратить доступ';step.keyMoments=['Проверить замок'];
              state.steps=[step];
              reviewIssues=[{
                severity:'warning',type:'incomplete',stepId:1,field:'reason',
                description:'Уточнить причину',why:'Причина',
                suggestion:'Опишите риск',fixValue:'Уточнено',status:'withdrawn',
                thread:[{role:'user',text:'Риск уже описан'},
                        {role:'mentor',text:'Замечание снято'}]
              }];
              reviewSummary={summary:'Проверка выполнена',overall_quality:'good'};
              deferredIssueKeys=new Set(['legacy-example']);
              renderReviewResults(reviewSummary);saveDraft();
              const local=JSON.parse(localStorage.getItem(DRAFT_KEY));
              window.__stage21Draft=local;
              return {issues:local.reviewState.issues.length,
                messages:local.reviewState.issues[0].thread.length,
                verdict:local.reviewState.issues[0].status,
                deferred:local.reviewState.deferredIssueKeys.length};
            }""")
            assert first=={"issues":1,"messages":2,"verdict":"withdrawn","deferred":1},first
            result=page.evaluate("""async () => {
              reviewIssues=[];reviewSummary=null;deferredIssueKeys=new Set();
              await applyDraft(window.__stage21Draft);
              const draftOk=reviewIssues.length===1&&reviewIssues[0].thread.length===2&&
                reviewIssues[0].status==='withdrawn'&&
                !document.querySelector('#sopReviewContainer').classList.contains('hidden');
              const saved={
                id:'stage21-review-test',status:'Черновик',version:1,
                snapshot:docSnapshot(),title:'Учебный СОП',number:'Черновик'
              };
              await docDbPut(saved);
              docLoadToState(await docDbGet(saved.id));
              const libraryOk=reviewIssues.length===1&&
                reviewIssues[0].thread[1].text==='Замечание снято';
              docLoadToState({id:'stage21-other-doc',status:'Черновик',version:1,
                snapshot:{steps:[],meta:{operation:'Другой СОП'}}});
              const isolated=reviewIssues.length===0&&reviewSummary===null&&
                deferredIssueKeys.size===0&&
                document.querySelector('#sopReviewContainer').classList.contains('hidden');
              docLoadToState(saved);
              await docNew();
              const newDocumentClean=reviewIssues.length===0&&reviewSummary===null;
              return {draftOk,libraryOk,isolated,newDocumentClean};
            }""")
            assert all(result.values()),result
            assert not errors,errors
            print("PASS: Chrome file:// review threads survive drafts/library; new documents isolated",flush=True)
        finally:
            browser.close()

def main():
    previous_regressions()
    test_review_history()

if __name__=="__main__":
    main()
