#!/usr/bin/env python3
"""Stage40 real Chrome file://: inline full-check diff and stale/nonmodal safety."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage40-inline-review-browser-candidate.html"


def main():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
                                   args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1220,"height":780})
            page.on("pageerror",lambda error:errors.append(str(error)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            result=page.evaluate("""() => {
              const s=createEmptyStep();
              s.action='Осмотреть электроинструмент';
              s.keyMoments=['Проверить корпус на видимые повреждения'];
              s.reason='Позволяет выявить повреждения до использования.';
              s.durationSeconds=65;
              s.successCriteria='Инструмент осмотрен';
              s.frvSource={studyId:'real-measurement',observedTimeSec:17.5};
              state.meta.operation='Осмотр электроинструмента';
              state.meta.safety='Применять средства защиты';
              state.description='Осмотреть инструмент перед использованием, '
                +'проверить кабель, корпус и вилку на видимые повреждения.';
              state.steps=[s];
              stateToHtml();renderSteps();
              const make=(field,value,scope)=>({
                stepId:scope==='meta'?null:1,field,
                description:'Уточнить поле '+field,
                severity:'improvement',status:'open',type:'improvement',
                suggestion:'Уточнить по фактам СОП',fixValue:value,
                thread:[],evidenceKind:'observed',evidenceVerified:true,
                evidence:'Осмотреть инструмент',
                evidenceSource:'Шаг 1',evidenceNote:''
              });
              reviewIssues=[
                make('action','Осмотреть электроинструмент перед использованием'),
                make('reason','Позволяет выявить видимые повреждения до использования.'),
                make('keyMoments','Проверить кабель на видимые повреждения'),
                make('time','01:15'),
                make('safety','Применять средства защиты перед осмотром','meta')
              ];
              stage28ReviewMeta=stage28NormalizeMeta({
                documentId:state.documentManager?.currentId??null,
                contextSignature:stage28DocumentSignature(state),
                stepSignatures:state.steps.map(stage28StepSignature),
                aiComplete:true,lastMode:'full',checkedAt:Date.now(),reviewedSteps:1
              });
              reviewSummary={overall_quality:'needs_improvement',summary:'Есть уточнения'};
              const valid=reviewIssues.map(x=>!!reviewGetApplicableFix(x));
              renderReviewResults(reviewSummary);
              return {valid,id:s.id,action:s.action,reason:s.reason};
            }""")
            assert all(result["valid"]),result
            assert "Stage40" in page.locator("#sopVersionLabel").inner_text()
            assert page.locator("#stage27Actions").count()<=1
            assert page.locator('#stage391ReasonAIReview').count()==0
            assert page.locator('#stage391CleanupOverlay').count()==0
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert page.locator('[data-stage40-compare]').count()==5
            assert page.locator('#sopReviewIssues button[data-apply]').count()==5
            assert page.locator('[data-stage40-compare="0"]').count()==1
            old=page.locator('[data-stage40-compare="0"]').inner_text()
            assert "Сейчас" in old and "После применения" in old,old
            assert result["action"] in old
            assert "Осмотреть электроинструмент перед использованием" in old
            assert "Готовое исправление:" not in page.locator("#sopReviewIssues").inner_text()

            # Numbering, newlines and Key Point append are shown accurately.
            km=page.locator('[data-stage40-compare="2"]').inner_text()
            assert "1. Проверить корпус" in km and "2. Проверить кабель" in km,km
            tm=page.locator('[data-stage40-compare="3"]').inner_text()
            assert "65 сек" in tm and "75 сек" in tm,tm
            meta=page.locator('[data-stage40-compare="4"]').inner_text()
            assert "Применять средства защиты" in meta,meta

            # Rendering twice does not duplicate compare cards or toolbars.
            page.evaluate("() => renderReviewResults(reviewSummary)")
            assert page.locator('[data-stage40-compare]').count()==5
            assert page.locator('#stage27Actions').count()<=1

            # A manual edit after the check invalidates the ready fix.
            page.evaluate("""() => {
              state.steps[0].action='Изменено инженером вручную';
              renderSteps();renderReviewResults(reviewSummary);
            }""")
            assert page.locator('[data-apply="0"]').is_disabled()
            assert "повторите проверку" in page.locator(
                '[data-stage40-compare="0"]').inner_text().lower()
            page.evaluate("() => applyIssueFix(0)")
            assert page.evaluate(
                "() => state.steps[0].action")=="Изменено инженером вручную"

            # Undo the manual edit; the original reviewed field is still valid.
            page.evaluate("""() => {
              state.steps[0].action='Осмотреть электроинструмент';
              renderSteps();renderReviewResults(reviewSummary);
            }""")
            assert page.locator('[data-apply="0"]').is_enabled()
            page.locator('[data-apply="0"]').click()
            assert page.evaluate(
                "() => state.steps[0].action")=="Осмотреть электроинструмент перед использованием"
            # Unchanged Reason and Key Points can be applied independently.
            assert page.locator('[data-apply="1"]').count()==1
            page.locator('[data-apply="1"]').click()
            assert page.evaluate("() => state.steps[0].reason")==(
                "Позволяет выявить видимые повреждения до использования.")
            page.locator('[data-apply="2"]').click()
            assert page.evaluate("() => state.steps[0].keyMoments.length")==2
            assert page.evaluate(
                "() => state.steps[0].frvSource.observedTimeSec")==17.5

            # Editable metadata changed through the existing field should
            # block an old recommendation rather than overwrite the edit.
            page.locator('#meta-safety').fill("Уточнено инженером в поле безопасности")
            assert page.evaluate(
                "() => document.querySelector('#meta-safety').value").startswith("Уточнено")
            page.evaluate("() => applyIssueFix(4)")
            assert page.locator('#meta-safety').input_value().startswith("Уточнено")

            # Read-only documents must reject pending edits.
            page.evaluate("""() => {
              state.documentManager.status='Опубликован';
              applyDocumentLock();
            }""")
            before=page.evaluate("() => state.steps[0].durationSeconds")
            page.evaluate("() => applyIssueFix(3)")
            assert page.evaluate("() => state.steps[0].durationSeconds")==before

            # ✨ Reason retains accepted Stage39.1 direct-apply behaviour.
            page.evaluate("""() => {
              state.documentManager.status='Черновик';
              applyDocumentLock();renderSteps();
              aiAsk=async()=> 'Позволяет выявить видимые повреждения до использования.';
            }""")
            star=page.locator(f'[data-ai="reason"][data-id="{result["id"]}"]')
            star.click()
            page.wait_for_function("""id=>{
              const b=document.querySelector('[data-ai="reason"][data-id="'+id+'"]');
              return b&&!b.disabled&&b.textContent==='✨';
            }""",arg=result["id"],timeout=15000)
            assert page.locator("#stage391ReasonAIReview").count()==0
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert not errors,errors
            print("PASS Stage40 real Chrome: five inline old/new fields, no new "
                  "buttons/popups, idempotent render, stale manual and metadata "
                  "edits blocked, reason/KM apply, FRV intact, published lock, "
                  "Stage39.1 direct AI Reason unchanged",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
