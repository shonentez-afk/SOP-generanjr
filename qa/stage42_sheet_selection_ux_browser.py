#!/usr/bin/env python3
"""Stage42 usability: workbook with empty landscape SOP and populated portrait SOP.
Regression for real screenshot: selecting the first name-matching sheet produced
zero steps even though the other sheet displayed action rows.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage42-import-wizard-browser-candidate.html"
ART=ROOT/"artifacts/stage42"
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS2gAAAAASUVORK5CYII="

def main():
    errors=[]
    ART.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1650,"height":1000})
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=35000)
            data=page.evaluate("""async b64 => {
              await ensureExcelJS();
              const wb=new ExcelJS.Workbook();
              const blank=wb.addWorksheet('СОП_А3_Альб12');
              blank.getCell('B16').value='Действие';
              blank.getCell('C16').value='—';
              const filled=wb.addWorksheet('СОП_А3_КнижЭ');
              filled.getCell('B16').value='Действие';
              filled.getCell('C16').value='1. Открыть быстрый ввод заявки';
              filled.getCell('F16').value='2. Описать проблему и выбрать оборудование';
              filled.getCell('B17').value='Ключевой момент';
              filled.getCell('C17').value='Указать номер оборудования';
              filled.getCell('F17').value='Описать проявление проблемы';
              filled.getCell('B18').value='Причина';
              filled.getCell('C18').value='Чтобы заявка была связана с оборудованием';
              filled.getCell('F18').value='Для передачи точного описания';
              filled.getCell('B15').value='Визуализация';
              filled.getCell('B19').value='Визуализация';
              filled.getCell('B20').value='Действие';
              filled.getCell('C20').value='3. Проверить карточку заявки';
              filled.getCell('F20').value='4. Уточнить ответственный участок';
              filled.getCell('B21').value='Ключевой момент';
              filled.getCell('C21').value='Проверить обязательные реквизиты';
              filled.getCell('F21').value='Не менять номер без основания';
              filled.getCell('B22').value='Причина';
              filled.getCell('C22').value='Чтобы избежать ошибки';
              filled.getCell('F22').value='Для корректной передачи заявки';
              const photo=wb.addImage({base64:'data:image/png;base64,'+b64,extension:'png'});
              filled.addImage(photo,{tl:{col:2,row:14},br:{col:4,row:14.8}});
              filled.addImage(photo,{tl:{col:5,row:18},br:{col:7,row:18.8}});
              filled.addImage(photo,{tl:{col:0,row:1},br:{col:1,row:2}});
              wb.addWorksheet('ФРВ');
              wb.addWorksheet('Чек-лист');
              const array=await wb.xlsx.writeBuffer();
              window.__stage42Fixture=new File([array],'sop-multisheet-portrait.xlsx',{
                type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
              return {size:array.byteLength,names:wb.worksheets.map(w=>w.name)};
            }""",PNG)
            assert data["size"]>1500,data
            page.locator("#importSopBtn").click()
            page.evaluate("""() => {
              const t=new DataTransfer();
              t.items.add(window.__stage42Fixture);
              const input=document.querySelector('#stage42Input');
              input.files=t.files;
              input.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            page.wait_for_function("() => !!stage42Wizard.proposal && !stage42Wizard.busy",timeout=30000)
            found=page.evaluate("""() => ({
              sheet:stage42Wizard.proposal.sourceSheet,
              count:stage42Wizard.proposal.steps.length,
              actions:stage42Wizard.proposal.steps.map(x=>x.action),
              sources:stage42Wizard.proposal.steps.map(x=>x.source.action),
              photos:stage42Wizard.proposal.steps.map(x=>x.photoIndex),
              media:stage42Wizard.proposal.media.length,
              unused:stage42UnusedPhotos(),
              firstRow:stage42Wizard.startRow,
              header:getComputedStyle(document.querySelector('#stage42Wizard header')).backgroundColor,
              primary:getComputedStyle(document.querySelector('#stage42Apply')).backgroundColor
            })""")
            assert found["sheet"]=="СОП_А3_КнижЭ",found
            assert found["count"]==4,found
            assert found["sources"]==["C16","F16","C20","F20"],found
            assert found["photos"]==[0,-1,-1,1],found
            assert found["media"]==3 and found["unused"]==1,found
            assert 1<found["firstRow"]<=16,found
            assert found["header"]=="rgb(255, 255, 255)",found
            assert found["primary"]=="rgb(227, 6, 19)",found
            assert page.locator("#stage42Sheet").input_value()=="СОП_А3_КнижЭ"
            assert page.locator("#stage42EmptyGuide").is_hidden()
            assert page.locator("#stage42Apply").is_enabled()
            assert page.locator('#stage42Grid [data-stage42-cell="C16"]').count()==1
            assert "4 действий" in page.locator("#stage42SheetAdvice").inner_text()
            page.screenshot(path=str(ART/"stage42-wizard-preview.png"),full_page=False)
            # Choosing another worksheet must actually reparse; it must never
            # only change the visual grid while keeping the previous SOP.
            page.locator("#stage42Sheet").select_option("СОП_А3_Альб12")
            assert page.evaluate("() => stage42Wizard.proposal.steps.length")==0
            assert page.locator("#stage42EmptyGuide").is_visible()
            assert page.locator("#stage42Apply").is_disabled()
            assert "выберите другой лист" in page.locator("#stage42SheetAdvice").inner_text().lower()
            page.locator("#stage42Sheet").select_option("СОП_А3_КнижЭ")
            assert page.evaluate("() => stage42Wizard.proposal.steps.length")==4
            page.locator('[data-stage42-step="2"]').click()
            assert page.locator("#stage42CellInfo").inner_text().startswith("Выбрана СОП_А3_КнижЭ!C20")
            assert page.locator('#stage42Grid td.stage42-selected[data-stage42-cell="C20"]').count()==1
            # Manual user edits must not silently disappear during a switch.
            page.locator('[data-stage42-field="reason"]').fill("Уточнено в мастере")
            page.once("dialog",lambda d:d.dismiss())
            page.locator("#stage42Sheet").select_option("СОП_А3_Альб12")
            assert page.locator("#stage42Sheet").input_value()=="СОП_А3_КнижЭ"
            assert page.evaluate("() => stage42Wizard.proposal.steps[2].reason")=="Уточнено в мастере"
            page.once("dialog",lambda d:d.accept())
            page.locator("#stage42Cancel").click()
            assert not errors,errors
            print("PASS Stage42 UX: automatic populated-sheet choice; portrait action rows, "
                  "four steps, pre-action corporate image mapping, red TN design, reparse on "
                  "sheet switch, guided zero-step state, source jump, edit guard")
        finally:
            browser.close()

if __name__=="__main__":
    main()
