#!/usr/bin/env python3
"""Stage39.1: Key Point echo cleanup only for AI proposals, no separate UI."""
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
            page=browser.new_page(viewport={"width":1540,"height":980})
            page.on("pageerror",lambda err:errors.append(str(err)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            initial=page.evaluate("""() => {
              const step=createEmptyStep();
              step.action='Осмотреть электроинструмент';
              step.keyMoments=[
                'Проверить штепсельную вилку и питающий кабель на повреждения',
                'Проверить резиновый наконечник в месте ввода кабеля',
                'Проверить корпус на трещины и сколы'
              ];
              step.reason=
                '1. Проверить штепсельную вилку и питающий кабель на повреждения. Это важно для предотвращения короткого замыкания и обеспечения безопасности работы с электроинструментом.\\n'+
                '2. Проверить резиновый наконечник в месте ввода кабеля — обеспечение герметичности и защита от влаги и пыли.\\n'+
                '3. Проверить корпус на трещины и сколы. Это необходимо для предотвращения механических повреждений.';
              step.durationSeconds=60;
              step.frvSource={studyId:'measured-original',observedTimeSec:17.5};
              step.photoHint='Фотография исходного шага';
              state.meta.operation='Осмотр электроинструмента';
              state.steps=[step];
              stateToHtml();renderSteps();
              window.cleanupOriginal=JSON.stringify(state.steps);
              return step.reason;
            }""")

            # The cleanup button and its before/after modal are gone.
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert page.locator('#stage391CleanupOverlay').count()==0
            assert page.locator('[data-ai="reason"]').count()==1

            # Helper strips only exact matches in a proposed text.
            preview=page.evaluate("""() => ({
              result:stage391CleanupReason(state.steps[0].reason,state.steps[0]),
              original:JSON.stringify(state.steps)===window.cleanupOriginal
            })""")
            expected=(
              "1. Для предотвращения короткого замыкания и обеспечения безопасности работы с электроинструментом.\n"
              "2. Обеспечение герметичности и защита от влаги и пыли.\n"
              "3. Для предотвращения механических повреждений."
            )
            assert preview["result"]["before"]==initial,preview
            assert preview["result"]["after"]==expected,preview
            assert preview["result"]["changed"]==3,preview
            assert preview["original"],preview
            assert expected.count("\n")==2

            # Nonmatching text is preserved verbatim; no source mutation.
            mixed=(
              "1. Проверить штепсельную вилку и питающий кабель на повреждения — исключить неисправный кабель.\n"
              "2. Общая причина без повторения ключевого момента."
            )
            partial=page.evaluate("""text => {
              const original=JSON.stringify(state.steps);
              const value=stage391CleanupReason(text,state.steps[0]);
              return {value,unchanged:JSON.stringify(state.steps)===original};
            }""",mixed)
            assert partial["value"]["after"]==(
              "1. Исключить неисправный кабель.\n"
              "2. Общая причина без повторения ключевого момента."
            ),partial
            assert partial["value"]["changed"]==1,partial
            assert partial["unchanged"],partial

            plain="Одна общая причина — предотвращает повреждение детали."
            assert page.evaluate("""text=>
                stage391CleanupReason(text,state.steps[0]).after===text
            """,plain)

            # A published SOP still cannot show the removed button.
            page.evaluate("""() => {
              state.documentManager.status='Опубликован';
              applyDocumentLock();renderSteps();
            }""")
            assert page.locator('button[data-stage391-cleanup]').count()==0
            assert page.locator('#stage391CleanupOverlay').count()==0
            assert page.evaluate("() => JSON.stringify(state.steps)")==page.evaluate(
                "() => window.cleanupOriginal")
            assert not errors,errors
            print("PASS Stage39.1 KM cleanup: pure exact-match helper, "
                  "no UI button/modal, original numbered reasons untouched, "
                  "FRV/photo/steps safe, readonly safe",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
