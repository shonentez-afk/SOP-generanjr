#!/usr/bin/env python3
"""Stage24 Chrome file://: current SOP -> automatic TWI -> safe selective regeneration."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage24-a3-a4-twi-protected.html"

def previous_regressions():
    f=ROOT/"qa/stage23_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage24_previous_browser",f)
    suite=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(suite)
    suite.RELEASE=RELEASE
    suite.main()

def current_twi_in_chrome():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
                                  args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1450,"height":960})
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("dialog",lambda d:d.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            first=page.evaluate(r"""async () => {
              const s=createEmptyStep();
              s.action='Проверить блокировку';
              s.reason='Предотвратить опасный запуск';
              s.keyMoments=['Проверить закрытие'];
              s.successCriteria='Замок закрыт';s.durationSeconds=65;
              state.documentManager={currentId:'stage24-sop',status:'Черновик',version:1};
              state.meta.operation='Проверка блокировки';
              state.meta.executor='Оператор';
              state.description='Проверка перед работой';
              state.steps=[s];
              state.twi={enabled:false,prepare:{},present:{},tryOut:{},followUp:{}};
              stateToHtml();
              $('twi-trainer').value='Наставник Мария';
              $('twi-trainee').value='Сотрудник Иван';
              htmlToTwi();
              window.__stage24First={
                prepare:{purpose:'Проверять перед запуском',known:'Базовые знания',prep:'Проверить место',interest:'Безопасность работы'},
                present:{round1:'Показ',round2:'Проверить замок',round3:'Почему замок важен'},
                tryOut:{perform:'Повторить',explain:'Объяснить',check:'Проверить закрытие',correct:'Исправить'},
                followUp:{help:'Спросить наставника',control:'Каждую смену',observe:'Наблюдать',close:'Завершить'}
              };
              aiAsk=async()=>JSON.stringify(window.__stage24First);
              await generateTwiPlan();
              const generated=state.twi.prepare.purpose==='Проверять перед запуском'
                &&!!state.twi.generatedBaseline
                &&state.twi.trainer==='Наставник Мария'
                &&state.twi.trainee==='Сотрудник Иван'
                &&!document.getElementById('twiGenerationPreview');
              const persisted=JSON.parse(localStorage.getItem(DRAFT_KEY));
              const saved=!!persisted.twi?.generatedBaseline?.prepare?.purpose;
              const snapshot=docSnapshot();
              const inLibrary=!!snapshot.twi?.generatedBaseline?.present?.round2;
              $('twi-purpose').value='Моя ручная формулировка';
              $('twi-purpose').dispatchEvent(new Event('input',{bubbles:true}));
              $('twi-check').value='Мой критерий для обучаемого';
              $('twi-check').dispatchEvent(new Event('input',{bubbles:true}));
              const manualPreserved=state.twi.prepare.purpose==='Моя ручная формулировка'
                &&state.twi.generatedBaseline.prepare.purpose==='Проверять перед запуском'
                &&twiManualCount(state.twi)===2
                &&!!document.querySelector('[data-twi-manual-count]');
              const signature=state.twi.sourceSignature;
              state.steps[0].reason='Уточнённая причина';
              stateChanged();
              const staleFlag=state.twi.sourceSignature===signature
                &&!!document.querySelector('[data-twi-outdated]');
              window.__stage24Second={
                prepare:{...window.__stage24First.prepare,
                  purpose:'Новая цель от ИИ',known:'Обновлённые знания'},
                present:{...window.__stage24First.present,round2:'Новые ключевые моменты'},
                tryOut:{...window.__stage24First.tryOut,check:'Новый контроль ИИ'},
                followUp:{...window.__stage24First.followUp,help:''}
              };
              return {generated,persisted:saved,library:inLibrary,manualPreserved,staleFlag,
                domIntegrity:['twi-help','twi-frequency','twi-observe','twi-close'].every(id=>!!$(id)),
                debug:JSON.stringify({purpose:state.twi.prepare?.purpose,check:state.twi.tryOut?.check,
                  baselinePurpose:state.twi.generatedBaseline?.prepare?.purpose,manualCount:twiManualCount(state.twi),
                  marker:!!document.querySelector('[data-twi-manual-count]'),
                  domPurpose:$('twi-purpose')?.value,domCheck:$('twi-check')?.value,
                  differing:TWI_GENERATED_FIELDS.filter(e=>twiGetText(state.twi,e)!==twiGetText(state.twi.generatedBaseline,e))
                    .map(e=>({id:twiFieldId(e),current:twiGetText(state.twi,e),baseline:twiGetText(state.twi.generatedBaseline,e)}))})};
            }""")
            assert all(v for k,v in first.items() if k!='debug'),first
            initial=page.evaluate("() => JSON.stringify(state.twi)")
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage24Second);
              window.__stage24Pending=generateTwiPlan();
              return true;
            }""")
            page.wait_for_selector("#twiGenerationPreview",timeout=7000)
            rows=page.locator("#twiGenerationPreview [data-twi-changes] > div")
            purpose=rows.filter(has_text="Цель обучения")
            knowledge=rows.filter(has_text="Опыт обучаемого")
            clearing=rows.filter(has_text="Куда обращаться за помощью")
            assert purpose.count()==1 and not purpose.locator('input').is_checked()
            assert knowledge.count()==1 and knowledge.locator('input').is_checked()
            assert clearing.count()==1 and not clearing.locator('input').is_checked()
            page.locator("[data-twi-preview-cancel]").click()
            page.evaluate("() => window.__stage24Pending")
            assert page.locator("#twiGenerationPreview").count()==0
            after_cancel=page.evaluate("() => JSON.stringify(state.twi)")
            assert initial==after_cancel,"Cancel changed the current plan"

            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage24Second);
              window.__stage24Pending=generateTwiPlan();
              return true;
            }""")
            page.wait_for_selector("#twiGenerationPreview",timeout=7000)
            page.locator("[data-twi-preview-apply]").click()
            page.evaluate("() => window.__stage24Pending")
            selected=page.evaluate(r"""() => {
              const t=state.twi;
              return {
                purpose:t.prepare.purpose==='Моя ручная формулировка',
                check:t.tryOut.check==='Мой критерий для обучаемого',
                knowledge:t.prepare.known==='Обновлённые знания',
                keyPoints:t.present.round2==='Новые ключевые моменты',
                noClear:t.followUp.help==='Спросить наставника',
                trainer:t.trainer==='Наставник Мария',
                trainee:t.trainee==='Сотрудник Иван',
                reviewed:!document.querySelector('[data-twi-outdated]'),
                manualCount:twiManualCount(t)>=2
              };
            }""")
            assert all(selected.values()),selected
            good=page.evaluate("() => JSON.stringify(state.twi)")

            for malformed in ["{not json", '{}', '{"prepare":{"purpose":"Only one stage"}}']:
                page.evaluate("""raw => {
                  aiAsk=async()=>raw;
                  return generateTwiPlan();
                }""",malformed)
                assert page.locator("#twiGenerationPreview").count()==0
                assert page.evaluate("() => JSON.stringify(state.twi)")==good,malformed

            page.evaluate("""() => {
              window.__stage24Third={
                ...window.__stage24Second,
                prepare:{...window.__stage24Second.prepare,purpose:'Новое утверждённое предложение'},
                present:{...window.__stage24Second.present,round2:'Проверить другое место'}
              };
              aiAsk=async()=>JSON.stringify(window.__stage24Third);
              window.__stage24Pending=generateTwiPlan();
              return true;
            }""")
            page.wait_for_selector("#twiGenerationPreview",timeout=7000)
            page.evaluate("""() => {
              state.steps[0].reason='Изменение СОП во время открытого предпросмотра';
              stateChanged();
            }""")
            page.locator("[data-twi-preview-apply]").click()
            page.evaluate("() => window.__stage24Pending")
            assert page.evaluate("() => JSON.stringify(state.twi)")==good, "Stale modal changed current plan"

            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage24Third);
              window.__stage24Pending=generateTwiPlan();
              return true;
            }""")
            page.wait_for_selector("#twiGenerationPreview",timeout=7000)
            purpose=page.locator("#twiGenerationPreview [data-twi-changes] > div").filter(has_text="Цель обучения")
            assert not purpose.locator('input').is_checked()
            purpose.locator('input').check()
            page.locator("[data-twi-preview-apply]").click()
            page.evaluate("() => window.__stage24Pending")
            override=page.evaluate("""() => ({
              changed:state.twi.prepare.purpose==='Новое утверждённое предложение',
              othersPreserved:state.twi.tryOut.check==='Мой критерий для обучаемого',
              trainerPreserved:state.twi.trainer==='Наставник Мария',
              sourceUpdated:state.twi.sourceSignature===twiSourceSignature()
            })""")
            assert all(override.values()),override
            assert not errors,errors
            print("PASS Stage24 Chrome file://: first SOP->TWI, provenance, preview, cancel, selective merge, broken JSON and stale SOP",flush=True)
        finally:
            browser.close()

def main():
    previous_regressions()
    current_twi_in_chrome()

if __name__=="__main__":
    main()
