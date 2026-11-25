#!/usr/bin/env python3
"""Stage42: numbered key moments, wrapped lines, decimal safety and 4+ item retention.
Synthetic workbook follows real user's Excel style: ACTION / KEY MOMENT / REASON
in three columns with multiple paragraphs inside one merged KM cell.
"""
from pathlib import Path
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage42-import-wizard-browser-candidate.html"
ART=ROOT/"artifacts/stage42"

def main():
    ART.mkdir(parents=True,exist_ok=True)
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1640,"height":1020},accept_downloads=True)
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=35000)
            direct=page.evaluate("""() => ({
              wrapped:stage42SplitKeyMoments('1. Убедиться в отсутствии повреждений штепсельной розетки\\nи питающего кабеля\\n2. Проверить наличие и целостность\\nрезинового наконечника\\n3. Осмотреть корпус инструмента'),
              inline:stage42SplitKeyMoments('1. Первый пункт 2. Второй пункт 3. Третий пункт'),
              unnumbered:stage42SplitKeyMoments('Проверить крепление\\nи отсутствие повреждений'),
              decimals:stage42SplitKeyMoments('1. Измерить 2.5 мм\\nв области стыка\\n2. Проверить 3.5 мм')
            })""")
            assert direct["wrapped"]==[
                "Убедиться в отсутствии повреждений штепсельной розетки и питающего кабеля",
                "Проверить наличие и целостность резинового наконечника",
                "Осмотреть корпус инструмента"],direct
            assert direct["inline"]==["Первый пункт","Второй пункт","Третий пункт"],direct
            assert direct["unnumbered"]==["Проверить крепление и отсутствие повреждений"],direct
            assert direct["decimals"]==["Измерить 2.5 мм в области стыка","Проверить 3.5 мм"],direct
            created=page.evaluate("""async () => {
              await ensureExcelJS();
              const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('СОП_А3_КнижЭ');
              ws.getCell('C4').value='Учебная проверка электроинструмента';
              ws.getCell('B16').value='Действие';
              ws.getCell('C16').value='1. Осмотреть электроинструмент';
              ws.getCell('F16').value='2. Проверить работу на холостом ходу';
              ws.getCell('J16').value='3. Измерить сопротивление изоляции';
              ws.getCell('B17').value='Ключевой момент';
              ws.getCell('C17').value=[
                '1. Визуально убедиться в отсутствии повреждений штепсельной розетки',
                'и питающего кабеля',
                '2. Проверить наличие и целостность резинового наконечника',
                'в месте завода кабеля в корпус инструмента',
                '3. Проверить целостность корпуса инструмента',
                'на отсутствие трещин, сколов и других повреждений',
                '4. Проверить работу фиксатора выключателя',
                '5. Осмотреть рукоятку инструмента'].join('\\n');
              ws.getCell('F17').value='1. Поставить инструмент на верстак\\n2. Включить\\n3. Проверить отсутствие вибрации\\n4. Остановить';
              ws.getCell('J17').value='Проверить значение\\nи сравнить с документом';
              ws.getCell('B18').value='Причина';
              ws.getCell('C18').value='Обнаружить видимые дефекты';
              ws.getCell('F18').value='Не допустить ошибочного включения';
              ws.getCell('J18').value='Сверить состояние изоляции';
              const buffer=await wb.xlsx.writeBuffer();
              window.__stage42ManyKm=new File([buffer],'stage42-multiple-km.xlsx',{
                type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
              return {bytes:buffer.byteLength};
            }""")
            assert created["bytes"]>1000,created
            page.locator("#importSopBtn").click()
            page.evaluate("""() => {
              const dt=new DataTransfer();dt.items.add(window.__stage42ManyKm);
              const input=document.getElementById('stage42Input');
              input.files=dt.files;
              input.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            page.wait_for_function("() => stage42Wizard.proposal !== null && !stage42Wizard.busy",timeout=20000)
            parsed=page.evaluate("""() => ({
              count:stage42Wizard.proposal.steps.length,
              kms:stage42Wizard.proposal.steps.map(x=>x.keyMoments),
              warnings:stage42Wizard.proposal.warnings,
              note:stage42El('stage42MomentCount')?.textContent
            })""")
            assert parsed["count"]==3,parsed
            assert list(map(len,parsed["kms"]))==[5,4,1],parsed
            assert parsed["kms"][0][0].endswith("и питающего кабеля"),parsed
            assert parsed["kms"][0][1].endswith("в месте завода кабеля в корпус инструмента"),parsed
            assert parsed["kms"][0][2].endswith("на отсутствие трещин, сколов и других повреждений"),parsed
            assert parsed["note"]=="5 КМ",parsed
            assert page.locator('#stage42MomentFields [data-stage42-moment]').count()==5
            assert not any("Разделите их перед загрузкой" in x for x in parsed["warnings"]),parsed
            assert page.locator("#stage42Apply").is_enabled()
            page.screenshot(path=str(ART/"stage42-numbered-km-preview.png"),full_page=False)
            page.locator('[data-stage42-step="1"]').click()
            assert page.locator('#stage42MomentFields [data-stage42-moment]').count()==4
            page.locator('[data-stage42-step="0"]').click()
            assert page.locator('#stage42MomentFields [data-stage42-moment]').count()==5
            page.locator("#stage42Apply").click()
            page.wait_for_function("() => stage42Wizard.host.hidden",timeout=20000)
            imported=page.evaluate("""() => ({
              counts:state.steps.map(x=>x.keyMoments.length),
              steps:state.steps.map(x=>x.keyMoments),
              normalised:normalizeStepShape(state.steps[0]).keyMoments.length,
              rendered:document.querySelectorAll('#stepsContainer textarea[data-km]').length,
              addButton:document.querySelector('[data-stage42-add-more-km]')?.textContent
            })""")
            assert imported["counts"]==[5,4,1],imported
            assert imported["normalised"]==5,imported
            assert imported["rendered"]==10,imported
            assert "Добавить КМ" in str(imported["addButton"]),imported
            persisted=page.evaluate("""async () => {
              const saved=await docSaveCurrent('Черновик');
              const loaded=await docDbGet(saved.id);
              return {counts:loaded.snapshot.steps.map(x=>x.keyMoments.length),
                items:loaded.snapshot.steps[0].keyMoments,
                id:saved.id};
            }""")
            assert persisted["counts"]==[5,4,1],persisted
            assert persisted["items"]==imported["steps"][0],persisted
            # Verify actual Excel output includes every numbered KM once.
            page.evaluate("""() => {
              state.meta.safety='Учебная процедура, для тестирования';
              state.meta.tools='Учебный инструмент';
              state.steps.forEach(x=>{x.durationSeconds=30});
              stateToHtml();
            }""")
            with page.expect_download(timeout=85000) as download:
                page.locator("#generateBtn").click()
            export=ART/"stage42-many-km-export.xlsx"
            download.value.save_as(str(export))
            wb=load_workbook(export)
            assert "СОП" in wb.sheetnames,wb.sheetnames
            rows=[]
            for line in wb["СОП"]:
                if any(c.value=="Ключевой момент" for c in line):
                    rows.append(line[2].value or "")
            assert rows, "Excel export contains no KM row"
            exported=rows[0]
            for index,text in enumerate(imported["steps"][0],1):
                assert f"{index}. {text}" in exported,(
                    "Missing numbered KM in XLSX",index,text,exported)
            assert exported.count("1. ")==1,exported
            assert not errors,errors
            print("PASS Stage42: 5+4+1 KMs, continuation-line grouping, decimals, "
                  "inline numbering, separate wizard fields, full constructor "
                  "model, library persistence and all numbered items in exported XLSX",
                  flush=True)
        finally:
            browser.close()

if __name__=="__main__":
    main()
