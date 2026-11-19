#!/usr/bin/env python3
"""Stage25 real Chrome file://: previews, safe SOP/FRV AI and old functional regression."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage25-ai-safe-replacement.html"

def previous_regression():
    spec=importlib.util.spec_from_file_location("stage25_previous",ROOT/"qa/stage24_browser_smoke.py")
    old=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    old.RELEASE=RELEASE
    old.main()

def tests_in_chrome():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
                                  args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1450,"height":930})
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            initial=page.evaluate(r"""() => {
              const s=createEmptyStep();
              s.action='Осмотреть корпус редуктора';
              s.reason='Защита оператора';
              s.durationSeconds=55;
              s.keyMoments=['Остановить перед осмотром'];
              s.successCriteria='Корпус не повреждён';
              s.photoHint='Фотография штатного состояния';
              s.imageData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3GQAAAAASUVORK5CYII=';
              s.hasPhoto=true;
              state.documentManager={currentId:'stage25-sop',status:'Черновик',version:1};
              state.meta.operation='Осмотр редуктора';
              state.meta.safety='Существующие меры СИЗ';
              state.description='Осмотреть оборудование до запуска';
              state.openQuestions=['Старый вопрос'];
              state.steps=[s];
              stateToHtml();
              window.__stage25Old=s;
              window.__stage25Sop={
                department:'Монтаж',safety:'Новые меры от ИИ',
                openQuestions:['Вопрос ИИ'],
                isoIconIds:[],
                steps:[{
                  action:'Отключить питание',keyMoments:['Проверить отключение'],
                  reason:'Не допустить опасного запуска',time:'00:30',
                  success_criteria:'Питание снято',decision_points:[],
                  common_pitfalls:[],visual_markers:[]
                }]
              };
              return {oldId:s.id,originalPhoto:s.imageData,
                originalSafety:state.meta.safety,originalCount:state.steps.length};
            }""")
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25Sop);
              window.__sopPending=generateSOP();
              return true;
            }""")
            page.wait_for_selector("#sopReplacementPreview",timeout=7000)
            assert page.locator("#sopReplacementPreview").get_by_text("фотографий").count()>=1
            page.locator('#sopReplacementPreview [data-ai-preview-action="cancel"]').click()
            page.evaluate("() => Promise.race([window.__sopPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('SOP confirmation did not settle')),7000))])")
            unchanged=page.evaluate("""() => ({
              same:state.steps[0]===window.__stage25Old,
              photo:state.steps[0].imageData===window.__stage25Old.imageData,
              count:state.steps.length===1,
              safety:state.meta.safety==='Существующие меры СИЗ',
              questions:state.openQuestions[0]==='Старый вопрос'
            })""")
            assert all(unchanged.values()),unchanged
            print('CHECK Stage25 SOP cancel OK',flush=True)

            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25Sop);
              window.__sopPending=generateSOP();
              return true;
            }""")
            page.wait_for_selector("#sopReplacementPreview",timeout=7000)
            page.locator('#sopReplacementPreview [data-ai-preview-action="append"]').click()
            page.evaluate("() => Promise.race([window.__sopPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('SOP confirmation did not settle')),7000))])")
            added=page.evaluate("""() => ({
              twoSteps:state.steps.length===2,
              oldStepPreserved:state.steps[0]===window.__stage25Old,
              photoPreserved:!!state.steps[0].imageData,
              newStep:state.steps[1].action==='Отключить питание',
              manualSafety:state.meta.safety==='Существующие меры СИЗ',
              questions:state.openQuestions.includes('Старый вопрос')&&state.openQuestions.includes('Вопрос ИИ')
            })""")
            assert all(added.values()),added
            print('CHECK Stage25 SOP append OK',flush=True)

            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25Sop);
              window.__sopPending=generateSOP();
              return true;
            }""")
            page.wait_for_selector("#sopReplacementPreview",timeout=7000)
            page.locator('#sopReplacementPreview [data-ai-preview-action="replace"]').click()
            page.evaluate("() => Promise.race([window.__sopPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('SOP confirmation did not settle')),7000))])")
            replaced=page.evaluate("""() => ({
              single:state.steps.length===1,
              newStep:state.steps[0].action==='Отключить питание',
              oldPhotoNotCarried:!state.steps[0].imageData,
              newSafety:state.meta.safety==='Новые меры от ИИ'
            })""")
            assert all(replaced.values()),replaced
            print('CHECK Stage25 SOP replace OK',flush=True)

            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25Sop);
              window.__sopPending=generateSOP();
              return true;
            }""")
            page.wait_for_selector("#sopReplacementPreview",timeout=7000)
            page.evaluate("""() => {
              state.steps[0].action='Правка пользователя во время предпросмотра';
              stateChanged();
            }""")
            page.locator('#sopReplacementPreview [data-ai-preview-action="append"]').click()
            page.evaluate("() => Promise.race([window.__sopPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('SOP confirmation did not settle')),7000))])")
            stale=page.evaluate("""() => state.steps.length===1&&
              state.steps[0].action==='Правка пользователя во время предпросмотра'""")
            assert stale,"A stale SOP preview overwrote user changes"

            first=page.evaluate("""async () => {
              state.steps=[];
              state.meta.operation='Новый СОП';
              state.description='Создать первый СОП';
              stateToHtml();
              aiAsk=async()=>JSON.stringify(window.__stage25Sop);
              await Promise.race([generateSOP(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('unexpected SOP preview')),7000))]);
              const ok=state.steps.length===1&&
                state.steps[0].action==='Отключить питание'&&
                !document.getElementById('sopReplacementPreview');
              const reference=state.steps[0];
              aiAsk=async()=>'{broken JSON';
              await Promise.race([generateSOP(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('unexpected SOP preview')),7000))]);
              return {initial:ok,invalidNonDestructive:state.steps.length===1&&state.steps[0]===reference};
            }""")
            assert all(first.values()),first
            print('CHECK Stage25 SOP initial/error OK',flush=True)

            frv=page.evaluate("""() => {
              state.description='Операция с фактическим замером';
              stateToHtml();
              state.frvStudy=null;
              const d=ensureFrvStudy();
              const o={...frvStudyEmptyObservation(1),
                actionRaw:'Измеренное действие',actionNormalized:'Измеренное действие',
                durationSec:42,comment:'Факт наблюдателя'};
              d.cycles=[{...frvStudyEmptyCycle(1),observations:[o]}];
              d.status='Validated';
              d.analysis={summary:'Подтверждённый анализ'};
              renderFrvStudy();
              window.__stage25FrvRef=o;
              window.__stage25FrvProposal={sequence:[{
                actionRaw:'Предложение ИИ',actionNormalized:'Новый шаг по описанию',
                durationSec:999,activityMode:'Manual',valueType:'VA'
              }]};
              return {cycles:d.cycles.length,seconds:o.durationSec,
                source:d.cycles[0].observations[0].actionRaw};
            }""")
            assert frv["seconds"]==42,frv
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25FrvProposal);
              window.__frvPending=frvStudyBuild();
              return true;
            }""")
            page.wait_for_selector("#frvBuildPreview",timeout=7000)
            page.locator('#frvBuildPreview [data-ai-preview-action="cancel"]').click()
            page.evaluate("() => Promise.race([window.__frvPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('FRV confirmation did not settle')),7000))])")
            frv_cancel=page.evaluate("""() => ({
              one:state.frvStudy.cycles.length===1,
              sameRef:state.frvStudy.cycles[0].observations[0]===window.__stage25FrvRef,
              seconds:state.frvStudy.cycles[0].observations[0].durationSec===42,
              status:state.frvStudy.status==='Validated'
            })""")
            assert all(frv_cancel.values()),frv_cancel
            print('CHECK Stage25 FRV cancel OK',flush=True)
            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25FrvProposal);
              window.__frvPending=frvStudyBuild();
              return true;
            }""")
            page.wait_for_selector("#frvBuildPreview",timeout=7000)
            page.locator('#frvBuildPreview [data-ai-preview-action="append"]').click()
            page.evaluate("() => Promise.race([window.__frvPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('FRV confirmation did not settle')),7000))])")
            frv_added=page.evaluate("""() => ({
              two:state.frvStudy.cycles.length===2,
              sameRef:state.frvStudy.cycles[0].observations[0]===window.__stage25FrvRef,
              oldSeconds:state.frvStudy.cycles[0].observations[0].durationSec===42,
              originalComment:state.frvStudy.cycles[0].observations[0].comment==='Факт наблюдателя',
              newAction:state.frvStudy.cycles[1].observations[0].actionRaw==='Предложение ИИ',
              notMeasured:state.frvStudy.cycles[1].observations[0].durationSec===null,
              analysisPreserved:state.frvStudy.analysis.summary==='Подтверждённый анализ',
              analysisMarked:state.frvStudy.analysisNeedsReview===true
            })""")
            assert all(frv_added.values()),frv_added
            print('CHECK Stage25 FRV append OK',flush=True)

            page.evaluate("""() => {
              aiAsk=async()=>JSON.stringify(window.__stage25FrvProposal);
              window.__frvPending=frvStudyBuild();
              return true;
            }""")
            page.wait_for_selector("#frvBuildPreview",timeout=7000)
            page.evaluate("""() => {
              state.frvStudy.cycles[0].observations[0].comment='Уточнение факта во время предпросмотра';
              renderFrvStudy();
            }""")
            page.locator('#frvBuildPreview [data-ai-preview-action="append"]').click()
            page.evaluate("() => Promise.race([window.__frvPending,new Promise((_,rej)=>setTimeout(()=>rej(new Error('FRV confirmation did not settle')),7000))])")
            frv_stale=page.evaluate("""() =>
              state.frvStudy.cycles.length===2&&
              state.frvStudy.cycles[0].observations[0].comment==='Уточнение факта во время предпросмотра'""")
            assert frv_stale,"Stale FRV proposal changed original observations"

            frv_first=page.evaluate("""async () => {
              state.frvStudy=null;
              const d=ensureFrvStudy();
              d.cycles=[frvStudyEmptyCycle(1)];
              renderFrvStudy();
              aiAsk=async()=>JSON.stringify(window.__stage25FrvProposal);
              await Promise.race([frvStudyBuild(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('unexpected FRV preview')),7000))]);
              const ok=d.cycles.length===1&&d.cycles[0].observations[0].actionRaw==='Предложение ИИ'
                &&d.cycles[0].observations[0].durationSec===null
                &&!document.getElementById('frvBuildPreview');
              const previous=d.cycles[0];
              aiAsk=async()=>'{invalid JSON';
              await Promise.race([frvStudyBuild(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('unexpected FRV preview')),7000))]);
              return {first:ok,invalidNonDestructive:d.cycles[0]===previous};
            }""")
            assert all(frv_first.values()),frv_first
            print('CHECK Stage25 FRV first/error OK',flush=True)

            messages=page.evaluate("""() => ({
              rate:aiErrorClassify(new Error('429 Too many requests')).kind==='rate_limit',
              timeout:aiErrorClassify(Object.assign(new Error('x'),{name:'AbortError'})).kind==='timeout',
              proxy:aiErrorClassify(new SyntaxError('Unexpected token')).kind==='proxy_json',
              invalid:aiErrorClassify(Object.assign(new Error('x'),{code:'AI_TASK_JSON_FORMAT'})).kind==='invalid_json'
            })""")
            assert all(messages.values()),messages
            assert not errors,errors
            print("PASS Stage25 Chrome file://: SOP cancel/append/replace/stale, FRV measured data preserved, first generation, bad AI JSON and error taxonomy",flush=True)
        finally:
            browser.close()

def main():
    previous_regression()
    tests_in_chrome()

if __name__=="__main__":
    main()
