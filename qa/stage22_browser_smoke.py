#!/usr/bin/env python3
"""Stage22 A3.1: real Chrome file:// and deferred/mock AI replies (no live proxy)."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage22-a3-ai-guard.html"

def run_previous():
    f=ROOT/"qa/stage21_browser_smoke.py"
    spec=importlib.util.spec_from_file_location("stage22_previous_browser",f)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def check_mock_ai():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",
                                  args=["--no-sandbox","--disable-dev-shm-usage"])
        page=browser.new_page(viewport={"width":1365,"height":920})
        errors=[]
        page.on("pageerror",lambda exc:errors.append(str(exc)))
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        page.on("dialog",lambda d:d.accept())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            result=page.evaluate(r"""async () => {
              const assert=(v,name)=>{if(!v)throw new Error('Stage22 Chrome: '+name)};
              const setSop=(operation,id)=>{
                const s=createEmptyStep();
                s.action='Осмотреть ограждение';s.keyMoments=['Замок должен быть закрыт'];
                s.reason='Исключить опасное движение';s.durationSeconds=30;
                state.documentManager={currentId:id,status:'Черновик',version:1};
                state.meta.operation=operation;
                state.description='Проверить ограждение до запуска';
                state.steps=[s];
                stateToHtml();
                return s;
              };
              const makeDoc=(id,operation)=>({
                id,status:'Черновик',version:1,
                snapshot:{meta:{operation},description:'Новая версия процесса',
                  steps:[{id:201,action:'Проверить тормоз',keyMoments:['Визуально'],
                    reason:'Контроль безопасности',durationSeconds:25}],reviewState:{
                    issues:[],summary:null,deferredIssueKeys:[]}}
              });
              const twi1={prepare:{purpose:'Обучить проверке'},present:{round1:'1',round2:'2',round3:'3'},
                tryOut:{perform:'Повтор',explain:'Объяснение',check:'Контроль',correct:'Исправить'},
                followUp:{help:'Наставник',control:'Сменный',observe:'Смотреть',close:'Итог'}};
              const twi2={...twi1,prepare:{purpose:'Устаревшая запись ИИ'}};
              const sopAnswer={steps:[{action:'Выключить питание',
                keyMoments:['Контроль отключения'],reason:'Безопасность',
                time:'00:20',success_criteria:'Нет вращения',
                decision_points:[],common_pitfalls:[],visual_markers:[]}],
                openQuestions:[],isoIconIds:[]};
              // Normal TWI generation remains automatic and needs no FRV.
              setSop('Нормальный TWI','sop-normal-twi');
              aiAsk=async()=>JSON.stringify(twi1);
              await generateTwiPlan();
              assert(state.twi.prepare.purpose==='Обучить проверке','normal TWI did not generate');
              // A manual TWI edit during AI wait must win over the stale response.
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const staleTwi=generateTwiPlan();
              document.getElementById('twi-purpose').value='Поправлено вручную';
              htmlToTwi();
              window.__stage22Resolve(JSON.stringify(twi2));
              await staleTwi;
              assert(state.twi.prepare.purpose==='Поправлено вручную','TWI edit was lost');
              // Normal SOP response is still accepted.
              setSop('Нормальная генерация СОП','sop-normal');
              aiAsk=async()=>JSON.stringify(sopAnswer);
              await generateSOP();
              assert(state.steps.length===1&&state.steps[0].action==='Выключить питание',
                     'normal SOP generation did not apply');
              // Switching documents while awaiting AI cannot replace the new document.
              setSop('Старая редакция','sop-old');
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const staleSop=generateSOP();
              docLoadToState(makeDoc('sop-new','Другая операция'));
              window.__stage22Resolve(JSON.stringify(sopAnswer));
              await staleSop;
              assert(state.meta.operation==='Другая операция'&&state.steps[0].action==='Проверить тормоз',
                     'old SOP response overwrote new document');
              // A field suggestion must not overwrite a human revision while in flight.
              const step=setSop('Редактирование поля','sop-fields');
              const b=document.createElement('button');b.dataset.id=String(step.id);
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const editing=aiFillField(b,'reason','Исходное обоснование',x=>{step.reason=x});
              step.reason='Человек уточнил причину';
              window.__stage22Resolve('Другое обоснование от модели');
              await editing;
              assert(step.reason==='Человек уточнил причину','AI overwrote human field');
              // Same safety rule for photo hints.
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const photo=generatePhotoHint(step.id);
              step.action='Уточнённое действие';
              window.__stage22Resolve('Фото: общий план оборудования');
              await photo;
              assert(!step.photoHint,'stale photo hint was written');
              // Review's previous document must not be repopulated by a late request.
              setSop('Старая проверка','sop-review-old');
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const reviewing=reviewEntireSOP();
              docLoadToState(makeDoc('sop-review-new','Проверка новой операции'));
              window.__stage22Resolve(JSON.stringify({
                issues:[{severity:'question',type:'incomplete',stepId:1,field:'reason',
                         description:'Устаревшее замечание'}],
                summary:'Старая версия',overall_quality:'good'}));
              await reviewing;
              assert(reviewIssues.length===0&&state.meta.operation==='Проверка новой операции',
                     'review crossed SOP boundary');
              // Pending dispute must not post a mentor verdict into another SOP.
              setSop('Спор со старым СОП','sop-dispute-old');
              reviewIssues=[{severity:'warning',type:'incomplete',stepId:1,field:'reason',
                description:'Уточните причину',suggestion:'Поясните',status:'open',thread:[]}];
              reviewSummary={summary:'Проверка',overall_quality:'good'};
              renderReviewResults(reviewSummary);
              document.querySelector('[data-dispute-input="0"]').value='Причина уже указана';
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const disputing=sendDispute(0);
              docLoadToState(makeDoc('sop-dispute-new','После открытия другого СОП'));
              window.__stage22Resolve(JSON.stringify({
                reply:'Я согласен с вашим аргументом, замечание снято.',
                verdict:'withdraw',new_fix:null}));
              await disputing;
              assert(reviewIssues.length===0&&state.meta.operation==='После открытия другого СОП',
                     'mentor response crossed SOP boundary');
              // FRV normal and stale results: observations are protected from late replies.
              setSop('ФРВ','sop-frv');
              state.frvStudy=null;
              const frvAnswer={sequence:[{actionRaw:'Осмотр ограждения',
                actionNormalized:'Проверить ограждение',durationSec:null}]};
              aiAsk=async()=>JSON.stringify(frvAnswer);
              await frvStudyBuild();
              assert(ensureFrvStudy().cycles[0].observations[0].actionRaw==='Осмотр ограждения',
                     'normal FRV build did not work');
              aiAsk=()=>new Promise(resolve=>{window.__stage22Resolve=resolve});
              const staleFrv=frvStudyBuild();
              const data=ensureFrvStudy();
              const extra=frvStudyEmptyObservation(99);
              extra.actionRaw='Ручная запись наблюдателя';
              data.cycles[0].observations.push(extra);
              const before=JSON.stringify(data.cycles);
              window.__stage22Resolve(JSON.stringify({sequence:[{actionRaw:'Устаревшее ФРВ'}]}));
              await staleFrv;
              assert(JSON.stringify(data.cycles)===before,'AI overwrote measured FRV rows');
              return {normalTwi:true,staleTwi:true,normalSop:true,staleSop:true,
                      field:true,photo:true,review:true,dispute:true,normalFrv:true,staleFrv:true};
            }""")
            assert all(result.values()),result
            assert not errors,errors
            print("PASS Stage22: 10 Chrome AI scenarios; no proxy/model changes or stale writes",flush=True)
        finally:
            browser.close()

def main():
    run_previous()
    check_mock_ai()

if __name__=="__main__":
    main()
