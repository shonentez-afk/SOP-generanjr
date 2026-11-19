#!/usr/bin/env python3
"""Stage27 native Chrome file:// integration: old regression + AI assistant workflows."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage27-intelligent-assistant-browser-candidate.html"

def previous_regression():
    spec=importlib.util.spec_from_file_location("s27_previous",ROOT/"qa/stage26_browser_smoke.py")
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RELEASE=RELEASE
    module.main()

def check_assistant():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1510,"height":960})
        errors=[]
        page.on("pageerror",lambda err:errors.append(str(err)))
        page.on("dialog",lambda d:d.accept())
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.wait_for_selector("#stage27AssistantPanel",state="attached",timeout=8000)
            evidence=page.evaluate(r"""() => {
              const s=createEmptyStep();
              s.action='Осмотреть конвейер';
              s.keyMoments=['Проверить ограждение'];
              s.reason='Не допустить контакта с движущимися частями';
              s.durationSeconds=43;
              s.successCriteria='';
              s.hasPhoto=true;
              state.steps=[s];
              state.meta.operation='Осмотр конвейера';
              state.description='Оператор проверяет конвейер перед запуском';
              state.documentManager={currentId:'qa-s27-current',
                status:'Черновик',deptCode:'15',year:2026,seqNo:77,
                version:2,versionOf:'qa-s27-old'};
              state.openQuestions=[];
              state.stage27=stage27Empty();
              stateToHtml();stage27Render();
              window.__s27Calls=[];
              window.__s27DifferentQuestions=false;
              aiAsk=async (sys,user,opts)=>{
                window.__s27Calls.push(opts.task);
                const id=state.steps[0].id;
                if(opts.task==='stage27_questions' && window.__s27DifferentQuestions)
                  return JSON.stringify({questions:[{question:'Кто разрешает запуск после проверки оборудования?',stepId:id,why:'Требуется уточнение'}]});
                if(opts.task==='stage27_questions')return JSON.stringify({questions:[{
                  question:'Как убедиться в исправности ограждения?',
                  stepId:id,why:'Без критерия завершения СОП неполон'
                }]});
                if(opts.task==='stage27_proposals')return JSON.stringify({proposals:[{
                  stepId:id,questionId:'Q1',field:'successCriteria',oldValue:'',
                  newValue:'Ограждение закрыто, крепление исправно',
                  why:'Подтверждённый ответ инженера'
                }]});
                if(opts.task==='stage27_mentor')return JSON.stringify({issues:[{
                  stepId:id,severity:'question',description:'Не уточнена блокировка пуска оборудования',
                  evidence:'Перед запуском осмотреть конвейер',
                  suggestion:'Уточнить у ответственного инженера порядок проверки'
                }]});
                if(opts.task==='stage27_explain')return 'В документе есть осмотр, но не указан способ проверки блокировки. Уточните его у инженера.';
                if(opts.task==='review')return JSON.stringify({
                  issues:[],summary:'Штатная проверка СОП сохранена',overall_quality:'good'
                });
                if(opts.task==='stage27_analog')return JSON.stringify({
                  department:'',workplace:'',executor:'',safety:'',tools:'',material:'',
                  isoIconIds:[],openQuestions:['Какие ограничения у целевого конвейера?'],
                  steps:[{action:'Проверить тип нового конвейера',keyMoments:[],
                    reason:'',time:null,success_criteria:'',decision_points:[],
                    common_pitfalls:[],visual_markers:['Фото шильдика']}]
                });
                throw new Error('Unexpected AI task '+opts.task);
              };
              return {id:s.id,duration:s.durationSeconds,photo:s.hasPhoto,
                buttons:[...document.querySelectorAll('#stage27Actions [data-stage27-tab]')].length,
                integrated:document.getElementById('stage27AssistantPanel').parentElement.id==='sopReviewContainer',
                collapsed:document.getElementById('stage27AssistantPanel').hidden,
                alwaysVisible:[...document.querySelectorAll('#stage27Actions [data-stage27-tab]')].every(b=>{
                  const rect=b.getBoundingClientRect();
                  return rect.width>0&&rect.height>=32;
                }),
                matchedStyles:[...document.querySelectorAll('#stage27Actions button')].every(b=>
                  b.classList.contains('btn-ghost')&&b.classList.contains('rounded-lg')),
                noPopup:!document.getElementById('stage27AssistantToggle') &&
                  !document.querySelector('#stage27AssistantPanel [data-stage27-tab]'),
                adjacent:document.getElementById('stage27Actions').previousElementSibling
                  .contains(document.getElementById('reviewSopBtn')),
                mainActions:document.querySelectorAll('#generateSopBtn,#reviewSopBtn').length,
                model:AI_PROXY_BASE};
            }""")
            assert evidence["buttons"]==4,evidence
            assert evidence["integrated"] and evidence["collapsed"],evidence
            assert evidence["alwaysVisible"] and evidence["matchedStyles"],evidence
            assert evidence["noPopup"] and evidence["adjacent"],evidence
            assert evidence["mainActions"]==2,evidence
            page.locator('#stage27Actions [data-stage27-tab="clarify"]').click()
            assert page.locator("#stage27AssistantPanel").is_visible()
            assert page.locator("#sopReviewContainer").is_visible()
            assert page.locator('[data-stage27-tab="clarify"]').get_attribute('aria-pressed')=='true'
            # The visible action button toggles its inline result off without a popup.
            page.locator('#stage27Actions [data-stage27-tab="clarify"]').click()
            assert not page.locator("#stage27AssistantPanel").is_visible()
            assert page.locator('#stage27Actions [data-stage27-tab="clarify"]').is_visible()
            page.locator('#stage27Actions [data-stage27-tab="clarify"]').click()
            assert page.get_by_role("button",name="Проверить весь СОП").count()==1
            assert evidence["model"]=="https://functions.yandexcloud.net/d4ehdpoue3sve6s0f92b",evidence

            page.locator("#stage27AskBtn").click()
            page.wait_for_selector("#stage27QuestionsArea textarea",timeout=7000)
            page.locator("#stage27QuestionsArea textarea").fill(
                "Ограждение закрыто, крепление исправно")
            page.locator('[data-stage27-confirm="Q1"]').click()
            assert page.evaluate("() => state.stage27.questions[0].confirmed")
            page.evaluate("() => window.__s27DifferentQuestions=true")
            page.locator("#stage27AskBtn").click()
            page.wait_for_function("() => state.stage27.questions.length===2",timeout=7000)
            assert page.evaluate("() => state.stage27.questions[0].confirmed && state.stage27.questions[0].answer==='Ограждение закрыто, крепление исправно'")
            page.locator("#stage27SuggestBtn").click()
            page.wait_for_selector("[data-stage27-suggestion]",timeout=7000)
            assert not page.evaluate("() => !!state.steps[0].successCriteria")
            page.locator("[data-stage27-suggestion]").check()
            page.locator("#stage27ApplySuggestionsBtn").click()
            page.evaluate("() => saveDraft()")
            applied=page.evaluate("""() => ({
              result:state.steps[0].successCriteria,
              time:state.steps[0].durationSeconds,
              photo:state.steps[0].hasPhoto,
              facts:docSnapshot().stage27.questions[0].confirmed,
              draft:JSON.parse(localStorage.getItem(DRAFT_KEY)).stage27.questions[0].confirmed
            })""")
            assert applied["result"]=="Ограждение закрыто, крепление исправно",applied
            assert applied["time"]==43 and applied["photo"],applied
            assert applied["facts"] and applied["draft"],applied

            # No in-flight changes allowed, plus stale proposals cannot overwrite manual edits.
            page.evaluate("() => {state.steps[0].successCriteria='';stateChanged();stage27Render();}")
            page.locator("#stage27SuggestBtn").click()
            page.wait_for_selector("[data-stage27-suggestion]",timeout=7000)
            page.evaluate("() => {state.steps[0].action='Новая ручная редакция';}")
            page.locator("[data-stage27-suggestion]").check()
            page.locator("#stage27ApplySuggestionsBtn").click()
            assert page.evaluate("() => state.steps[0].successCriteria===''")
            assert page.evaluate("() => state.steps[0].durationSeconds===43")

            page.locator('[data-stage27-tab="mentor"]').click()
            page.locator("#stage27MentorBtn").click()
            page.wait_for_selector("[data-stage27-explain]",timeout=7000)
            page.locator("[data-stage27-explain]").click()
            page.wait_for_function("() => !!state.stage27.mentor[0].explanation",timeout=7000)
            assert page.evaluate("() => state.stage27.mentor[0].explanation.includes('блокировки')")
            page.locator("#reviewSopBtn").click()
            page.wait_for_function("() => !!reviewSummary && reviewSummary.summary==='Штатная проверка СОП сохранена'",timeout=7000)
            assert page.locator("#sopReviewSummary").is_visible()
            assert page.locator("#stage27AssistantPanel").is_visible()
            assert page.evaluate("() => document.getElementById('stage27AssistantPanel').parentElement.id==='sopReviewContainer'")
            # Existing review rerenders must not replace the Stage27 toolbar.
            page.evaluate("() => renderReviewResults(reviewSummary)")
            assert page.locator("#stage27AssistantPanel").is_visible()
            assert page.locator("#stage27MentorResults").is_visible()
            assert page.locator("#stage27AssistantToggle").count()==0
            assert page.locator("#stage27Actions [data-stage27-tab]").count()==4
            assert page.locator('[data-stage27-tab="mentor"]').get_attribute("aria-pressed")=="true"

            page.evaluate(r"""async () => {
              const s=state.steps[0];
              const old={id:'qa-s27-old',status:'Опубликован',title:'Осмотр конвейера (v1)',
                number:'15.77.2026 1',seqNo:77,deptCode:'15',year:2026,version:1,
                snapshot:{meta:{operation:'Осмотр конвейера',safety:'Проверка'},
                  description:'Предыдущая инструкция',
                  steps:[{...s,action:'Осмотреть конвейер',durationSeconds:21,
                    hasPhoto:false}],openQuestions:[]}};
              const example={id:'qa-s27-analog',status:'Опубликован',
                title:'Осмотр конвейера другого типа',
                number:'15.89.2026 1',seqNo:89,deptCode:'15',year:2026,version:1,
                snapshot:{meta:{operation:'Осмотр конвейера'},
                  description:'Проверка ленточного конвейера',
                  steps:[{id:999,action:'Осмотреть ленточный конвейер',
                    keyMoments:['Проверить ограждение'],durationSeconds:99}]}};
              const draft={...example,id:'qa-s27-not-approved',status:'Черновик'};
              await docDbPut(old);await docDbPut(example);await docDbPut(draft);
            }""")
            page.locator('[data-stage27-tab="analog"]').click()
            page.locator("#stage27AnalogQuery").fill("осмотр конвейера")
            page.locator("#stage27FindAnalogs").click()
            page.wait_for_selector('[data-stage27-select-analog="qa-s27-analog"]',timeout=7000)
            assert page.locator('[data-stage27-select-analog="qa-s27-not-approved"]').count()==0
            page.locator('[data-stage27-select-analog="qa-s27-analog"]').click()
            page.locator("#stage27AnalogDifferences").fill("Конвейер другого типа; параметры неизвестны")
            original_length=page.evaluate("() => state.steps.length")
            page.locator("#stage27MakeAnalogBtn").click()
            page.wait_for_selector("#sopReplacementPreview",timeout=7000)
            page.locator('#sopReplacementPreview [data-ai-preview-action="cancel"]').click()
            page.wait_for_function("() => !document.getElementById('sopReplacementPreview')",timeout=7000)
            assert page.evaluate("() => state.steps.length")==original_length
            page.locator("#stage27MakeAnalogBtn").click()
            page.wait_for_selector("#sopReplacementPreview",timeout=7000)
            page.locator('#sopReplacementPreview [data-ai-preview-action="append"]').click()
            page.wait_for_function("() => state.steps.length===2",timeout=7000)
            analog=page.evaluate("""() => ({
              source:state.stage27.analogSource.id,
              oldTime:state.steps[0].durationSeconds,
              oldPhoto:state.steps[0].hasPhoto,
              newTime:state.steps[1].durationSeconds,
              newPhoto:!!state.steps[1].imageData,
              openQuestions:state.openQuestions.length
            })""")
            assert analog["source"]=="qa-s27-analog",analog
            assert analog["oldTime"]==43 and analog["oldPhoto"],analog
            assert analog["newTime"]==0 and not analog["newPhoto"],analog
            assert analog["openQuestions"]>0,analog

            page.locator('[data-stage27-tab="changes"]').click()
            page.locator("#stage27HistoryRefresh").click()
            page.wait_for_function("() => [...document.querySelectorAll('#stage27HistorySelect option')].some(o => o.value==='qa-s27-old')",timeout=7000)
            page.select_option("#stage27HistorySelect","qa-s27-old")
            page.locator("#stage27HistoryCompare").click()
            diff=page.locator("#stage27HistoryDiff").inner_text()
            assert "Изменений:" in diff,diff
            assert "Проверить TWI" in diff,diff
            assert "ФРВ" in diff,diff
            assert page.locator('[data-stage27-tab="changes"]').get_attribute("aria-pressed")=="true"
            page.locator('#closeReviewBtn').click()
            assert not page.locator('#stage27AssistantPanel').is_visible()
            assert page.locator('#stage27Actions [data-stage27-tab="changes"]').is_visible()
            page.locator('#stage27Actions [data-stage27-tab="changes"]').click()
            assert page.locator('#stage27AssistantPanel').is_visible()
            assert page.locator('[data-stage27-tab="changes"]').get_attribute("aria-pressed")=="true"
            calls=page.evaluate("() => window.__s27Calls")
            assert set(("stage27_questions","stage27_proposals","stage27_mentor",
                        "stage27_explain","stage27_analog")).issubset(set(calls)),calls
            assert not errors,errors
            print("PASS Stage27 offline Chrome: questions/facts, manual selection, stale guard, mentor, published analog, cancellation, diff, persistence; AI calls mocked",flush=True)
        finally:
            browser.close()

def main():
    print("CHECK Stage27: Stage26 full browser regression",flush=True)
    previous_regression()
    print("CHECK Stage27: intelligent assistant",flush=True)
    check_assistant()

if __name__=="__main__":main()
