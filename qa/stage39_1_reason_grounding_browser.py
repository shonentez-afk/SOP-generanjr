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

            def start(replies,expected):
                page.evaluate("""old => {
                  state.steps[0].reason=old;stateToHtml();renderSteps();
                }""",normative)
                page.evaluate("""r => {
                  window.s391WhyTest.calls=[];
                  window.s391WhyTest.responses=r;
                }""",replies)
                page.locator(selector).click()
                page.wait_for_function("""s=>{
                  const b=document.querySelector(s);
                  return b&&!b.disabled&&b.textContent==='✨';
                }""",arg=selector,timeout=15000)
                assert page.locator("#stage391ReasonAIReview").count()==0
                assert page.locator("#stage391CleanupOverlay").count()==0
                assert page.locator('button[data-stage391-cleanup]').count()==0
                assert page.evaluate("() => state.steps[0].reason")==expected
                return page.evaluate("() => window.s391WhyTest.calls")

            # Unsupported normative response triggers one retry. A grounded
            # follow-up applies immediately, without asking for confirmation.
            calls=start([normative,safe],safe)
            assert len(calls)==2,calls
            assert all("ПТЭЭП" not in c["prompt"] for c in calls),calls
            assert all("ПТЭЭП" not in c["context"] for c in calls),calls

            # Invented injury is rejected; a grounded retry succeeds.
            calls=start(["Для предотвращения травмы при осмотре электроинструмента.",safe],safe)
            assert len(calls)==2,calls

            # Two unsupported answers -> no write.
            calls=start([normative,"Для предотвращения травмы при осмотре электроинструмента."],normative)
            assert len(calls)==2,calls

            # Missing-facts marker is never stored or retried.
            calls=start(["NEEDS_REASON_FACTS"],normative)
            assert len(calls)==1,calls

            # A new click can succeed after an earlier invalid response.
            calls=start([safe],safe)
            assert len(calls)==1,calls
            assert page.locator(f'[data-step-field="reason"][data-id="{id}"]').input_value()==safe
            assert page.evaluate("""() => JSON.stringify(state.steps[0].keyMoments)""").count(
                "Проверить")==3
            assert not errors,errors
            print("PASS screenshot PTEEP #811 is no longer seeded, unverified old reason "
                  "is not evidence, model injury/normative hallucinations trigger one "
                  "bounded retry, fail-closed or direct validated apply, original safe",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
