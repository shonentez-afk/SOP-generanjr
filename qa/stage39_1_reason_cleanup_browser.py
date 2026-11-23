#!/usr/bin/env python3
"""Stage39.1 Chrome: user-driven, preview-before-apply Key Point echo cleanup."""
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
            page.on("dialog",lambda d:d.accept())
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            ids=page.evaluate("""() => {
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
              state.meta.safety='Применять подходящие средства защиты';
              state.steps=[step];
              stateToHtml();
              renderSteps();
              window.cleanupOriginal=structuredClone({
                id:step.id,reason:step.reason,keyMoments:step.keyMoments,
                action:step.action,frvSource:step.frvSource,
                durationSeconds:step.durationSeconds,photoHint:step.photoHint
              });
              return {id:step.id,initial:step.reason};
            }""")
            selector=f'button[data-stage391-cleanup="{ids["id"]}"]'
            button=page.locator(selector)
            assert button.count()==1 and button.is_visible()
            assert button.inner_text()=="Убрать повтор КМ"
            assert page.locator(f'[data-ai="reason"][data-id="{ids["id"]}"]').count()==1

            # Preview is read-only and requires an explicit Apply.
            button.click()
            assert page.locator('#stage391CleanupOverlay').count()==1
            assert page.locator('#stage391CleanupOverlay [role="dialog"]').count()==1
            assert page.evaluate("() => state.steps[0].reason")==ids["initial"]
            before=page.locator("#stage391CleanupOverlay pre").nth(0).inner_text()
            after=page.locator("#stage391CleanupOverlay pre").nth(1).inner_text()
            expected=(
              "1. Для предотвращения короткого замыкания и обеспечения безопасности работы с электроинструментом.\n"
              "2. Обеспечение герметичности и защита от влаги и пыли.\n"
              "3. Для предотвращения механических повреждений."
            )
            assert before==ids["initial"],before
            assert after==expected,(after,expected)
            assert "Проверить штепсельную вилку" not in after
            assert "Проверить резиновый наконечник" not in after
            assert "Проверить корпус" not in after
            assert after.count("\n")==2
            page.locator("#stage391CleanupCancel").click()
            assert page.locator("#stage391CleanupOverlay").count()==0
            assert page.evaluate("() => state.steps[0].reason")==ids["initial"]

            # Previewing must also be cancelled with Escape, never mutate.
            button.click()
            page.keyboard.press("Escape")
            assert page.locator("#stage391CleanupOverlay").count()==0
            assert page.evaluate("() => state.steps[0].reason")==ids["initial"]

            # The user explicitly approves. Only Reason is updated.
            button.click()
            page.locator("#stage391CleanupApply").click()
            assert page.locator("#stage391CleanupOverlay").count()==0
            result=page.evaluate("""() => {
              const step=state.steps[0],old=window.cleanupOriginal;
              return {
                reason:step.reason,
                unchanged:step.id===old.id&&
                  step.action===old.action&&
                  JSON.stringify(step.keyMoments)===JSON.stringify(old.keyMoments)&&
                  JSON.stringify(step.frvSource)===JSON.stringify(old.frvSource)&&
                  step.durationSeconds===old.durationSeconds&&
                  step.photoHint===old.photoHint
              };
            }""")
            assert result["reason"]==expected,result
            assert result["unchanged"],result
            assert page.locator(f'[data-step-field="reason"][data-id="{ids["id"]}"]').input_value()==expected

            # Running cleanup a second time leaves the document unchanged.
            page.locator(selector).click()
            assert page.locator("#stage391CleanupOverlay").count()==0
            assert page.evaluate("() => state.steps[0].reason")==expected

            # Protect against stale preview: manual text editing between preview
            # and Apply wins; the modal cannot overwrite the fresh text.
            page.evaluate("""() => {
              state.steps[0].reason=
                '1. Проверить штепсельную вилку и питающий кабель на повреждения — предотвращает неисправность.';
              renderSteps();
            }""")
            page.locator(selector).click()
            textbox=page.locator(f'[data-step-field="reason"][data-id="{ids["id"]}"]')
            textbox.fill("Ручная причина инженера.")
            page.locator("#stage391CleanupApply").click()
            assert page.evaluate("() => state.steps[0].reason")=="Ручная причина инженера."
            assert page.locator("#stage391CleanupOverlay").count()==0

            # A partial match is shown to the user; unmatched lines are kept.
            mixed=(
              "1. Проверить штепсельную вилку и питающий кабель на повреждения — исключить неисправный кабель.\n"
              "2. Общая причина без повторения ключевого момента."
            )
            page.evaluate("""s=>{state.steps[0].reason=s;renderSteps()}""",mixed)
            page.locator(selector).click()
            mixed_after=page.locator("#stage391CleanupOverlay pre").nth(1).inner_text()
            assert mixed_after==(
              "1. Исключить неисправный кабель.\n"
              "2. Общая причина без повторения ключевого момента."
            ),mixed_after
            assert "Строк без точного совпадения: 1" in page.locator(
                "#stage391CleanupOverlay").inner_text()
            page.locator("#stage391CleanupCancel").click()
            assert page.evaluate("() => state.steps[0].reason")==mixed

            # Ordinary reasons and hyphenated equipment model names are safe.
            good="Одна общая причина — предотвращает повреждение детали."
            page.evaluate("""s=>{state.steps[0].reason=s;renderSteps()}""",good)
            page.locator(selector).click()
            assert page.locator("#stage391CleanupOverlay").count()==0
            assert page.evaluate("() => state.steps[0].reason")==good

            # Do not show an enabled edit action for read-only SOPs.
            page.evaluate("""() => {
              state.documentManager.status='Опубликован';
              applyDocumentLock();
            }""")
            assert page.locator(selector).is_disabled()
            assert page.evaluate("() => state.steps[0].reason")==good
            assert not errors,errors
            print("PASS Stage39.1 manual KM cleanup: user preview, Cancel/Escape, "+
                  "explicit Apply, numbered Reasons, exact-only match, stale-data guard, "+
                  "partial match, FRV intact, readonly lock, old ✨ unchanged",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
