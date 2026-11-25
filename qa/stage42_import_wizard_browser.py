#!/usr/bin/env python3
"""Stage42 real offline Chrome: correct corporate import, merged cells, photos,
preview isolation, manual mapping, library and stale-state safety."""
from pathlib import Path
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage42-import-wizard-browser-candidate.html"
ART=ROOT/"artifacts/stage42"
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS2gAAAAASUVORK5CYII="

def fixture_js(corporate=True):
    return """async (corporate) => {
      await ensureExcelJS();
      const book=new ExcelJS.Workbook();
      const ws=book.addWorksheet(corporate?'СОП':'Нестандартная форма');
      if(corporate){
        ws.getCell('A1').value='СТАНДАРТНАЯ ОПЕРАЦИОННАЯ ПРОЦЕДУРА';
        ws.getCell('C1').value='Учебный филиал';
        ws.getCell('C4').value='Учебный осмотр инструмента';
        ws.getCell('A13').value='Действие';
        ws.mergeCells('C13:E13');
        ws.getCell('C13').value='1. Осмотреть корпус инструмента';
        ws.mergeCells('F13:I13');
        ws.getCell('F13').value='2. Зафиксировать результат осмотра';
        ws.getCell('A14').value='Ключевой момент';
        ws.mergeCells('C14:E14');
        ws.getCell('C14').value='Проверить видимые повреждения';
        ws.mergeCells('F14:I14');
        ws.getCell('F14').value='Указать итог осмотра';
        ws.getCell('A15').value='Причина';
        ws.mergeCells('C15:E15');
        ws.getCell('C15').value='Выявить повреждения до начала работы';
        ws.mergeCells('F15:I15');
        ws.getCell('F15').value='Сохранить сведения о результате';
        ws.getCell('A12').value='Визуализация';
        const pic=book.addImage({base64:'data:image/png;base64,'+window.__fixturePng,
          extension:'png'});
        ws.addImage(pic,{tl:{col:2,row:11},br:{col:4,row:11.8}});
        const frv=book.addWorksheet('ФРВ');
        frv.getCell('A3').value='Действие, ключ.момент';
        frv.getCell('B4').value='Осмотреть корпус инструмента';
        frv.getCell('D4').value=1;
        frv.getCell('E4').value='12';
        const checklist=book.addWorksheet('Чек-лист');
        checklist.getCell('A4').value=4;
        checklist.getCell('C4').value=0.75;
      }else{
        ws.getCell('D5').value='Осмотреть новую деталь';
        ws.getCell('D6').value='Проверить наличие видимых дефектов';
        ws.getCell('D7').value='Позволяет выявить повреждение';
      }
      const buffer=await book.xlsx.writeBuffer();
      return new File([buffer],corporate?'stage42-corporate.xlsx':'stage42-unusual.xlsx',{
        type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }""".replace("window.__fixturePng","'"+PNG+"'").replace("'"+PNG+"'","'"+PNG+"'")

def set_fixture(page,corporate=True):
    return page.evaluate("""async (corporate) => {
      await ensureExcelJS();
      const book=new ExcelJS.Workbook(),ws=book.addWorksheet(corporate?'СОП':'Нестандартная форма');
      if(corporate){
        ws.getCell('C1').value='Учебный филиал';
        ws.getCell('C4').value='Учебный осмотр инструмента';
        ws.getCell('A13').value='Действие';
        ws.mergeCells('C13:E13');ws.getCell('C13').value='1. Осмотреть корпус инструмента';
        ws.mergeCells('F13:I13');ws.getCell('F13').value='2. Зафиксировать результат осмотра';
        ws.getCell('A14').value='Ключевой момент';
        ws.mergeCells('C14:E14');ws.getCell('C14').value='Проверить видимые повреждения';
        ws.mergeCells('F14:I14');ws.getCell('F14').value='Указать итог осмотра';
        ws.getCell('A15').value='Причина';
        ws.mergeCells('C15:E15');ws.getCell('C15').value='Выявить повреждения до начала работы';
        ws.mergeCells('F15:I15');ws.getCell('F15').value='Сохранить сведения о результате';
        ws.getCell('A12').value='Визуализация';
        const pic=book.addImage({base64:'data:image/png;base64,'+__PNG__,extension:'png'});
        ws.addImage(pic,{tl:{col:2,row:11},br:{col:4,row:11.8}});
        const frv=book.addWorksheet('ФРВ');
        frv.getCell('A3').value='Действие, ключ.момент';
        frv.getCell('B4').value='Осмотреть корпус инструмента';
        frv.getCell('D4').value=1;
        frv.getCell('E4').value='12';
        const checklist=book.addWorksheet('Чек-лист');
        checklist.getCell('A4').value=4;checklist.getCell('C4').value=0.75;
      }else{
        ws.getCell('D5').value='Осмотреть новую деталь';
        ws.getCell('D6').value='Проверить наличие видимых дефектов';
        ws.getCell('D7').value='Позволяет выявить повреждение';
      }
      const buffer=await book.xlsx.writeBuffer();
      window.__stage42Fixture=new File([buffer],
        corporate?'stage42-corporate.xlsx':'stage42-unusual.xlsx',
        {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      return {size:window.__stage42Fixture.size,sheets:book.worksheets.length};
    }""".replace("__PNG__",repr(PNG)),corporate)

def feed_file(page):
    page.evaluate("""() => {
      const t=new DataTransfer();
      t.items.add(window.__stage42Fixture);
      const input=document.getElementById('stage42Input');
      input.files=t.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }""")
    page.wait_for_function("() => stage42Wizard.proposal !== null && !stage42Wizard.busy",timeout=25000)

def main():
    errors=[]
    ART.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1660,"height":1040},
                accept_downloads=True)
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=35000)
            fixture=set_fixture(page)
            assert fixture["size"]>1500,fixture
            page.evaluate("""() => {
              const old=createEmptyStep();
              old.action='СТАРАЯ НЕСОХРАНЁННАЯ СОП';
              state.steps=[old];state.meta.operation='Старая операция';
              stateToHtml();saveDraft();
            }""")
            prev=page.evaluate("() => stage42DocumentSignature()")
            page.locator("#importSopBtn").click()
            assert page.locator("#stage42Wizard").is_visible()
            assert page.locator("#stage42Welcome").is_visible()
            assert page.evaluate("() => stage42DocumentSignature()")==prev
            feed_file(page)
            p=page.evaluate("""() => ({
              count:stage42Wizard.proposal.steps.length,
              steps:stage42Wizard.proposal.steps.map(s=>({
                action:s.action,km:s.keyMoments,reason:s.reason,source:s.source,
                photoIndex:s.photoIndex,frv:s.frv
              })),
              media:stage42Wizard.proposal.media.length,
              sheets:stage42Wizard.proposal.wb.worksheets.length,
              operation:stage42Wizard.proposal.meta.operation,
              active:state.meta.operation,
              current:state.steps[0].action,
              countPhotoWrites:stage42Wizard.proposal.media.map(m=>m.bytes.byteLength)
            })""")
            assert p["count"]==2,p
            assert p["steps"][0]["action"]=="Осмотреть корпус инструмента",p
            assert p["steps"][0]["km"][0]=="Проверить видимые повреждения",p
            assert p["steps"][0]["reason"]=="Выявить повреждения до начала работы",p
            assert p["steps"][0]["photoIndex"]==0,p
            assert p["media"]==1,p
            assert p["sheets"]==3,p
            assert p["operation"]=="Учебный осмотр инструмента",p
            assert p["active"]=="Старая операция",p
            assert p["current"]=="СТАРАЯ НЕСОХРАНЁННАЯ СОП",p
            assert page.locator("#stage42PhotoSelect").input_value()=="0"
            assert page.locator("#stage42Grid td.stage42-merged").count()>0
            assert page.locator('#stage42Grid [data-stage42-cell="C13"]').count()==1
            page.locator('#stage42Grid [data-stage42-cell="C15"]').click()
            assert "C15" in page.locator("#stage42CellInfo").inner_text()
            page.locator('[data-stage42-use="reason"]').click()
            page.locator('[data-stage42-field="reason"]').fill(
                "1. Причина по оригинальному XLSX\n2. Уточнено инженером")
            assert page.evaluate("() => stage42Wizard.proposal.steps[0].reason").startswith("1. Причина")
            assert page.evaluate("() => stage42DocumentSignature()")==prev
            page.screenshot(path=str(ART/"stage42-wizard-preview.png"),full_page=False)
            page.once("dialog",lambda d:d.accept())
            page.locator("#stage42Apply").click()
            page.wait_for_function("() => stage42Wizard.host.hidden",timeout=20000)
            final=page.evaluate("""async () => {
              const first=state.steps[0];
              const photo=await idbGetPhoto(first.id);
              return {count:state.steps.length,
                action:first.action,km:first.keyMoments[0],reason:first.reason,
                meta:state.meta,hasPhoto:first.hasPhoto,
                mediaExt:first.imageExt,photoSize:photo?.blob?.size||0,
                frv:first.frv,second:state.steps[1].action,
                checklist:state.checklist.find(x=>x.id===4)?.score,
                manager:state.documentManager};
            }""")
            assert final["count"]==2,final
            assert final["hasPhoto"] and final["photoSize"]>0,final
            assert final["mediaExt"]=="png",final
            assert final["reason"].startswith("1. Причина"),final
            assert final["frv"]["m2"]=="12",final
            assert final["checklist"]==0.75,final
            assert final["manager"]["currentId"] is None,final
            assert final["manager"]["status"]=="Черновик",final
            assert final["meta"]["operation"]=="Учебный осмотр инструмента",final
            stored=page.evaluate("""async () => {
              const result=await docSaveCurrent('Черновик');
              const stored=await docDbGet(result.id);
              return {id:result.id,steps:stored.snapshot.steps.length,
                photo:stored.snapshot.steps[0].hasPhoto,
                action:stored.snapshot.steps[0].action};
            }""")
            assert stored["steps"]==2 and stored["photo"] and stored["id"],stored
            # Imported IDB photograph must reach the normal corporate XLSX,
            # not just the on-screen preview and local library.
            page.evaluate("""() => {
              state.steps[0].durationSeconds=60;
              state.steps[1].durationSeconds=45;
              state.meta.safety='Учебные требования безопасности';
              state.meta.tools='Учебный инструмент';
              stateToHtml();
            }""")
            with page.expect_download(timeout=90000) as exported:
                page.locator("#generateBtn").click()
            out=ART/"stage42-imported-sop-export.xlsx"
            exported.value.save_as(str(out))
            excel=load_workbook(out)
            assert "СОП" in excel.sheetnames,excel.sheetnames
            assert "ФРВ" in excel.sheetnames,excel.sheetnames
            assert len(excel["СОП"]._images)>=2,(
                "Imported photo plus template logo expected",
                len(excel["СОП"]._images))
            # Compare matching fields with the unchanged Stage41 parser on
            # the exact same workbook. Run in a separate browser context.
            legacy=browser.new_page(viewport={"width":1450,"height":900})
            legacy.route("http://**",lambda route:route.abort())
            legacy.route("https://**",lambda route:route.abort())
            legacy.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=35000)
            set_fixture(legacy)
            baseline=legacy.evaluate("""async () => {
              const n=await importSopFromXlsx(window.__stage42Fixture);
              const photo=await idbGetPhoto(state.steps[0].id);
              return {n,steps:state.steps.map(x=>({
                action:x.action,km:x.keyMoments[0],reason:x.reason})),
                hasPhoto:!!photo?.blob,operation:state.meta.operation};
            }""")
            legacy.close()
            assert baseline["n"]==2 and baseline["hasPhoto"],baseline
            assert baseline["steps"][0]["action"]==final["action"],baseline
            assert baseline["steps"][0]["km"]==final["km"],baseline
            assert baseline["operation"]==final["meta"]["operation"],baseline
            # A fresh malformed layout can still be mapped manually without
            # changing the accepted constructor, even when no step was found.
            original=page.evaluate("() => stage42DocumentSignature()")
            set_fixture(page,False)
            page.locator("#importSopBtn").click()
            feed_file(page)
            assert page.evaluate("() => stage42Wizard.proposal.steps.length")==0
            page.locator('#stage42Grid [data-stage42-cell="D5"]').click()
            page.locator("#stage42FromCell").click()
            assert page.evaluate("() => stage42Wizard.proposal.steps[0].action")=="Осмотреть новую деталь"
            page.locator('[data-stage42-step="0"]').click()
            assert page.evaluate("() => stage42Wizard.cell.row")==5
            assert page.evaluate("() => stage42Wizard.cell.col")==4
            assert page.locator('#stage42Grid td.stage42-selected[data-stage42-cell="D5"]').count()==1
            page.locator('#stage42Grid [data-stage42-cell="D6"]').click()
            page.locator('[data-stage42-use="km"]').click()
            page.locator('#stage42Grid [data-stage42-cell="D7"]').click()
            page.locator('[data-stage42-use="reason"]').click()
            assert page.evaluate("() => stage42Wizard.proposal.steps[0].reason")=="Позволяет выявить повреждение"
            assert page.evaluate("() => stage42DocumentSignature()")==original
            page.once("dialog",lambda d:d.accept())
            page.locator("#stage42Close").click()
            assert page.evaluate("() => stage42DocumentSignature()")==original
            # Stale changes after opening must block apply even if confirmations
            # were accepted. The original document must remain untouched.
            page.locator("#importSopBtn").click()
            feed_file(page)
            page.locator('#stage42Grid [data-stage42-cell="D5"]').click()
            page.locator("#stage42FromCell").click()
            page.evaluate("() => {state.meta.operation='Изменено во второй вкладке'}")
            page.once("dialog",lambda d:d.accept())
            page.locator("#stage42Apply").click()
            page.wait_for_function("() => !stage42Wizard.busy",timeout=15000)
            outcome=page.locator("#stage42Status").inner_text()
            assert "изменился после открытия" in outcome,{"status":outcome,
                "proposal":page.evaluate("() => stage42Wizard.proposal?.steps.length")}
            assert page.evaluate("() => state.meta.operation")=="Изменено во второй вкладке"
            page.locator("#stage42Cancel").click()
            assert not errors,errors
            print("PASS Stage42 Chrome: merged XLSX, 2-step preview, no mutation before apply, "
                  "photo persisted in IDB + library + exported XLSX, legacy parity, FRV/checklist, editable WHY, manual "
                  "unusual XLSX mapping, cancel and stale-state guards",flush=True)
        finally:
            browser.close()

if __name__=="__main__":
    main()
