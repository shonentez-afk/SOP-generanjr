#!/usr/bin/env python3
"""Stage29: full old Chrome tests plus grounded real SOP/TWI UI flows; AI mocked."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage29-sop-twi-quality-browser-candidate.html"

def existing_regression():
    spec=importlib.util.spec_from_file_location("stage28_on_stage29",
        ROOT/"qa/stage28_browser_smoke.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def quality_acceptance():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1460,"height":960})
        errors=[]
        page.on("pageerror",lambda x:errors.append(str(x)))
        page.on("dialog",lambda d:d.accept())
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.wait_for_selector("#generateSopBtn",timeout=9000)
            page.evaluate(r"""() => {
              state.documentManager={currentId:'stage29-qa',status:'Черновик',version:1};
              state.meta.operation='Проверка конвейера';
              state.meta.safety='Не выполнять запуск с открытым кожухом';
              state.description='Осмотреть защитный кожух, закрыть замок. Контроль 40 секунд.';
              state.steps=[];state.openQuestions=[];
              state.frvStudy={version:1,cycles:[],qualityFlag:'Не трогать ФРВ'};
              state.twi={enabled:false,trainer:'Наставник',trainee:'Оператор',
                prepare:{},present:{},tryOut:{},followUp:{}};
              stateToHtml();
              window.__stage29Calls=[];
              window.__stage29Response=null;
              aiAsk=async (system,user,opts)=>{
                window.__stage29Calls.push({task:opts.task,system,user});
                return JSON.stringify(window.__stage29Response);
              };
              window.__stage29Sop={
                department:'',workplace:'',executor:'',safety:'',tools:'',material:'',
                isoIconIds:[],openQuestions:[],
                steps:[
                  {action:'Осмотреть защитный кожух',
                    keyMoments:['Проверить целостность','Проверить целостность'],
                    reason:'Исключить повреждение',time:'00:40',
                    success_criteria:'Кожух цел',decision_points:[],
                    common_pitfalls:[],visual_markers:[]},
                  {action:'Закрыть замок',keyMoments:[],
                    reason:'',time:null,success_criteria:'Замок закрыт',
                    decision_points:[],common_pitfalls:[],visual_markers:[]}
                ]
              };
              window.__stage29Twi={
                prepare:{purpose:'Научить проверять кожух',known:'Уточнить опыт',
                  prep:'Показать рабочее место',interest:'Безопасная проверка'},
                present:{round1:'Показать процесс',round2:'Делать всё правильно',
                  round3:'Следовать инструкции'},
                tryOut:{perform:'Повторить действия',explain:'Объяснить их',
                  check:'Общая проверка',correct:'Исправить ошибку'},
                followUp:{help:'Наставник',control:'Наблюдать первые самостоятельные работы',
                  observe:'Отслеживать результат',close:'Завершить обучение'}
              };
            }""")
            page.evaluate("async () => {window.__stage29Response=window.__stage29Sop;await generateSOP();}")
            sop=page.evaluate("""() => ({
              count:state.steps.length,time:state.steps[0]?.durationSeconds,
              keyPoints:state.steps[0]?.keyMoments.filter(Boolean),
              secondKeyPoints:state.steps[1]?.keyMoments.filter(Boolean),
              questions:state.openQuestions,
              frv:state.frvStudy.qualityFlag,
              call:window.__stage29Calls[0]
            })""")
            assert sop["count"]==2 and sop["time"]==40,sop
            assert len(sop["keyPoints"])==1 and not sop["secondKeyPoints"],sop
            assert sop["frv"]=="Не трогать ФРВ",sop
            assert sop["call"]["task"]=="generate_sop",sop
            assert "QUALITY GATE STAGE 29" in sop["call"]["system"],sop
            assert "safety" in sop["call"]["user"],sop
            page.evaluate("async () => {window.__stage29Response=window.__stage29Twi;await generateTwiPlan();}")
            twi=page.evaluate("""() => ({
              source:state.twi.sourceSignature,
              round1:state.twi.present.round1,
              round2:state.twi.present.round2,
              round3:state.twi.present.round3,
              check:state.twi.tryOut.check,
              trained:state.twi.trainer,trainee:state.twi.trainee,
              frv:state.frvStudy.qualityFlag,
              calls:window.__stage29Calls.length,
              modelPrompt:window.__stage29Calls[1].system
            })""")
            assert twi["round1"].find("1. Осмотреть защитный кожух")>=0,twi
            assert twi["round1"].find("2. Закрыть замок")>=0,twi
            assert "Проверить целостность" in twi["round2"],twi
            assert "Делать всё правильно" not in twi["round2"],twi
            assert "Исключить повреждение" in twi["round3"],twi
            assert "Кожух цел" in twi["check"] and "Замок закрыт" in twi["check"],twi
            assert twi["trained"]=="Наставник" and twi["trainee"]=="Оператор",twi
            assert twi["frv"]=="Не трогать ФРВ" and twi["calls"]==2,twi
            assert "QUALITY GATE STAGE 29" in twi["modelPrompt"],twi

            page.evaluate("""() => {
              state.twi.prepare.purpose='Моя ручная цель';
              twiToHtml();
              window.__stage29Response={
                ...window.__stage29Twi,
                prepare:{...window.__stage29Twi.prepare,purpose:'Новая цель генератора'}
              };
              window.__s29Before=JSON.stringify(state.twi);
              window.__s29Pending=generateTwiPlan();
            }""")
            page.wait_for_selector("#twiGenerationPreview",timeout=8000)
            rows=page.locator("#twiGenerationPreview [data-twi-changes] > div")
            purpose=rows.filter(has_text="Цель обучения")
            assert purpose.count()==1 and not purpose.locator("input").is_checked()
            page.locator("[data-twi-preview-cancel]").click()
            page.evaluate("() => window.__s29Pending")
            assert page.evaluate("() => JSON.stringify(state.twi)===window.__s29Before")

            # Invented numeric facts fail closed without replacing confirmed SOP.
            page.evaluate("""async () => {
              const bad=JSON.parse(JSON.stringify(window.__stage29Sop));
              bad.steps[0].keyMoments=['Подать давление 500 бар'];
              window.__stage29Response=bad;
              window.__s29Keep=state.steps[0];
              await generateSOP();
            }""")
            assert page.locator("#sopReplacementPreview").count()==0
            assert page.evaluate("() => state.steps[0]===window.__s29Keep")

            # Invented time alone is discarded; the proposal stays usable.
            page.evaluate("""async () => {
              state.steps=[];state.openQuestions=[];
              state.description='Осмотреть защитный кожух, закрыть замок.';
              stateToHtml();
              window.__stage29Response=window.__stage29Sop;
              await generateSOP();
            }""")
            no_time=page.evaluate("""() => ({
              time:state.steps[0]?.durationSeconds,
              questions:state.openQuestions,
              count:state.steps.length
            })""")
            assert no_time["count"]==2 and no_time["time"]==0,no_time
            assert any("длительность шага 1" in q for q in no_time["questions"]),no_time

            # Invented follow-up cadence must NOT overwrite the plan.
            page.evaluate("""async () => {
              const old=JSON.stringify(state.twi);
              window.__stage29BadTwi={...window.__stage29Twi,
                followUp:{...window.__stage29Twi.followUp,control:'Через 987 дней'}};
              window.__stage29Response=window.__stage29BadTwi;
              await generateTwiPlan();
              window.__s29CadenceSafe=JSON.stringify(state.twi)===old;
            }""")
            assert page.evaluate("() => window.__s29CadenceSafe")
            assert page.locator("#twiGenerationPreview").count()==0
            assert page.locator("#stage27Actions [data-stage27-tab]").count()==4
            assert not errors,errors
            print("PASS Stage29 Chrome: SOP actual/unsupported numbers, unknown time, TWI full source steps, protected manual edits, no invented cadence, no FRV changes",flush=True)
        finally:
            browser.close()

def main():
    existing_regression()
    quality_acceptance()

if __name__=="__main__":
    main()
