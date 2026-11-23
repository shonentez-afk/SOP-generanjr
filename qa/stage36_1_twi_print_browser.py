#!/usr/bin/env python3
"""Stage36.1 actual Chrome file:// TWI XLSX print QA + accepted Stage36 regression."""
from __future__ import annotations
import importlib.util
from pathlib import Path

from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage36-1-twi-print-xlsx-browser-candidate.html"
OUT=ROOT/"artifacts"

def regression():
    spec=importlib.util.spec_from_file_location(
        "stage36_accepted",ROOT/"qa/stage36_browser_smoke.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def check_book(path,stale=False):
    wb=load_workbook(path)
    assert wb.sheetnames==["Карта разбора работы","План наставника"],wb.sheetnames
    for ws in wb:
        assert str(ws.page_setup.paperSize)==str(ws.PAPERSIZE_A4),(ws.title,ws.page_setup.paperSize)
        assert ws.page_setup.fitToWidth==1,(ws.title,ws.page_setup.fitToWidth)
        assert ws.page_setup.fitToHeight==0,(ws.title,ws.page_setup.fitToHeight)
        assert not ws.sheet_view.showGridLines,ws.title
        assert ws.print_title_rows,(ws.title,ws.print_title_rows)
        assert ws.print_area,(ws.title,ws.print_area)
        assert ws.oddFooter.right.text,(ws.title,"no page footer")
        assert not any(c.data_type=="f" for row in ws for c in row),"TWI should not run formulas"
    a,b=wb.worksheets
    assert a.page_setup.orientation=="landscape"
    assert b.page_setup.orientation=="portrait"
    assert "TWI" in a["A1"].value and "TWI" in b["A1"].value
    assert "Промывка и проверка агрегата" in a["A3"].value
    assert "SOP-123" in a["C3"].value
    assert "Наставник Иванов" in a["A7"].value
    assert "Обучаемый Петров" in a["C7"].value
    assert a["B10"].value.startswith("ВАЖНЫЕ ШАГИ")
    assert "КЛЮЧЕВЫЕ" in a["C10"].value
    assert "ПРИЧИНЫ" in a["D10"].value
    joined=" ".join(str(c.value or "") for row in a for c in row)
    assert "Отключить агрегат" in joined and "Проверить отсутствие напряжения" in joined
    assert "Исключить поражение током" in joined
    if stale:
        assert "ТРЕБУЕТ ПРОВЕРКИ" in str(a["A9"].value),a["A9"].value
        assert "Шаг 1:" in joined,joined
    else:
        assert "Проверено наличие шагов" in a["A9"].value,a["A9"].value
    text=" ".join(str(c.value or "") for row in b for c in row)
    assert "Подготовить работника" in text.lower() or "ПОДГОТОВИТЬ РАБОТНИКА" in text
    assert "Показать порядок безопасной работы" in text
    assert "Проверить самостоятельное выполнение" in text
    assert "Мастер смены" in text
    return wb

def twi_export_real_browser():
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel="chrome",
          args=["--no-sandbox","--disable-dev-shm-usage"])
        ctx=browser.new_context(viewport={"width":1450,"height":970},accept_downloads=True)
        p=ctx.new_page()
        errors=[]
        p.on("pageerror",lambda e:errors.append(str(e)))
        p.on("dialog",lambda d:d.accept())
        p.route("http://**",lambda route:route.abort())
        p.route("https://**",lambda route:route.abort())
        try:
            p.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            p.locator('[data-tab="twi"]').click()
            assert p.locator("#twiExportXlsxBtn").count()==1
            p.evaluate("""() => {
              state.meta.operation='Промывка и проверка агрегата';
              state.meta.sopNumber='SOP-123';
              state.meta.date='2026-11-23';
              state.meta.department='Цех 5';
              state.meta.workplace='Линия № 2';
              state.meta.tools='Мультиметр и ключ';
              state.meta.material='Салфетки';
              state.meta.safety='Отключить питание, применить СИЗ';
              const a=createEmptyStep(),b=createEmptyStep();
              a.action='Отключить агрегат';
              a.keyMoments=['Проверить отсутствие напряжения',
                'Исключить случайное включение'];
              a.reason='Исключить поражение током и незапланированный запуск';
              b.action='Очистить и проверить корпус';
              b.keyMoments=['Проверить отсутствие повреждений'];
              b.reason='Исключить скрытые дефекты';
              state.steps=[a,b];
              state.twi={
                enabled:true,trainer:'Наставник Иванов',trainee:'Обучаемый Петров',
                prepare:{purpose:'Научить безопасной промывке',
                  known:'Есть опыт работы с оборудованием',
                  prep:'Подготовить СИЗ и мультиметр',interest:'Результат — исправный узел'},
                present:{round1:'Показать порядок безопасной работы',
                  round2:'Показать отключение и очистку',
                  round3:'Объяснить, почему проверяем напряжение'},
                tryOut:{perform:'Повторить действия',explain:'Назвать шаги и причины',
                  check:'Проверить самостоятельное выполнение',correct:'Исправить ошибки'},
                followUp:{help:'Мастер смены',control:'Контроль в первые смены',
                  observe:'Безопасность и качество',close:'Самостоятельно без подсказок'}
              };
              state.twi.sourceSignature=twiSourceSignature();
              twiToHtml();
              window.__twiBefore=JSON.stringify({steps:state.steps,twi:state.twi,meta:state.meta});
            }""")
            p.screenshot(path=str(OUT/"stage36-1-twi-export-ui.png"),full_page=True)
            with p.expect_download(timeout=25000) as d:
                p.locator("#twiExportXlsxBtn").click()
            file=OUT/"stage36-1-twi-print.xlsx"
            d.value.save_as(str(file))
            assert d.value.suggested_filename.startswith("TWI_JI_")
            check_book(file)
            assert p.evaluate("""() =>
              JSON.stringify({steps:state.steps,twi:state.twi,meta:state.meta})===window.__twiBefore"""),"Export changed live document"
            # A long key point must be split into readable continuation rows,
            # never silently clipped to a fixed Excel height.
            p.evaluate("""() => {
              const long='Выполнить контроль согласно подготовленному перечню действий. ';
              state.steps[0].keyMoments=[long.repeat(40)];
              state.steps[0].reason='';
            }""")
            with p.expect_download(timeout=25000) as d:
                p.locator("#twiExportXlsxBtn").click()
            warning_file=OUT/"stage36-1-twi-review-needed.xlsx"
            d.value.save_as(str(warning_file))
            warning=check_book_warning(warning_file)
            assert warning>=3,warning
            # Published SOP exports read-only, no mutation on click.
            p.evaluate("""() => {
              state.documentManager.status='Опубликован';
              state.twi.sourceSignature=twiSourceSignature();
              window.__publishedTwi=JSON.stringify(state.twi);
            }""")
            with p.expect_download(timeout=25000) as d:
                p.locator("#twiExportXlsxBtn").click()
            d.value.save_as(str(OUT/"stage36-1-published-twi.xlsx"))
            assert p.evaluate("() => JSON.stringify(state.twi)===window.__publishedTwi")
            assert not errors,errors
            print("PASS Stage36.1 TWI JI: A4 Excel prints, both sheets, full data, stale and long-text review, no SOP/TWI mutation",flush=True)
        finally:
            browser.close()

def check_book_warning(path):
    w=load_workbook(path)
    sheet=w.worksheets[0]
    assert "ТРЕБУЕТ ПРОВЕРКИ" in sheet["A9"].value
    assert sheet["D11"].value=="— не указаны",sheet["D11"].value
    rows=[r for r in sheet if r[0].value and "(прод.)" in str(r[0].value)]
    assert len(rows)>=3,len(rows)
    return len(rows)

def main():
    regression()
    twi_export_real_browser()

if __name__=="__main__":
    main()
