#!/usr/bin/env python3
"""Stage41 real Chrome file:// prompt quality, review dedup and safety."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage41-ai-quality-browser-candidate.html"


def main():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
                                   args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1450,"height":900})
            page.on("pageerror",lambda err:errors.append(str(err)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            result=page.evaluate("""async () => {
              const step=createEmptyStep();
              step.action='Осмотреть электроинструмент';
              step.keyMoments=['Проверить корпус на видимые повреждения'];
              step.reason='Позволяет выявить видимые повреждения до использования.';
              step.successCriteria='Инструмент осмотрен';
              step.durationSeconds=70;
              step.frvSource={studyId:'frv-original',observedTimeSec:13.5};
              state.steps=[step];
              state.meta.operation='Осмотр электроинструмента';
              state.meta.safety='Использовать защитные средства';
              state.description='Осмотреть инструмент перед использованием на видимые повреждения.';
              stateToHtml();renderSteps();
              const before=JSON.stringify(state.steps);
              const taskCalls=[];
              const upstream=stage41UnderlyingAIRequest;
              stage41UnderlyingAIRequest=async (prompt,context,options)=>{
                taskCalls.push({prompt,context,options});
                return 'SENTINEL_FROM_FAKE_PROXY';
              };
              try{
                for(const task of ['generate_sop','review','twi_generate','edit_reason','edit_km']){
                  const prompts={
                    generate_sop:STAGE29_SOP_PROMPT,
                    review:STAGE28_REVIEW_PROMPT,
                    twi_generate:STAGE29_TWI_PROMPT,
                    edit_reason:AI_SYS.reason,
                    edit_km:AI_SYS.km
                  };
                  const reply=await aiAsk(prompts[task],'DATA BEGIN\\nUSER FACTS 20 Н\\nDATA END',
                    {task,model:'test',maxTokens:127});
                  if(reply!=='SENTINEL_FROM_FAKE_PROXY')throw Error('Transport return changed');
                }
              }finally{
                stage41UnderlyingAIRequest=upstream;
              }
              const reason='Позволяет выявить видимые повреждения до использования.';
              const fix='Позволяет выявить повреждения до начала использования.';
              const other='Позволяет обнаружить видимые повреждения инструмента.';
              const validated=[
                {stepId:1,field:'reason',type:'incomplete',
                 severity:'improvement',description:'Уточнить WHY (формулировка A)',
                 suggestion:'Уточнить WHY',fixValue:fix},
                {stepId:1,field:'reason',type:'incomplete',
                 severity:'improvement',description:'Уточнить WHY (формулировка B)',
                 suggestion:'Уточнить WHY',fixValue:fix},
                {stepId:1,field:'reason',type:'incomplete',
                 severity:'improvement',description:'Другое уточнение WHY',
                 suggestion:'Другое уточнение',fixValue:other},
                {stepId:1,field:'reason',type:'incomplete',
                 severity:'question',description:'Нужно дополнительное основание',
                 suggestion:'Уточнить у инженера',fixValue:null}
              ];
              const original={issues:validated.map(item=>({
                ...item,evidence:{field:'reason',quote:reason}
              }))};
              const grounded=stage28GroundAIReview({issues:validated},original,
                state.steps,state.meta);
              const kept=stage41UniqueActionableAIReview([
                {reviewOrigin:'rule',evidenceVerified:true,stepId:1,field:'reason',
                 type:'incomplete',fixValue:fix,evidence:reason},
                {reviewOrigin:'rule',evidenceVerified:true,stepId:1,field:'reason',
                 type:'incomplete',fixValue:fix,evidence:reason},
                {reviewOrigin:'ai',evidenceVerified:false,stepId:1,field:'reason',
                 type:'incomplete',fixValue:fix,evidence:reason},
                {reviewOrigin:'ai',evidenceVerified:false,stepId:1,field:'reason',
                 type:'incomplete',fixValue:fix,evidence:reason}
              ]);
              return {
                taskCalls:taskCalls.map(({prompt,context,options})=>({
                  prompt,context,task:options.task,model:options.model,tokens:options.maxTokens
                })),
                originalReviewPrompt:STAGE28_REVIEW_PROMPT,
                originalReasonPrompt:AI_SYS.reason,
                originalNorm:NORM_BASE,
                dedupCount:grounded.length,
                dedupValues:grounded.map(i=>i.fixValue),
                everyGrounded:grounded.every(i=>i.evidenceVerified),
                preserveUnverifiedAndRule:kept.length,
                unchanged:JSON.stringify(state.steps)===before,
                sourceReason:state.steps[0].reason,
                sourceFrv:state.steps[0].frvSource.observedTimeSec,
                oldReviewUI:!!document.querySelector('#stage27Actions'),
                version:document.querySelector('#sopVersionLabel')?.textContent
              };
            }""")
            calls=result["taskCalls"]
            assert len(calls)==5,calls
            assert [c["task"] for c in calls]==[
                "generate_sop","review","twi_generate","edit_reason","edit_km"]
            assert all(c["context"]=="DATA BEGIN\nUSER FACTS 20 Н\nDATA END"
                       for c in calls),calls
            assert all(c["model"]=="test" and c["tokens"]==127 for c in calls)
            assert "STAGE41" in calls[0]["prompt"],calls[0]["prompt"][-700:]
            assert "STAGE41" in calls[1]["prompt"],calls[1]["prompt"][-700:]
            assert "STAGE41" in calls[2]["prompt"],calls[2]["prompt"][-700:]
            assert result["originalNorm"] in result["originalReviewPrompt"]
            assert result["originalNorm"] not in calls[1]["prompt"]
            assert "Приказ Минэнерго №811" not in calls[1]["prompt"],calls[1]["prompt"]
            assert calls[3]["prompt"]==result["originalReasonPrompt"],(
                "Accepted ✨ Reason prompt was unexpectedly changed")
            assert "STAGE41" not in calls[3]["prompt"]
            assert "STAGE41" not in calls[4]["prompt"]
            assert result["dedupCount"]==3,result
            assert result["dedupValues"].count(
                "Позволяет выявить повреждения до начала использования.")==1
            assert result["everyGrounded"],result
            assert result["preserveUnverifiedAndRule"]==4,result
            assert result["unchanged"],result
            assert result["sourceReason"]=="Позволяет выявить видимые повреждения до использования."
            assert result["sourceFrv"]==13.5
            assert "Stage41" in result["version"],result["version"]
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert page.locator('#stage391ReasonAIReview').count()==0
            assert page.locator('#stage391CleanupOverlay').count()==0
            # Stage40 remains operative on the Stage41 candidate: the
            # existing review cards render old/new and protect manual edits.
            page.evaluate("""() => {
              const s=state.steps[0];
              reviewIssues=[{
                stepId:1,field:'reason',type:'incomplete',
                status:'open',severity:'improvement',thread:[],
                description:'Уточнить формулировку подтверждённой причины',
                suggestion:'Сделать объяснение точнее',
                evidenceKind:'observed',evidenceVerified:true,
                evidence:s.reason,evidenceSource:'Шаг 1 · Почему важно',
                fixValue:'Позволяет выявить повреждения перед использованием.'
              }];
              reviewSummary={overall_quality:'needs_improvement',
                summary:'Есть одно уточнение'};
              stage28ReviewMeta=stage28NormalizeMeta({
                documentId:state.documentManager?.currentId??null,
                contextSignature:stage28DocumentSignature(state),
                stepSignatures:state.steps.map(stage28StepSignature),
                aiComplete:true,lastMode:'full',checkedAt:Date.now(),reviewedSteps:1
              });
              renderReviewResults(reviewSummary);
            }""")
            assert page.locator('[data-stage40-compare]').count()==1
            assert page.locator('button[data-apply]').count()==1
            preview=page.locator('[data-stage40-compare="0"]').inner_text()
            assert "Сейчас" in preview and "После применения" in preview,preview
            page.evaluate("""() => {
              state.steps[0].reason='Причина уточнена вручную инженером.';
              renderSteps();renderReviewResults(reviewSummary);
            }""")
            assert page.locator('button[data-apply="0"]').is_disabled()
            page.evaluate("() => applyIssueFix(0)")
            assert page.evaluate(
                "() => state.steps[0].reason")=="Причина уточнена вручную инженером."
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert page.locator('#stage391ReasonAIReview').count()==0

            assert not errors,errors
            print("PASS Stage41 Chrome: task-limited prompts, no review NORM_BASE, "
                  "Reason/KM untouched, exact AI review dedup only, model options "
                  "and input facts unchanged, UI/FRV/state preserved",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
