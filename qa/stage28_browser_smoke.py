#!/usr/bin/env python3
"""Stage28: real Chrome file:// unified mentor, proof, scoped refresh, no destruction."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage28-evidence-mentor-browser-candidate.html"

def previous_regression():
    p=ROOT/"qa/stage26_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage26_regression_on_stage28",p)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def mentor_acceptance():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
            args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1500,"height":1000})
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("dialog",lambda d:d.accept())
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.wait_for_selector("#stage27Actions",timeout=10000)
            context=page.evaluate(r"""() => {
              const steps=[];
              for(let i=0;i<4;i++){
                const s=createEmptyStep();
                s.action=['Осмотреть ограждение','Закрыть защитный кожух',
                  'Проверить кнопку','Запустить установку'][i];
                s.reason='Подтвердить готовность перед запуском';
                s.successCriteria='Контроль выполнен';
                s.durationSeconds=33+i;
                s.keyMoments=i===1?['Проверить защёлку']:[];
                if(i===0){s.visualMarkers=['Табличка на двери'];s.hasPhoto=true;}
                if(i===1)s.visualMarkers=['Снимок защёлки'];
                steps.push(s);
              }
              state.steps=steps;
              state.description='Контроль оборудования перед запуском';
              state.meta.operation='Осмотр перед запуском';
              state.meta.safety='Не начинать без разрешения мастера';
              state.documentManager={status:'Черновик',currentId:'stage28-qa',version:1};
              state.stage27=stage27Empty();
              restoreSopReviewState(null);
              stateToHtml();stage27Render();
              window.__stage28Calls=[];
              aiAsk=async (sys,user,opts)=>{
                window.__stage28Calls.push({task:opts.task,payload:user});
                if(opts.task==='review'){
                  const data=JSON.parse(user);
                  const issues=[{
                    stepId:2,severity:'improvement',type:'incomplete',field:'action',
                    description:'Нужно уточнить фиксацию защитного кожуха',
                    why:'Для наблюдаемого критерия',
                    suggestion:'Уточнить, как проверить защёлку',
                    fixValue:'Проверить фиксацию защитного кожуха',
                    evidence:{field:'action',quote:data.steps.find(s=>s.stepNumber===2)?.action||''}
                  }];
                  if(data.focusStepNumbers.length===4)issues.push({
                    stepId:4,severity:'safety_gap',type:'contradiction',field:'action',
                    description:'Вымышленное нормативное требование',
                    why:'Неподтверждённый вывод модели',
                    suggestion:'Требуется подтверждение инженера',
                    fixValue:'Изменить время на выдуманное',
                    evidence:{field:'action',quote:'несуществующий ГОСТ'}
                  });
                  return JSON.stringify({
                    issues,summary:'Проверка действий и причин',overall_quality:'good'
                  });
                }
                if(opts.task==='stage27_explain')return 'Данный вывод нужно сопоставить с действием и подтвердить у инженера.';
                throw new Error('Unexpected AI task: '+opts.task);
              };
              return {ids:steps.map(s=>s.id),base:steps.map(s=>s.durationSeconds),
                model:AI_PROXY_BASE,
                actions:document.querySelectorAll('#stage27Actions [data-stage27-tab]').length};
            }""")
            assert context["actions"]==4 and context["model"].endswith("d4ehdpoue3sve6s0f92b"),context
            assert page.locator("#stage27AssistantToggle").count()==0
            # Main full check performs exactly one AI call with valid evidence.
            page.locator("#reviewSopBtn").click()
            page.wait_for_function("() => stage28ReviewMeta.aiComplete",timeout=8000)
            assert page.evaluate("() => window.__stage28Calls.length") == 1
            evidence=page.evaluate("""() => ({
              verified:reviewIssues.find(x=>x.stepId===2&&x.reviewOrigin==='ai')?.evidenceVerified,
              invented:reviewIssues.find(x=>x.stepId===4&&x.reviewOrigin==='ai'),
              status:stage28ReviewMeta.lastMode,
              text:document.getElementById('sopReviewIssues').innerText,
              photo:document.getElementById('sopReviewSummary').innerText
            })""")
            assert evidence["verified"],evidence
            assert evidence["invented"]["severity"]=="question",evidence
            assert evidence["invented"]["fixValue"] is None,evidence
            assert "Гипотеза" in evidence["text"] or "Требует уточнения" in evidence["text"],evidence
            assert "Фото по текстовым подсказкам" in evidence["photo"],evidence
            # The Logic action must reuse the *same* review, not bill another full AI call.
            page.locator('#stage27Actions [data-stage27-tab="mentor"]').click()
            page.locator("#stage27MentorBtn").click()
            page.wait_for_function("() => state.stage27.mentor.length>0",timeout=7000)
            assert page.evaluate("() => window.__stage28Calls.length")==1
            assert page.locator("#stage27MentorResults").is_visible()
            page.locator("[data-stage27-explain]").first.click()
            page.wait_for_function("() => state.stage27.mentor.some(x=>!!x.explanation)",timeout=7000)
            assert page.evaluate("() => window.__stage28Calls.filter(x=>x.task==='stage27_explain').length")==1
            # Save genuine discussion; incremental check must retain unaffected step 4.
            page.evaluate("""() => {
              const x=reviewIssues.find(i=>i.stepId===4&&i.reviewOrigin==='ai');
              x.thread=[{role:'user',text:'Проверено на объекте'}];
              x.status='withdrawn';
              state.steps[1].action='Закрыть защитный кожух до щелчка';
              stateChanged();stage28UpdateReviewIndicator();
            }""")
            assert page.locator("#stage28CheckChanged").is_enabled()
            page.locator("#stage28CheckChanged").click()
            page.wait_for_function("() => stage28ReviewMeta.lastMode==='changed'",timeout=8000)
            focus=page.evaluate("""() => ({
              calls:window.__stage28Calls.filter(x=>x.task==='review').length,
              focus:JSON.parse(window.__stage28Calls.filter(x=>x.task==='review').at(-1).payload).focusStepNumbers,
              retained:reviewIssues.find(i=>i.stepId===4&&i.reviewOrigin==='ai'),
              changes:stage28CurrentDiff().changed,
              times:state.steps.map(x=>x.durationSeconds)
            })""")
            assert focus["calls"]==2,focus
            assert focus["focus"]==[1,2,3],focus
            assert focus["retained"]["thread"][0]["text"]=="Проверено на объекте",focus
            assert focus["retained"]["status"]=="withdrawn",focus
            assert focus["changes"]==[],focus
            assert focus["times"]==context["base"],focus
            # Document-wide changes force a full review; never silently reuse stale assumptions.
            page.evaluate("""() => {
              state.meta.safety='Новое указание по безопасности — проверить с инженером';
              stateToHtml();
              stage28UpdateReviewIndicator();
            }""")
            assert "Проверить весь СОП" in page.locator("#stage28CheckChanged").inner_text()
            page.locator("#stage28CheckChanged").click()
            page.wait_for_function("() => stage28ReviewMeta.lastMode==='full' && window.__stage28Calls.filter(x=>x.task==='review').length===3",timeout=8000)
            snap=page.evaluate("""() => {
              saveDraft();
              const d=JSON.parse(localStorage.getItem(DRAFT_KEY));
              const doc=docSnapshot();
              return {draft:d.reviewState.reviewMeta,
                snapshot:doc.reviewState.reviewMeta,
                evidence:doc.reviewState.issues.some(i=>i.evidenceSource),
                photos:state.steps.map(s=>!!s.hasPhoto)};
            }""")
            assert snap["draft"]["aiComplete"] and len(snap["draft"]["stepSignatures"])==4,snap
            assert snap["snapshot"]["aiComplete"] and snap["evidence"],snap
            assert snap["photos"]==[True,False,False,False],snap
            assert not errors,errors
            print("PASS Stage28 Chrome: one unified mentor call, evidence provenance, no invented norms, photo guidance, scoped refresh, dialogue persistence, full fallback, draft/library",flush=True)
        finally:
            browser.close()

def main():
    previous_regression()
    mentor_acceptance()

if __name__=="__main__":
    main()
