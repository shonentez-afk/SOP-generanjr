#!/usr/bin/env python3
"""Stage39.1: exact PTEEP #811 screenshot regression, no hallucinated WHY."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage39-1-ai-reasons-frv-browser-candidate.html"


def main():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
                                   args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1450,"height":820})
            page.on("pageerror",lambda err:errors.append(str(err)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            id=page.evaluate("""() => {
              const step=createEmptyStep();
              step.action='Осмотреть электроинструмент';
              step.keyMoments=[
                'Проверить штепсельную вилку и питающий кабель на повреждения',
                'Проверить резиновый наконечник в месте ввода кабеля',
                'Проверить корпус на трещины и сколы'
              ];
              step.reason='ПТЭЭП (Приказ Минэнерго №811): при несоответствии — проверить локальную инструкцию';
              state.steps=[step];
              state.meta.operation='Осмотр электроинструмента';
              state.description='Осмотреть инструмент перед использованием: проверить кабель, вилку, ввод кабеля и корпус на видимые повреждения.';
              stateToHtml();renderSteps();
              window.s391WhyTest={
                original:step.reason,calls:[],responses:[]
              };
              aiAsk=async (prompt,context,options)=>{
                window.s391WhyTest.calls.push({prompt,context,options});
                return window.s391WhyTest.responses.shift()??'';
              };
              return step.id;
            }""")
            selector=f'[data-ai="reason"][data-id="{id}"]'
            overlay="#stage391ReasonAIReview"
            normative="ПТЭЭП (Приказ Минэнерго №811): при несоответствии — проверить локальную инструкцию"
            safe="Позволяет выявить видимые повреждения электроинструмента до начала его использования."

            before=page.evaluate("""() => ({
              old:state.steps[0].reason,
              oldIsReference:stage391ReasonAIIsReferenceInsteadOfWhy(state.steps[0].reason),
              draft:stage391ReasonAIDraftForContext(state.steps[0].reason),
              gen:STAGE29_SOP_PROMPT,
              edit:AI_SYS.reason,
              direct:stage391ReasonAIInspect(state.steps[0].reason,state.steps[0].reason,state.steps[0])
            })""")
            assert before["old"]==normative,before
            assert before["oldIsReference"],before
            assert "ПТЭЭП" not in before["draft"],before
            assert "ПТЭЭП" not in before["gen"],"Generate prompt still supplies normative list"
            assert "Приказ Минэнерго №811" not in before["gen"]
            assert "ПТЭЭП" not in before["edit"],"Reason prompt still supplies normative list"
            assert not before["direct"]["ok"],before["direct"]

            # Unsupported normative-only output in a newly generated SOP
            # is an unanswered WHY, not a reason or a fatal whole-SOP error.
            proposed=page.evaluate("""() => {
              const step=state.steps[0],saved=JSON.stringify(state.steps);
              const draft={
                steps:[{
                  action:step.action,keyMoments:[...step.keyMoments],reason:step.reason,
                  success_criteria:'',time:null,
                  decision_points:[],common_pitfalls:[],visual_markers:[]
                }],openQuestions:[]
              };
              const out=stage29SopNormalize(draft,{
                userDescription:state.description,operation:step.action,
                department:'',workplace:'',executor:'',tools:'',material:'',safety:''
              });
              return {
                reason:out.sop.steps[0].reason,
                asked:out.sop.openQuestions.some(q=>q.includes('норматив или инструкцию вместо WHY')),
                liveSame:JSON.stringify(state.steps)===saved,
                actionSame:out.sop.steps[0].action===step.action,
                kmSame:JSON.stringify(out.sop.steps[0].keyMoments)===JSON.stringify(step.keyMoments)
              };
            }""")
            assert proposed["reason"]=="",proposed
            assert all(proposed[k] for k in ("asked","liveSame","actionSame","kmSame")),proposed

            # Mixed numbered WHY: remove ONLY the unsupported normative line.
            # The useful second Reason survives and is re-numbered within the
            # same corporate field, without touching the already open SOP.
            mixed=page.evaluate("""() => {
              const s=state.steps[0],original=JSON.stringify(state.steps);
              const draft={steps:[{
                action:s.action,keyMoments:[...s.keyMoments],
                reason:'1. '+s.reason+'\\n2. Позволяет выявить видимые повреждения корпуса до использования.',
                success_criteria:'',time:null,
                decision_points:[],common_pitfalls:[],visual_markers:[]
              }],openQuestions:[]};
              const out=stage29SopNormalize(draft,{
                userDescription:state.description,operation:s.action,
                department:'',workplace:'',executor:'',tools:'',material:'',safety:''
              });
              return {
                reason:out.sop.steps[0].reason,
                requested:out.sop.openQuestions.some(q=>q.includes('норматив или инструкцию вместо WHY')),
                preserved:JSON.stringify(state.steps)===original
              };
            }""")
            assert mixed["reason"]==(
                "1. Позволяет выявить видимые повреждения корпуса до использования."
            ),mixed
            assert mixed["requested"] and mixed["preserved"],mixed

            def start(replies,preview):
                page.evaluate("r => {window.s391WhyTest.calls=[];window.s391WhyTest.responses=r}",replies)
                page.locator(selector).click()
                if preview:
                    page.locator(overlay).wait_for(state="visible",timeout=15000)
                    assert page.evaluate("() => state.steps[0].reason")==normative
                    assert page.locator(overlay+" [data-ai-preview-action='apply']").is_visible()
                else:
                    page.wait_for_function("""s=>{
                      const b=document.querySelector(s);
                      return b&&!b.disabled&&b.textContent==='✨';
                    }""",arg=selector,timeout=15000)
                    assert page.locator(overlay).count()==0
                    assert page.evaluate("() => state.steps[0].reason")==normative
                return page.evaluate("() => window.s391WhyTest.calls")

            # The exact old normative-only reply cannot be promoted to a WHY;
            # the second grounded response is shown but not applied automatically.
            calls=start([normative,safe],True)
            assert len(calls)==2,calls
            assert all("ПТЭЭП" not in c["prompt"] for c in calls),calls
            assert all("ПТЭЭП" not in c["context"] for c in calls),calls
            assert "ПТЭЭП" in page.locator(overlay).inner_text()  # OLD in "Было"
            assert safe in page.locator(overlay).inner_text()  # NEW in "Стало"
            page.locator(overlay+" [data-ai-preview-action='cancel']").click()
            page.locator(overlay).wait_for(state="detached")
            assert page.evaluate("() => state.steps[0].reason")==normative

            # Same screenshot: an invented injury consequence is rejected.
            calls=start(["Для предотвращения травмы при осмотре электроинструмента.",safe],True)
            assert len(calls)==2,calls
            page.locator(overlay+" [data-ai-preview-action='cancel']").click()
            page.locator(overlay).wait_for(state="detached")
            assert page.evaluate("() => state.steps[0].reason")==normative

            # Two unsupported model replies -> no change, no review modal.
            calls=start([normative,"Для предотвращения травмы при осмотре электроинструмента."],False)
            assert len(calls)==2,calls
            assert page.evaluate("() => state.steps[0].reason")==normative

            # Insufficient-facts sentinel must NOT be stored as a reason.
            calls=start(["NEEDS_REASON_FACTS"],False)
            assert len(calls)==1,calls

            # A grounded WHY must still require explicit user approval.
            calls=start([safe],True)
            assert len(calls)==1,calls
            assert page.evaluate("() => state.steps[0].reason")==normative
            page.locator(overlay+" [data-ai-preview-action='apply']").click()
            page.locator(overlay).wait_for(state="detached")
            assert page.evaluate("() => state.steps[0].reason")==safe
            assert page.evaluate("""() => JSON.stringify(state.steps[0].keyMoments)""").count(
                "Проверить")==3
            assert not errors,errors
            print("PASS screenshot PTEEP #811 is no longer seeded, unverified old reason "
                  "is not evidence, model injury/normative hallucinations trigger one "
                  "bounded retry, fail-closed or approved preview, original safe",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
