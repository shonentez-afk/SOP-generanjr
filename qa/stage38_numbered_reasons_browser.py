#!/usr/bin/env python3
"""Stage38: real Chrome downloads, corporate XLSX geometry baseline diff, numbered Reasons."""
from __future__ import annotations
import importlib.util
from pathlib import Path

from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ACCEPTED=ROOT/"releases/stage37-desktop-audit-browser-candidate.html"
RELEASE=ROOT/"releases/stage38-numbered-reasons-corporate-xlsx-browser-candidate.html"
OUT=ROOT/"artifacts"
NUMBERED=(
    "1. Не допустить перекоса подшипника при посадке, чтобы не повреждать сопрягаемые поверхности и обеспечить ровную установку.\n"
    "2. Не допустить передачи монтажного усилия через тела качения, чтобы сохранить дорожки и исключить повреждение механизма.\n"
    "3. Подтвердить правильность положения узла перед запуском, чтобы исключить нарушение работы и преждевременный отказ."
)

def previous_regression():
    spec=importlib.util.spec_from_file_location("qa37",ROOT/"qa/stage37_desktop_audit_browser.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def case_page(context,html,errors):
    p=context.new_page()
    p.on("pageerror",lambda e:errors.append(str(e)))
    p.on("dialog",lambda dialog:dialog.accept())
    p.route("http://**",lambda route:route.abort())
    p.route("https://**",lambda route:route.abort())
    p.goto(html.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
    return p

def fixture(p):
    p.evaluate("""numbered => {
      const image=document.createElement('canvas');
      image.width=120;image.height=80;
      const ctx=image.getContext('2d');
      ctx.fillStyle='#e8eef2';ctx.fillRect(0,0,120,80);
      ctx.fillStyle='#1d4d65';ctx.fillRect(15,15,85,45);
      const photo=image.toDataURL('image/png');
      const first=createEmptyStep();
      first.action='Установить подшипник';
      first.keyMoments=['Очистить посадочную поверхность',
        'Прикладывать монтажное усилие к нужному кольцу',
        'Проверить посадку подшипника'];
      first.reason=numbered;
      first.durationSeconds=75;
      first.hasPhoto=true;first.imageData=photo;first.imageExt='png';
      const second=createEmptyStep();
      second.action='Проверить вращение узла';
      second.keyMoments=['Вращение без заеданий','Отсутствие посторонних звуков'];
      second.reason='Исключить неисправность узла до запуска.';
      second.durationSeconds=35;
      state.meta.operation='Монтаж и проверка подшипника';
      state.meta.safety='Применить СИЗ, остановить оборудование до начала работы';
      state.meta.sopNumber='STAGE38-SOP-01';
      state.meta.department='Цех 1';
      state.meta.workplace='Ремонтный участок';
      state.meta.executor='Слесарь';
      state.meta.tools='Съёмник';
      state.meta.material='Подшипник';
      state.meta.date='2026-11-23';
      state.steps=[first,second];
      state.twi={
        enabled:true,trainer:'Наставник',trainee:'Обучаемый',
        prepare:{purpose:'Освоить монтаж',known:'Ознакомление',
          prep:'Приготовить инструмент',interest:'Безопасное выполнение'},
        present:{round1:'Показ последовательности',round2:'Ключевые моменты',
          round3:'Причины'},
        tryOut:{perform:'Выполнить операцию',explain:'Объяснить причины',
          check:'Проверить монтаж',correct:'Исправить замечания'},
        followUp:{help:'Мастер',control:'Наблюдение',observe:'Качество',
          close:'Правильное выполнение'}
      };
      state.twi.sourceSignature=twiSourceSignature();
      stateToHtml();renderSteps();renderFrv();twiToHtml();
      window.stage38Before=JSON.stringify({steps:state.steps,twi:state.twi});
    }""",NUMBERED)

def download(p,selector,out):
    p.locator('[data-tab="'+('editor' if selector=="#generateBtn" else 'twi')+'"]').click()
    with p.expect_download(timeout=30000) as d:
        p.locator(selector).click()
    d.value.save_as(str(out))
    minimum=8000 if selector=='#twiExportXlsxBtn' else 12000
    assert out.exists() and out.stat().st_size>minimum,(selector,out.stat().st_size)
    assert p.evaluate("""() => JSON.stringify({steps:state.steps,twi:state.twi})===window.stage38Before"""),"Print mutated SOP or TWI state"

def geometry(ws):
    return {
      "merge":{str(m) for m in ws.merged_cells.ranges},
      "columns":[ws.column_dimensions[k].width for k in "ABCDEFGHIJKLM"],
      "print_title":ws.print_title_rows,"print_area":str(ws.print_area),
      "print_w":ws.page_setup.fitToWidth,
      "orient":ws.page_setup.orientation,
      "images":len(ws._images),
      "formula":ws["G5"].value,
      "labels":[ws["B15"].value,ws["B16"].value,ws["B17"].value,ws["B18"].value]
    }

def compare_corporate_xlsx(old,new):
    prev=load_workbook(old)
    updated=load_workbook(new)
    assert prev.sheetnames==updated.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"],updated.sheetnames
    ws=updated["СОП"];base=prev["СОП"]
    assert geometry(base)==geometry(ws),(geometry(base),geometry(ws))
    assert base["C18"].value==ws["C18"].value==NUMBERED
    assert base["F18"].value==ws["F18"].value=="Исключить неисправность узла до запуска."
    # One intentional format change: Reasons are flush left and top-aligned.
    # Compare unrelated style pieces to ensure company formatting is untouched.
    for ref in ("C18","F18","J18"):
        current=ws[ref]
        original=base[ref]
        assert current.alignment.horizontal=="left",(ref,current.alignment)
        assert current.alignment.vertical=="top",(ref,current.alignment)
        assert current.alignment.wrap_text is True,(ref,current.alignment)
        assert original.alignment.horizontal=="center",(ref,original.alignment)
        assert current._style.fontId==original._style.fontId,ref
        assert current._style.fillId==original._style.fillId,ref
        assert current._style.borderId==original._style.borderId,ref
        assert current._style.numFmtId==original._style.numFmtId,ref
    assert ws["C18"].font.sz==base["C18"].font.sz
    assert ws.row_dimensions[18].height>90,ws.row_dimensions[18].height
    assert base.row_dimensions[18].height==90,base.row_dimensions[18].height
    assert len(ws._images)>=3,len(ws._images)  # logo + photo background + original
    for sheet in ("ФРВ","Чек-лист оценки СОП"):
        assert prev[sheet].max_row==updated[sheet].max_row
        assert prev[sheet].max_column==updated[sheet].max_column
        assert {str(m) for m in prev[sheet].merged_cells.ranges}=={
            str(m) for m in updated[sheet].merged_cells.ranges}
    for pos in ("G5","E16","I16"):
        assert ws[pos].value==base[pos].value,(pos,ws[pos].value,base[pos].value)
    return ws.row_dimensions[18].height

def numbered_ai_and_review(p):
    result=p.evaluate("""() => {
      const text=stage38ReasonText('1. Объяснение первое\\r\\n2. Объяснение второе');
      const plain=stage38ReasonIssues('Одна общая причина для двух моментов.',2,1);
      const numbered=stage38ReasonIssues('1. Первая причина\\n2. Вторая причина',2,1);
      const skipped=stage38ReasonIssues('1. Первая причина\\n3. Третья причина',3,1);
      const duplicate=stage38ReasonIssues('1. Первая\\n1. Повтор',2,1);
      const kept=stage38StripOrdinalLabels('1. Причина\\n2. Усилие 25 Н');
      const facts={
        operation:'Установить подшипник',department:'',workplace:'',
        executor:'',tools:'',material:'',safety:'',
        userDescription:'Установить подшипник и проверить посадку.'
      };
      const step={
        action:'Установить подшипник',keyMoments:['Очистить','Проверить'],
        reason:'1. Исключить перекос\\n2. Убедиться в правильной установке',
        success_criteria:'',time:null,decision_points:[],common_pitfalls:[],
        visual_markers:[]
      };
      const norm=stage29SopNormalize({steps:[structuredClone(step)],
        openQuestions:[]},facts).sop.steps[0].reason;
      let numericRejected=false;
      try{
        stage29SopNormalize({steps:[{...step,
          reason:'1. Исключить перекос\\n2. Применить усилие 25 Н'}],
          openQuestions:[]},facts);
      }catch(e){numericRejected=e?.code==='AI_TASK_INCOMPLETE'}
      const twiCorpus=stage29TwiSourceText({steps:[{
        action:'Установить',keyPoints:['Очистить'],
        reason:'1. Исключить перекос\\n2. Не повредить корпус',
        successCriteria:''}]});
      return {text,plain:plain.length,numbered:numbered.length,
        skipped:skipped.map(x=>x.description),
        duplicate:duplicate.map(x=>x.description),kept,norm,
        numericRejected,twiCorpus,
        twiNumericRejected:stage29HasUnconfirmedNumber('Через 2 дня',
          twiCorpus,1).includes('2'),
      };
    }""")
    assert result["text"]=="1. Объяснение первое\n2. Объяснение второе",result
    assert result["plain"]==0 and result["numbered"]==0,result
    assert any("пропущен" in s for s in result["skipped"]),result
    assert any("Повтор" in s for s in result["duplicate"]),result
    assert result["kept"]=="Причина\nУсилие 25 Н",result
    assert result["norm"]=="1. Исключить перекос\n2. Убедиться в правильной установке",result
    assert result["numericRejected"] and result["twiNumericRejected"],result
    assert "1. Исключить" not in result["twiCorpus"],result
    assert p.evaluate("""() => {
      const issues=stage28TwiStructureChecks([{
        action:'Установить подшипник',
        keyMoments:['Очистить','Проверить посадку'],
        reason:'1. Исключить перекос\\n3. Подтвердить состояние'
      }]);return issues.some(x=>x.field==='reason'&&x.description.includes('пропущен'));
    }"""),"Review did not detect explicit numbering hole"
    print("PASS Stage38: optional common reason, ordered multi-reason, ordinal-safe AI, real values still checked, local review",flush=True)

def stage38_xlsx():
    OUT.mkdir(parents=True,exist_ok=True)
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
             args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            ctx=browser.new_context(viewport={"width":1470,"height":980},
                accept_downloads=True)
            baseline=case_page(ctx,ACCEPTED,errors)
            candidate=case_page(ctx,RELEASE,errors)
            fixture(baseline);fixture(candidate)
            numbered_ai_and_review(candidate)
            assert candidate.locator('textarea[data-step-field="reason"]').count()==2
            assert "Stage38" in candidate.locator("#sopVersionLabel").inner_text()
            original=OUT/"stage38-accepted37-corporate.xlsx"
            fresh=OUT/"stage38-corporate-numbered.xlsx"
            download(baseline,"#generateBtn",original)
            download(candidate,"#generateBtn",fresh)
            height=compare_corporate_xlsx(original,fresh)
            twi=OUT/"stage38-twi-numbered.xlsx"
            download(candidate,"#twiExportXlsxBtn",twi)
            w=load_workbook(twi)
            assert w.sheetnames==["Карта разбора работы","План наставника"]
            assert str(w.worksheets[0].page_setup.paperSize)=="9"
            result="\n".join(str(w.worksheets[0].cell(r,4).value or "")
                for r in range(11,min(21,w.worksheets[0].max_row)+1))
            canon=lambda text:" ".join(str(text).split())
            for line in NUMBERED.split("\n"):
                assert canon(line) in canon(result),(line,result)
            assert w.worksheets[0].page_setup.fitToWidth==1
            assert p_bool(candidate,"() => !!document.querySelector('[data-step-field=reason]')?.value.includes('1. ')")
            # Return to editor after TWI export: hidden tab fields cannot be
            # filled by Playwright as a real user.
            candidate.locator('[data-tab="editor"]').click()
            # Simulate a user editing the sole reason textarea with newlines.
            candidate.locator('textarea[data-step-field="reason"]').first.fill(
                "1. Предотвратить повреждение\n2. Обеспечить качество")
            assert candidate.evaluate(
                "() => state.steps[0].reason")=="1. Предотвратить повреждение\n2. Обеспечить качество"
            assert not errors,errors
            print("PASS Stage38: corporate SOP geometry identical to Stage37, original photo count unchanged, 3 XLSX sheets, full numbered reason row height "+str(height)+", TWI preserved",flush=True)
        finally:
            browser.close()

def p_bool(page,js):
    return bool(page.evaluate(js))

def main():
    previous_regression()
    stage38_xlsx()

if __name__=="__main__":
    main()
