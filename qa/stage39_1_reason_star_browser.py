#!/usr/bin/env python3
"""Rollback regression: ✨ Reason behaves as the accepted Stage39 button."""
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
            page.on("pageerror",lambda err: errors.append(str(err)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            step_id=page.evaluate("""() => {
              const step=createEmptyStep();
              step.action='Осмотреть электроинструмент';
              step.keyMoments=[
                'Проверить штепсельную вилку и питающий кабель на повреждения',
                'Проверить резиновый наконечник в месте ввода кабеля',
                'Проверить корпус на трещины и сколы'
              ];
              step.reason='1. Безопасность оборудования.\\n2. Надежность соединений.\\n3. Целостность корпуса.';
              state.steps=[step];
              state.meta.operation='Осмотр электроинструмента';
              state.description='Осмотреть электроинструмент перед работой.';
              stateToHtml();renderSteps();
              window.stage39ReasonFixture={
                initial:step.reason,
                keyPoints:JSON.stringify(step.keyMoments),
                id:step.id,
                response:''
              };
              window.stage39ReasonCalls=[];
              aiAsk=async (prompt,context,options)=>{
                window.stage39ReasonCalls.push({prompt,context,options});
                return window.stage39ReasonFixture.response;
              };
              return step.id;
            }""")
            button=f'[data-ai="reason"][data-id="{step_id}"]'

            def run_star(reply):
                page.evaluate("x=>{window.stage39ReasonFixture.response=x}",reply)
                page.locator(button).click()
                page.wait_for_function("""s=>{
                  const b=document.querySelector(s);
                  return b&&!b.disabled&&b.textContent==='✨';
                }""",arg=button,timeout=12000)

            reported=(
                "1. Проверить штепсельную вилку и питающий кабель на повреждения. "
                "Это важно для предотвращения короткого замыкания и обеспечения "
                "безопасности работы с электроинструментом.\n"
                "2. Проверить резиновый наконечник в месте ввода кабеля. "
                "Это необходимо для предотвращения повреждения кабеля "
                "и обеспечения надёжного контакта.\n"
                "3. Проверить корпус на трещины и сколы. "
                "Это важно для предотвращения поражения электрическим током "
                "и обеспечения механической целостности инструмента."
            )
            # Accepted Stage39 copied model response directly; no experimental
            # parsing or paraphrasing. This is an intentional rollback.
            run_star(reported)
            actual=page.evaluate("() => state.steps[0].reason")
            assert actual==reported,(actual,reported)
            data=page.evaluate("""() => ({
              keyPoints:JSON.stringify(state.steps[0].keyMoments),
              description:state.description,
              call:window.stage39ReasonCalls.at(-1),
              restored:aiFillField.toString().includes('stage391AcceptedReasonFill'),
              accepted:stage391AcceptedReasonFill.toString().includes('maxTokens:400')
            })""")
            assert data["keyPoints"]==page.evaluate("() => window.stage39ReasonFixture.keyPoints")
            assert data["description"]=="Осмотреть электроинструмент перед работой."
            assert data["restored"] and data["accepted"]
            assert data["call"]["options"]["maxTokens"]==400
            assert data["call"]["options"]["task"]=="edit_reason"
            assert "Действие: Осмотреть электроинструмент" in data["call"]["context"]
            assert "Key Points:" in data["call"]["context"]
            assert "Текущий Reason:" in data["call"]["context"]
            assert "ФОРМАТ: только готовый текст причины." in data["call"]["prompt"]

            # Existing accepted cleanup: remove only a leading field title.
            new_reason="1. Сохранить целостность изоляции.\n2. Предотвратить повреждение кабеля."
            run_star("Причина: "+new_reason)
            assert page.evaluate("() => state.steps[0].reason")==new_reason
            before=page.evaluate("() => state.steps[0].reason")
            run_star("")
            assert page.evaluate("() => state.steps[0].reason")==before

            # Published/archive document protection from Stage39.1 remains.
            page.evaluate("() => {state.documentManager.status='Опубликован'; applyDocumentLock()}")
            run_star(new_reason)
            assert page.evaluate("() => state.steps[0].reason")==before
            assert not errors,errors
            print("PASS: ✨ Reason restored to exact Stage39 behavior, old AI prompt/context "+
                  "and maxTokens 400; title cleanup, empty guard, locked documents, data stable",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
