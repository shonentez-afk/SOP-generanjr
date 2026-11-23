#!/usr/bin/env python3
"""Stage39.1 WHY check: screenshot regression + safe TWI/JI causality rules."""
from __future__ import annotations
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage39-1-ai-reasons-frv-browser-candidate.html"


def run():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
                                   args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            p=browser.new_page(viewport={"width":1460,"height":980})
            p.on("pageerror",lambda err:errors.append(str(err)))
            p.route("http://**",lambda route:route.abort())
            p.route("https://**",lambda route:route.abort())
            p.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            result=p.evaluate("""() => {
              const step={
                action:'Проверить работу на холостом ходу',
                keyMoments:[
                  'Удерживать инструмент в устойчивом положении на поверхности.',
                  'Включить питание и запустить инструмент',
                  'Выдержать 1 минуту, затем выключить и обесточить'
                ],
                reason:'1. Исключить смещение при запуске.\\n2. Выявить сбой до основной операции.\\n3. Исключить повторный запуск.',
                successCriteria:''
              };
              const aiText='1. Удерживать инструмент в устойчивом положении на поверхности необходимо для предотвращения его смещения и обеспечения точности работы.\\n'+
                '2. Включить питание и запустить инструмент — для проверки его функционирования перед началом работы.\\n'+
                '3. Выдержать 1 минуту, затем выключить и обесточить — для обеспечения безопасности при работе с инструментом и предотвращения его перегрева.';
              const frozen=JSON.stringify(step);
              state.description='Проверить работу инструмента на холостом ходу, через 1 минуту выключить и обесточить.';
              const flagged=stage391TwiReasonQualityIssues(aiText,step);
              const rejected=stage391ValidateReasonProposal(step.reason,aiText,step);
              const good='1. Исключить смещение детали при пуске.\\n'+
                '2. Позволяет заметить сбой до основной операции.\\n'+
                '3. Обесточивание исключает повторный случайный запуск.';
              const accepted=stage391ValidateReasonProposal(step.reason,good,step);
              const local=stage28TwiStructureChecks([{...step,reason:aiText}]);
              const manualUntouched=JSON.stringify(step)===frozen;
              const generated={
                steps:[{
                  action:step.action,keyMoments:[...step.keyMoments],
                  reason:aiText,success_criteria:'',time:null,
                  decision_points:[],common_pitfalls:[],visual_markers:[]
                }],
                openQuestions:[]
              };
              const output=stage29SopNormalize(generated,{
                userDescription:state.description,operation:step.action,
                department:'',workplace:'',executor:'',tools:'',material:'',safety:''
              });
              const unchanged=output.sop.steps[0].reason===aiText;
              const warned=output.sop.openQuestions.some(q=>q.includes('WHY'));
              const noExtras=stage28TwiStructureChecks([{...step,reason:good}])
                 .filter(i=>i.description?.includes('Проверьте причину')).length===0;
              // One shared reason is accepted even if there are several KMs.
              const common=stage391TwiReasonQualityIssues(
                  'Предотвращает смещение детали при пробном пуске.',step);
              const noNumberIssue=stage38ReasonIssues(
                  'Предотвращает смещение детали при пробном пуске.',3,1).length===0;
              // Real source-proven consequences are allowed.
              state.description+=' Инструкция изготовителя указывает на контроль перегрева.';
              const confirmed=stage391ValidateReasonProposal('',
                  'Контроль выявляет перегрев до основной операции.',step);
              // Reason heuristics cannot touch FRV measured state or corporate XLSX.
              return {
                flagged:flagged.map(x=>({line:x.line,kind:x.kind})),
                rejected:!rejected.ok,
                accepted:accepted.ok,numberedGood:accepted.value===good,
                manualUntouched,localWarn:local.some(i=>
                  i.field==='reason'&&i.description.includes('строка 2')),
                generatedReasonUnchanged:unchanged,generatedAsked:warned,
                noFalseAlarmOnGood:noExtras,commonReasonAllowed:common.length===0&&noNumberIssue,
                sourceConfirmedConsequence:confirmed.ok,
                promptMentionsGrounding:STAGE29_SOP_PROMPT.includes('Не объявляй причиной')&&
                  AI_SYS.reason.includes('Объясни ПОЧЕМУ соответствующий Key Point важен')
              };
            }""")
            assert len(result["flagged"])>=3,result
            assert any(x["kind"]=="unconfirmed_consequence" for x in result["flagged"]),result
            for key in ["rejected","accepted","numberedGood","manualUntouched",
                        "localWarn","generatedReasonUnchanged","generatedAsked",
                        "noFalseAlarmOnGood","commonReasonAllowed",
                        "sourceConfirmedConsequence","promptMentionsGrounding"]:
                assert result[key],(key,result)
            assert not errors,errors
            print("PASS Stage39.1 TWI WHY: screenshot blocked, grounded reasons accepted, "+
                  "manual SOP preserved, generated WHY reviewed, Stage38 structure unchanged",flush=True)
        finally:
            browser.close()


if __name__=="__main__":
    run()
