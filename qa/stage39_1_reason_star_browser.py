#!/usr/bin/env python3
"""Stage39.1: grounded ✨ Reason applies directly, without UI confirmation."""
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
            page=browser.new_page(viewport={"width":1480,"height":980})
            page.on("pageerror",lambda e:errors.append(str(e)))
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
              step.reason='1. Выявить повреждения кабеля.\\n'+
                '2. Проверить защиту ввода кабеля.\\n'+
                '3. Выявить трещины и сколы корпуса.';
              state.steps=[step];
              state.meta.operation='Осмотр электроинструмента';
              state.description='Проверить инструмент на видимые повреждения до работы.';
              stateToHtml();renderSteps();
              window.reasonStarFixture={
                initial:step.reason,keyPoints:JSON.stringify(step.keyMoments),
                response:'',calls:[]
              };
              aiAsk=async (prompt,context,options)=>{
                window.reasonStarFixture.calls.push({prompt,context,options});
                return window.reasonStarFixture.response;
              };
              return step.id;
            }""")
            button=f'[data-ai="reason"][data-id="{id}"]'
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert page.locator('#stage391CleanupOverlay').count()==0

            def ready():
                page.wait_for_function("""s=>{
                  const b=document.querySelector(s);
                  return !!b&&!b.disabled&&b.textContent==='✨';
                }""",arg=button,timeout=15000)
                assert page.locator('#stage391ReasonAIReview').count()==0
                assert page.locator('#stage391CleanupOverlay').count()==0

            def start(reply):
                page.evaluate("""r=>{
                  window.reasonStarFixture.response=r;
                  window.reasonStarFixture.calls=[];
                }""",reply)
                page.locator(button).click()
                ready()
                return page.evaluate("() => window.reasonStarFixture.calls")

            # Three numbered WHYs -> one shared WHY without Apply or preview.
            one="Позволяет обнаружить видимые повреждения электроинструмента до начала работы."
            calls=start(one)
            assert page.evaluate("() => state.steps[0].reason")==one
            assert page.locator(f'[data-step-field="reason"][data-id="{id}"]').input_value()==one
            assert len(calls)==1,calls
            call=calls[0]
            assert call["options"]["task"]=="edit_reason"
            assert call["options"]["maxTokens"]==550
            assert "formatPreference" in call["context"]
            assert "ОДНУ краткую общую" in call["prompt"]

            # One WHY -> three numbered WHYs. Repeated Key Point text must be
            # stripped only from the model answer, never other step fields.
            multiple=(
                "1. Проверить штепсельную вилку и питающий кабель на повреждения — "
                "Выявить повреждение до использования.\n"
                "2. Проверить резиновый наконечник в месте ввода кабеля — "
                "Проверить состояние ввода кабеля.\n"
                "3. Проверить корпус на трещины и сколы — "
                "Выявить трещины до начала работы."
            )
            diagnosis=page.evaluate("""proposal => {
              const step=state.steps[0];
              return stage391ReasonAIInspect(step.reason,proposal,step);
            }""",multiple)
            assert diagnosis["ok"],diagnosis
            calls=start(multiple)
            expected=("1. Выявить повреждение до использования.\n"
                      "2. Проверить состояние ввода кабеля.\n"
                      "3. Выявить трещины до начала работы.")
            assert page.evaluate("() => state.steps[0].reason")==expected
            assert page.evaluate("() => JSON.stringify(state.steps[0].keyMoments)")==page.evaluate(
                "() => window.reasonStarFixture.keyPoints")
            assert len(calls)==1,calls

            # Invalid numbering, figures, references, risks and service values
            # never overwrite the working Reason (including after retry).
            invalids=[
                "1. Проверить вилку\n3. Проверить корпус",
                "1. 999 Н\n2. Сохранить инструмент\n3. Избежать повреждений",
                "1. ГОСТ 999-2026 обязателен\n2. Проверить прибор",
                "Для предотвращения перегрева инструмента.",
                "null",
                ""
            ]
            for bad in invalids:
                before=page.evaluate("() => state.steps[0].reason")
                calls=start(bad)
                assert page.evaluate("() => state.steps[0].reason")==before,bad
                assert 1<=len(calls)<=2,(bad,calls)

            # The in-flight answer must not overwrite a manual correction.
            page.evaluate("""() => {
              aiAsk=async()=>new Promise(resolve=>{
                window.reasonStarFixture.pendingResolve=resolve;
              });
            }""")
            page.locator(button).click()
            page.wait_for_function(
                "() => typeof window.reasonStarFixture.pendingResolve==='function'")
            page.evaluate("""() => {
              state.steps[0].reason='Исправлено инженером вручную.';
              renderSteps();
              window.reasonStarFixture.pendingResolve(
                'Позволяет выявить видимые повреждения инструмента до работы.');
            }""")
            ready()
            assert page.evaluate(
                "() => state.steps[0].reason")=="Исправлено инженером вручную."

            # Published and archived documents stay read-only.
            page.evaluate("() => {state.documentManager.status='Опубликован';applyDocumentLock()}")
            page.evaluate("""async () => {
              const b=document.querySelector('[data-ai="reason"]');
              await aiFillField(b,'reason',state.steps[0].reason,
                  value=>{state.steps[0].reason=value});
            }""")
            assert page.evaluate(
                "() => state.steps[0].reason")=="Исправлено инженером вручную."
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert not errors,errors
            print("PASS Stage39.1 Reason: direct validated 3-to-1 and 1-to-3, "
                  "no KM button or confirmation modal, exact-only AI cleanup, "
                  "invalid guesses blocked, stale and readonly safe",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
