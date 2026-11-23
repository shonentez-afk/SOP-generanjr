#!/usr/bin/env python3
"""Stage39.1 real Chrome: AI field suggestions, Reasons QA, FRV -> SOP and XLSX."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage39-1-ai-reasons-frv-browser-candidate.html"
OUT=ROOT/"artifacts"


def page(context,errors):
    p=context.new_page()
    p.on("pageerror",lambda e:errors.append(str(e)))
    p.on("dialog",lambda dialog:dialog.accept())
    p.route("http://**",lambda route:route.abort())
    p.route("https://**",lambda route:route.abort())
    p.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
    return p


def fixture(p):
    return p.evaluate("""() => {
      const first=createEmptyStep();
      first.action='Установить подшипник';
      first.keyMoments=['Проверить посадку','Исключить загрязнение'];
      first.reason='1. Предотвратить перекос\\n2. Защитить узел от загрязнений';
      first.durationSeconds=40;
      first.successCriteria='Подшипник установлен';
      state.meta.operation='Монтаж подшипника';
      state.meta.department='Цех 1';state.meta.workplace='Монтаж';
      state.meta.executor='Оператор';state.meta.safety='Применять СИЗ';
      state.meta.tools='Монтажный инструмент';state.meta.material='Подшипник';
      state.meta.date='2026-11-23';state.meta.sopNumber='S39-1';
      state.description='Установить подшипник. Проверить посадку, исключить загрязнение.';
      state.steps=[first];
      stateToHtml();renderSteps();
      window.stage391FirstId=first.id;
      window.stage391OriginalAiAsk=aiAsk;
      window.stage391AiCtx=[];
      window.stage391AiResult='';
      aiAsk=async (prompt,ctx,options)=>{
        window.stage391AiCtx.push({prompt,ctx,task:options?.task});
        return window.stage391AiResult;
      };
      return first.id;
    }""")


def ai_fields(p):
    id=fixture(p)
    assert "Stage39.1" in p.locator("#sopVersionLabel").inner_text()
    km=f'[data-ai-km="{id}"][data-ki="0"]'
    reason=f'[data-ai="reason"][data-id="{id}"]'
    action=f'[data-ai="action"][data-id="{id}"]'
    def ai_click(selector,response):
        p.evaluate("result => {window.stage391AiResult=result}",response)
        p.locator(selector).click()
        p.wait_for_function("""selector =>
          document.querySelector(selector)&&
          !document.querySelector(selector).disabled&&
          document.querySelector(selector).textContent==='✨'""",arg=selector)
    ai_click(action,'Установить подшипник с усилием 989 Н')
    assert p.evaluate("() => state.steps[0].action")=="Установить подшипник"
    ai_click(km,'Проверить зазор 888 мм')
    assert p.evaluate("() => state.steps[0].keyMoments[0]")=="Проверить посадку"
    ai_click(km,'Проверить отсутствие перекоса')
    ctx=p.evaluate("() => window.stage391AiCtx.at(-1).ctx")
    assert 'allKeyPoints' in ctx and 'Исключить загрязнение' in ctx,ctx
    assert '2. Защитить' in ctx,ctx
    assert p.evaluate("() => state.steps[0].keyMoments[0]")=="Проверить отсутствие перекоса"
    before=p.evaluate("() => state.steps[0].reason")
    # The same validator still protects mentor/FRV and the ✨ Reason.
    # A validated ✨ result now replaces the field directly.
    checks=p.evaluate("""() => {
      const step=state.steps[0];
      const badOrder=stage391ValidateReasonProposal(step.reason,
        '1. Обеспечить качество\\n3. Усилить контроль',step);
      const invented=stage391ValidateReasonProposal(step.reason,
        '1. Усилие 999 Н\\n2. Исключить загрязнение',step);
      return {badOrder:!badOrder.ok,invented:!invented.ok};
    }""")
    assert checks["badOrder"] and checks["invented"],checks
    proposal='1. Предотвратить перекос при посадке\n2. Исключить загрязнение узла'
    p.evaluate("result => {window.stage391AiResult=result}",proposal)
    p.locator(reason).click()
    p.wait_for_function("""selector =>
      document.querySelector(selector)&&
      !document.querySelector(selector).disabled&&
      document.querySelector(selector).textContent==='✨'""",arg=reason,timeout=12000)
    assert p.locator("#stage391ReasonAIReview").count()==0
    assert p.locator("button[data-stage391-cleanup]").count()==0
    reason_now=p.evaluate("() => state.steps[0].reason")
    assert reason_now==proposal,(before,reason_now)

    result=p.evaluate("""() => {
      autoScoreChecklist();
      const score=state.checklist.find(x=>x.id===7);
      const invalid=reviewGetApplicableFix({
        field:'reason',stepId:1,status:'open',
        fixValue:'1. Текст\\n2. Проверить 876 Н'
      });
      const valid=reviewGetApplicableFix({
        field:'reason',stepId:1,status:'open',
        fixValue:'1. Предотвратить перекос\\n2. Сохранить узел'
      });
      return {score:score.score,comment:score.comment,invalid:invalid===null,
              valid:valid?.field,reason:state.steps[0].reason};
    }""")
    assert result["score"]==1 and "смысл проверяет технолог" in result["comment"],result
    assert result["invalid"] and result["valid"]=="reason",result

    # Protect AI fact-based bulk proposals from a mixed valid+invalid selection.
    bulk=p.evaluate("""() => {
      const id=state.steps[0].id;
      const previous=state.steps[0].reason;
      state.stage27={
        ...stage27Empty(),
        questions:[{id:'Q1',stepId:id,question:'Что важно?',answer:'Сохранить узел',confirmed:true}],
        suggestions:[
          {id:'S1',questionId:'Q1',stepId:id,field:'action',
             oldValue:state.steps[0].action,newValue:'Выполнить монтаж',why:'Контекст'},
          {id:'S2',questionId:'Q1',stepId:id,field:'reason',
             oldValue:previous,newValue:'1. Описать причину\\n2. Подтвердить 877 Н',why:'Контекст'}
        ]
      };
      state.stage27.suggestionSignature=stage27DocumentSignature();
      const area=document.getElementById('stage27ProposalsArea');
      area.innerHTML='<input type="checkbox" checked data-stage27-suggestion="S1">'+
                     '<input type="checkbox" checked data-stage27-suggestion="S2">';
      const before=JSON.stringify(state.steps);
      stage27ApplySelected();
      const blocked=before===JSON.stringify(state.steps);
      // A human-confirmed new numeric fact is allowed, unlike AI invention.
      state.stage27.questions[0].answer='Технолог подтвердил 25 Н';
      state.stage27.suggestions[1].newValue='1. Сохранить качество 25 Н\\n2. Исключить загрязнение';
      state.stage27.suggestionSignature=stage27DocumentSignature();
      stage27ApplySelected();
      return {blocked,accepted:state.steps[0].action==='Выполнить монтаж'&&
        state.steps[0].reason.includes('25 Н')};
    }""")
    assert bulk["blocked"] and bulk["accepted"],"Bulk AI fact proposals were unsafe or rejected confirmed numeric facts"
    print("PASS Stage39.1: contextual Key Points, numbered Reason AI guard, source-fact numbers, checklist, review fix, atomic fact proposals",flush=True)


def frv_project(p):
    details=p.evaluate("""() => {
      const d=ensureFrvStudy();
      d.processDescription='Установка подшипника и проверка посадки';
      d.cycles=[frvStudyEmptyCycle(1)];
      const o=d.cycles[0].observations[0];
      o.actionRaw='Установить подшипник';
      o.actionNormalized='Установить подшипник';
      o.keyMoment='Проверить посадку';
      o.reason='1. Не допустить перекоса\\n2. Защитить детали';
      o.durationSec=12.5;o.valueType='VA';o.standardCandidate=true;
      window.stage391RawBefore=JSON.stringify(d.cycles);
      frvStudyMakeSok();
      const el=document.querySelector('[data-frvs-step="reason"]');
      if(!el)throw Error('No new FRV reason editor');
      const original=el.value;
      el.value='1. Предотвратить повреждение\\n2. Проверить результат';
      el.dispatchEvent(new Event('input',{bubbles:true}));
      const cand=d.standardCandidate.steps[0];
      const source=frvStudySourceStep(cand,d);
      const rawSame=JSON.stringify(d.cycles)===window.stage391RawBefore;
      return {
        tag:el.tagName,original,reason:cand.reason,
        transferred:source.reason,
        measured:source.frvSource.observedTimeSec,
        rawSame,
        display:!!document.querySelector('[data-fs="reason"][data-ci="0"][data-oi="0"]')
      };
    }""")
    assert details["tag"]=="TEXTAREA",details
    assert details["display"] and details["rawSame"],details
    assert details["original"]=="1. Не допустить перекоса\n2. Защитить детали",details
    expected="1. Предотвратить повреждение\n2. Проверить результат"
    assert details["reason"]==expected and details["transferred"]==expected,details
    assert details["measured"]==12.5,details

    # The independent FRV AI path must not apply invented numeric Reasons.
    check=p.evaluate("""async () => {
      const d=ensureFrvStudy(),o=d.cycles[0].observations[0];
      const old=o.reason;
      const original=aiAsk;
      aiAsk=async()=>JSON.stringify({
        actionNormalized:'Установить подшипник',
        keyMoment:'Проверить посадку',reason:'1. Подтвердить 777 Н\\n2. Сохранить узел'
      });
      try{await frvStudySuggestRow(0,0)}
      finally{aiAsk=original}
      return old===o.reason;
    }""")
    assert check,"Unsupported number applied through FRV AI"
    print("PASS Stage39.1: independent FRV multiline project, correct source time, unchanged RAW observations, AI reason guard",flush=True)


def excel_and_twi(context,errors):
    # Reuse the accepted Stage38 real export fixture; exercise the NEW release.
    spec=importlib.util.spec_from_file_location("stage38qa",
        ROOT/"qa/stage38_numbered_reasons_browser.py")
    qa=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qa)
    p=page(context,errors)
    qa.fixture(p)
    OUT.mkdir(parents=True,exist_ok=True)
    sop=OUT/"stage39-1-sop.xlsx"
    twi=OUT/"stage39-1-twi.xlsx"
    qa.download(p,"#generateBtn",sop)
    qa.download(p,"#twiExportXlsxBtn",twi)
    a=load_workbook(sop)
    assert a.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"]
    r=a["СОП"]["C18"]
    assert "1. " in r.value and "\n2. " in r.value
    assert r.alignment.horizontal=="left" and r.alignment.vertical=="top"
    b=load_workbook(twi)
    assert b.sheetnames==["Карта разбора работы","План наставника"]
    corpus=" ".join(str(x.value or "") for row in b.worksheets[0] for x in row)
    for text in ["1. Не допустить перекоса","2. Не допустить передачи"]:
        assert text in corpus,text
    assert not errors,errors
    print("PASS Stage39.1: real Chrome corporate 3-sheet XLSX + TWI 2-sheet workbook, numbered/left-aligned Reasons",flush=True)


def main():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            context=browser.new_context(viewport={"width":1480,"height":1000},
                accept_downloads=True)
            ai_fields(page(context,errors))
            frv_project(page(context,errors))
            excel_and_twi(context,errors)
            assert not errors,errors
        finally:browser.close()


if __name__=="__main__":
    main()
