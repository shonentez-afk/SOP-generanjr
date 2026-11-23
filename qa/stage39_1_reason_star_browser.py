#!/usr/bin/env python3
"""Stage39.1: ✨ Reason proposal must be grounded, previewed, and approved."""
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
            overlay="#stage391ReasonAIReview"
            initial=page.evaluate("() => window.reasonStarFixture.initial")

            def start(reply,expect_preview=True):
                page.evaluate("r => {window.reasonStarFixture.response=r}",reply)
                page.locator(button).click()
                if expect_preview:
                    page.locator(overlay).wait_for(state="visible",timeout=15000)
                    assert page.locator(overlay+" [data-ai-preview-action='apply']").count()==1
                    assert page.locator(overlay+" [data-ai-preview-action='cancel']").count()==1
                else:
                    page.wait_for_function("""s=>{
                      const b=document.querySelector(s);
                      return !!b&&!b.disabled&&b.textContent==='✨';
                    }""",arg=button,timeout=12000)
                    assert page.locator(overlay).count()==0

            def close(action):
                page.locator(overlay+f" [data-ai-preview-action='{action}']").click()
                page.locator(overlay).wait_for(state="detached",timeout=10000)
                page.wait_for_function("""s=>{
                  const b=document.querySelector(s);
                  return !!b&&!b.disabled&&b.textContent==='✨';
                }""",arg=button,timeout=10000)

            # The model may propose one general reason instead of 3 separate
            # reasons. The document must NEVER collapse them automatically.
            one="Позволяет обнаружить видимые повреждения электроинструмента до начала работы."
            start(one)
            assert page.evaluate("() => state.steps[0].reason")==initial
            content=page.locator(overlay).inner_text()
            assert "Было" in content and "Стало" in content
            assert "3 → одна общая" in content,content
            assert one in content
            call=page.evaluate("() => window.reasonStarFixture.calls.at(-1)")
            assert call["options"]["task"]=="edit_reason"
            assert call["options"]["maxTokens"]==550
            assert "formatPreference" in call["context"]
            assert "ОДНУ краткую общую" in call["prompt"]
            # Test the exact independent modal after the user's prior complaint
            # that Apply was invisible at short browser heights.
            for width,height in [(950,446),(620,320)]:
                page.set_viewport_size({"width":width,"height":height})
                visible=page.evaluate("""() => {
                  const host=document.getElementById('stage391ReasonAIReview');
                  const dialog=host.querySelector('[role="dialog"]');
                  const footer=dialog.lastElementChild;
                  const b=footer.querySelector('[data-ai-preview-action="apply"]');
                  const r=b.getBoundingClientRect(),d=dialog.getBoundingClientRect();
                  return {inViewport:r.width>60&&r.height>30&&r.left>=0&&
                    r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,
                    dialogInViewport:d.top>=0&&d.bottom<=innerHeight+1,
                    text:b.textContent.trim()};
                }""")
                assert visible["inViewport"] and visible["dialogInViewport"],visible
            page.set_viewport_size({"width":1480,"height":980})
            close("cancel")
            assert page.evaluate("() => state.steps[0].reason")==initial
            start(one)
            close("apply")
            assert page.evaluate("() => state.steps[0].reason")==one

            # Existing manual/numerated Reasons can be restored only after
            # another explicit review. Key Point echoes are cleaned in the
            # proposed text, NOT in the SOP.
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
            start(multiple)
            while_before=page.evaluate("() => state.steps[0].reason")
            assert while_before==one
            text=page.locator(overlay).inner_text()
            assert "одна общая → 3" in text,text
            assert "Удалено точных повторов КМ" in text
            assert "Проверить штепсельную вилку" in text or "Выявить повреждение" in text
            close("apply")
            expected=("1. Выявить повреждение до использования.\n"
                      "2. Проверить состояние ввода кабеля.\n"
                      "3. Выявить трещины до начала работы.")
            assert page.evaluate("() => state.steps[0].reason")==expected
            assert page.evaluate("() => JSON.stringify(state.steps[0].keyMoments)")==page.evaluate(
                "() => window.reasonStarFixture.keyPoints")

            # Fail closed: duplicated/omitted numbers, invented engineering
            # figures, unsupported normative references, invented hazards.
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
                start(bad,expect_preview=False)
                assert page.evaluate("() => state.steps[0].reason")==before,bad

            # User edits after preview opened must invalidate the AI result.
            start(one)
            page.evaluate("() => {state.steps[0].reason='Исправлено инженером вручную.'}")
            close("apply")
            assert page.evaluate("() => state.steps[0].reason")=="Исправлено инженером вручную."

            # Published and archived documents are still read-only.
            page.evaluate("() => {state.documentManager.status='Опубликован';applyDocumentLock()}")
            page.evaluate("""async () => {
                const b=document.querySelector('[data-ai="reason"]');
                await aiFillField(b,'reason',state.steps[0].reason,
                    value=>{state.steps[0].reason=value});
            }""")
            assert page.locator(overlay).count()==0
            assert page.evaluate("() => state.steps[0].reason")=="Исправлено инженером вручную."
            assert not errors,errors
            print("PASS Stage39.1 ✨ Reason: one shared WHY default, explicit 3-to-1 preview, "+
                  "manual approval, exact KM cleanup, malformed list/figures/norms/hazards "+
                  "blocked, stale edit protected, readonly and compact footer",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    main()
