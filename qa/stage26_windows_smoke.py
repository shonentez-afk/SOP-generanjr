#!/usr/bin/env python3
"""Windows native Chrome/Edge file:// smoke: one offline HTML, local resources and draft."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage26-final-browser-candidate.html"

def main():
    assert RELEASE.is_file()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome")
        page=browser.new_page(viewport={"width":1440,"height":900},
                             accept_downloads=True)
        errors=[]
        page.on("pageerror",lambda err:errors.append(str(err)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.route("http://**",lambda route:route.abort())
        page.route("https://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            evidence=page.evaluate(r"""() => {
              const assert=(ok,label)=>{if(!ok)throw new Error('Windows file: '+label)};
              assert(location.protocol==='file:','not file protocol');
              assert(typeof generateSOP==='function','SOP generator');
              assert(typeof generateTwiPlan==='function','TWI generator');
              assert(typeof frvStudyAnalyze==='function','FRV analysis');
              assert(typeof testAIConnection==='function','proxy health-check');
              assert(typeof aiErrorClassify==='function','AI error classifier');
              assert(typeof frvAiAnalysisDialog==='function','FRV diff');
              assert(typeof ExcelJS==='object','offline ExcelJS');
              assert(Array.isArray(ICON_LIB)&&ICON_LIB.length>=50,'local ISO icons');
              assert(!!document.querySelector('#twi-purpose'),'TWI purpose field');
              assert(!!document.querySelector('#twi-frequency'),'TWI follow-up field');
              assert(!!document.querySelector('#frvStudyCycles'),'FRV workspace');
              const step=createEmptyStep();
              step.action='Осмотреть оборудование';
              step.keyMoments=['Проверить ограждение'];
              step.reason='Безопасность оператора';
              step.durationSeconds=55;
              step.successCriteria='Ограждение закрыто';
              state.steps=[step];
              state.meta.operation='Проверка';
              state.description='Процедура осмотра';
              stateToHtml();
              const before=docSnapshot();
              assert(before.steps.length===1,'document snapshot');
              assert(before.steps[0].action==='Осмотреть оборудование','snapshot data');
              assert(parseDuration('00:55')===55,'duration parser');
              saveDraft();
              const raw=localStorage.getItem(DRAFT_KEY);
              assert(!!raw,'browser local draft persistence');
              const doc=JSON.parse(raw);
              assert(doc.steps?.[0]?.action==='Осмотреть оборудование','stored data');
              return {protocol:location.protocol,steps:before.steps.length,
                icons:ICON_LIB.length,excelJs:true,draft:true,jsErrors:0};
            }""")
            assert not errors,errors
            assert evidence["icons"]>=50,evidence
            checks=page.evaluate("async () => await docRunSelfTest()")
            failed=[item for item in checks if not item["ok"]]
            assert not failed,failed
            evidence["librarySelfChecks"]=len(checks)
            print("PASS Stage26 Windows Chrome file:// offline ExcelJS, icons, SOP/TWI/FRV, library self-test and local draft",evidence,flush=True)
        finally:
            browser.close()

if __name__=="__main__":
    main()
