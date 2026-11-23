#!/usr/bin/env python3
"""Real Chrome QA for ✨ in the Reason field, NOT SOP generation."""
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
            page.on("pageerror",lambda err:errors.append(str(err)))
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
              step.reason=
                '1. Проверить штепсельную вилку и питающий кабель на повреждения — предотвращает риск поражения электрическим током.\\n'+
                '2. Проверить резиновый наконечник в месте ввода кабеля — обеспечивает герметичность и защиту от влаги и пыли.\\n'+
                '3. Проверить корпус на трещины и сколы — предотвращает возможность поражения электрическим током и повышает безопасность использования инструмента.';
              state.steps=[step];
              state.meta.operation='Осмотр электроинструмента';
              state.description='Осмотреть электроинструмент, вилку, кабель, наконечник и корпус.';
              stateToHtml();renderSteps();
              window.starFixture={
                original:step.reason,
                keyPoints:JSON.stringify(step.keyMoments),
                id:step.id,
                aiResponse:step.reason
              };
              window.starAiCalls=[];
              aiAsk=async (system,context,opts)=>{
                window.starAiCalls.push({system,context,task:opts?.task});
                return window.starFixture.aiResponse;
              };
              return step.id;
            }""")
            button=f'[data-ai="reason"][data-id="{step_id}"]'
            def run_star(response):
                page.evaluate("v=>{window.starFixture.aiResponse=v}",response)
                page.locator(button).click()
                page.wait_for_function("""s=>{
                  const b=document.querySelector(s);
                  return b&&!b.disabled&&b.textContent==='✨';
                }""",arg=button,timeout=10000)
            # Exact reported bug: model sends "1. Key Point — Reason Why" for
            # every line, the star must store only numbered Reasons Why.
            initial=page.evaluate("() => window.starFixture.original")
            run_star(initial)
            result=page.evaluate("""() => ({
              reason:state.steps[0].reason,
              keyPoints:JSON.stringify(state.steps[0].keyMoments),
              calls:window.starAiCalls,
              description:state.description
            })""")
            expected=(
                "1. предотвращает риск поражения электрическим током.\n"
                "2. обеспечивает герметичность и защиту от влаги и пыли.\n"
                "3. предотвращает возможность поражения электрическим током и повышает безопасность использования инструмента."
            )
            assert result["reason"].lower()==expected,(result["reason"],expected)
            assert result["keyPoints"]==page.evaluate("() => window.starFixture.keyPoints")
            assert result["calls"][0]["task"]=="edit_reason"
            assert "Возвращай" not in result["description"]
            assert "ТОЛЬКО Reasons Why" in result["calls"][0]["system"]
            assert "allKeyPoints" in result["calls"][0]["context"]
            assert "Проверить штепсельную вилку" not in result["reason"]
            assert "Проверить резиновый наконечник" not in result["reason"]
            assert "Проверить корпус" not in result["reason"]

            # Already-correct AI results remain unchanged, including a dash
            # inside the actual explanation not preceded by a full Key Point.
            corrected="1. "+result["reason"].splitlines()[0][3:]+"\n"+(
              "2. Проверка до запуска — исключает использование неисправного оборудования.\n"
              "3. "+result["reason"].splitlines()[2][3:])
            page.evaluate("""() => {
              state.description+=' Проверка до запуска — исключает использование неисправного оборудования.';
            }""")
            run_star(corrected)
            assert page.evaluate("() => state.steps[0].reason")==corrected
            before=page.evaluate("() => state.steps[0].reason")

            # If the model cannot supply a WHY, don't delete or change user data.
            broken=('1. Проверить штепсельную вилку и питающий кабель на повреждения —  \n'
                    '2. обеспечивает герметичность и защиту от влаги и пыли.\n'
                    '3. предотвращает возможность поражения электрическим током.')
            run_star(broken)
            assert page.evaluate("() => state.steps[0].reason")==before

            # Exact user's latest reproduction: not an em dash but a PERIOD,
            # followed by "Это важно для..." or "Это необходимо для...".
            latest=(
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
            run_star(latest)
            exact_expected=(
              "1. Для предотвращения короткого замыкания и обеспечения "
              "безопасности работы с электроинструментом.\n"
              "2. Для предотвращения повреждения кабеля и обеспечения "
              "надёжного контакта.\n"
              "3. Для предотвращения поражения электрическим током "
              "и обеспечения механической целостности инструмента."
            )
            exact_actual=page.evaluate("() => state.steps[0].reason")
            assert exact_actual==exact_expected,(exact_actual,exact_expected)
            assert "Проверить " not in exact_actual
            assert "Это важно" not in exact_actual
            assert "Это необходимо" not in exact_actual
            assert page.evaluate("() => JSON.stringify(state.steps[0].keyMoments)")==page.evaluate(
                "() => window.starFixture.keyPoints")
            # No mass cleanup: unrelated correctly-written reasons and
            # punctuation inside the actual WHY remain untouched.
            good_no_prefix=(
              "1. Для предотвращения повреждения вилки.\n"
              "2. Проверка перед пуском. Исключает использование повреждённого кабеля.\n"
              "3. Для предотвращения повреждения корпуса."
            )
            run_star(good_no_prefix)
            assert page.evaluate("() => state.steps[0].reason")==good_no_prefix
            previous=good_no_prefix
            run_star(
              "1. Проверить штепсельную вилку и питающий кабель на повреждения. Это важно.\n"
              "2. Проверка перед пуском. Исключает использование повреждённого кабеля.\n"
              "3. Для предотвращения повреждения корпуса."
            )
            assert page.evaluate("() => state.steps[0].reason")==previous
            assert not errors,errors
            print("PASS: ✨ Reason-only output removes 3 matching Key Points with dash OR full stop, keeps labels, "+
                  "preserves good causes/dashes, rejects missing WHY; SOP generator untouched",flush=True)
        finally:
            browser.close()

if __name__=="__main__":
    main()
