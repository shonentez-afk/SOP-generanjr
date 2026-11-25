#!/usr/bin/env python3
"""Stage42 real-layout regressions from four user examples, but NO proprietary XLSX or
manufacturing text is checked in. Files are freshly synthesized in browser.
Covers 8-action landscape SOP vs 9-action Example, irregular KM numbering,
images offset -2 rows, and constructor photo background+foreground pairing.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage42-import-wizard-browser-candidate.html"

def main():
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1530,"height":970})
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=40000)
            result=page.evaluate("""async () => {
              await ensureExcelJS();
              const wb=new ExcelJS.Workbook();
              const frv=wb.addWorksheet('ФРВ-Эл.бланк-Анализ');
              for(let n=14;n<19;n++)frv.getCell('J'+n).value=(n-13)+'. Учебная строка метода анализа';
              const ws=wb.addWorksheet('СОП_А3_Альб12');
              ws.getCell('C1').value='Учебный филиал';
              ws.getCell('F1').value='СОП №';
              ws.getCell('G1').value='00.000';
              ws.getCell('K1').value='Дата:';
              ws.getCell('K2').value='00.08.2021г.';
              ws.getCell('A2').value='Подразделение:';
              ws.getCell('A3').value='Учебный цех';
              ws.getCell('C3').value='Учебная замена узла';
              for(const [row,nums] of [[10,[1,2,3,4]],[14,[5,6,7,8]]]){
                ws.getCell('A'+row).value='Действие';
                ws.getCell('A'+(row+1)).value='Ключевой момент';
                ws.getCell('A'+(row+2)).value='Причина';
                const cols=['B','E','I','K'];
                cols.forEach((col,i)=>{
                  ws.getCell(col+row).value=nums[i]+'. Учебное действие '+nums[i];
                  ws.getCell(col+(row+2)).value='Причина выполнения учебного шага';
                });
                ws.getCell('A'+(row-1)).value='Визуализация';
              }
              ws.getCell('B11').value=[
                '1.Предупредить ответственного сотрудника',
                '2 Достать инструмент и подготовить рабочее место',
                '3. Убедиться в отсутствии посторонних предметов',
                'на рабочей поверхности',
                '4 По окончании проверки убрать инструмент',
                '5  Вернуться к плановому заданию'
              ].join('\\n');
              ws.getCell('E11').value=[
                '1. Проверить узел',
                '2. Установить деталь',
                '3 стоять в безопасной зоне',
                '4 Закрепить крепёжный элемент'
              ].join('     ');
              ws.getCell('I11').value='1. Проверить соединение\\n2. Убедиться в правильном положении';
              ws.getCell('K11').value='Выполнить контрольную проверку';
              for(const col of ['B','E','I','K'])
                ws.getCell(col+'15').value='1. Подготовить рабочую область\\n2. Проверить результат';
              // Excel numeric time/date cells must not become extra actions.
              ws.getCell('D10').value=new Date(1899,11,30,0,0,20);
              ws.getCell('D10').numFmt='mm:ss';
              const c=document.createElement('canvas');c.width=16;c.height=16;
              c.getContext('2d').fillRect(2,2,12,12);
              const photo=wb.addImage({base64:c.toDataURL('image/png'),extension:'png'});
              for(const [ri,col] of [
                [7,1],[8,4],[7,8],[8,9],
                [12,1],[12,4],[12,8],[12,10]
              ])ws.addImage(photo,{tl:{row:ri,col},br:{row:ri+.6,col:col+.8}});
              // Additional header logo & safety mark should stay unassigned.
              ws.addImage(photo,{tl:{row:0,col:0},br:{row:.5,col:.8}});
              ws.addImage(photo,{tl:{row:23,col:1},br:{row:23.7,col:1.7}});
              const example=wb.addWorksheet('Пример');
              for(const row of [12,16,20]){
                example.getCell('A'+row).value='Действие';
                example.getCell('A'+(row+1)).value='Ключевой момент';
                example.getCell('A'+(row+2)).value='Причина';
                for(const col of ['B','E','I'])example.getCell(col+row).value=
                  (row-11)+'. Учебное действие примера';
              }
              wb.addWorksheet('ЧЛ_Оценка СОП');
              const data=await wb.xlsx.writeBuffer();
              const file=new File([data],'stage42-layout-enterprise.xlsx',{
                type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
              const p=await stage42ParseFile(file);
              const result={sheet:p.sourceSheet,count:p.steps.length,
                sources:p.steps.map(x=>x.source.action),
                moments:p.steps.map(x=>x.keyMoments),
                photoIndices:p.steps.map(x=>x.photoIndex),
                unused:p.media.filter(x=>x.assigned===-1&&!x.auxiliary).length,
                media:p.media.length,
                defaultAction:p.steps[0].action,
                meta:p.meta,
                time:p.steps[0].durationSeconds,
                exampleCount:stage42SheetEvidence(example).count,
                warnings:p.warnings};
              stage42ReleaseProposal(p);
              return result;
            }""")
            assert result["sheet"]=="СОП_А3_Альб12",result
            assert result["count"]==8,result
            assert result["meta"]["sopNumber"]=="00.000",result
            assert result["meta"]["department"]=="Учебный цех",result
            assert not result["meta"].get("date"),result
            assert result["exampleCount"]==9,result
            assert result["sources"]==[
                "B10","E10","I10","K10","B14","E14","I14","K14"],result
            assert list(map(len,result["moments"]))==[5,4,2,1,2,2,2,2],result
            assert "рабочей поверхности" in result["moments"][0][2],result
            assert result["moments"][0][0]=="Предупредить ответственного сотрудника",result
            assert result["moments"][0][1].startswith("Достать инструмент"),result
            assert result["moments"][1][2].startswith("стоять в безопасной зоне"),result
            assert result["photoIndices"]==list(range(8)),result
            assert result["media"]==10 and result["unused"]==2,result
            generated=page.evaluate("""async () => {
              const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('СОП');
              ws.getCell('G2').value='СОП №:';
              ws.getCell('G3').value='12.034.2026. Версия 1';
              ws.getCell('B15').value='Визуализация';
              ws.getCell('B16').value='Действие';
              ws.getCell('B17').value='Ключевой момент';
              ws.getCell('B18').value='Причина';
              ws.getCell('C16').value='1. Проверить корпус учебного устройства';
              ws.getCell('F16').value='2. Проверить фиксацию крепления';
              ws.getCell('J16').value='3. Записать результаты проверки';
              ws.getCell('C17').value='1. Осмотреть корпус';
              ws.getCell('F17').value='1. Проверить крепёж';
              ws.getCell('J17').value='1. Заполнить журнал';
              const canvas=document.createElement('canvas');
              const ctx=canvas.getContext('2d');canvas.width=30;canvas.height=30;
              ctx.fillStyle='#eee';ctx.fillRect(0,0,30,30);
              const bg=wb.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});
              ctx.fillStyle='#080808';ctx.fillRect(0,0,30,30);
              const fg=wb.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});
              for(const col of [2,5]){
                ws.addImage(bg,{tl:{row:14,col},br:{row:14.7,col:col+.8}});
                ws.addImage(fg,{tl:{row:14,col},br:{row:14.7,col:col+.8}});
              }
              ws.addImage(bg,{tl:{row:1,col:1},br:{row:1.7,col:1.7}});
              ws.addImage(bg,{tl:{row:13,col:1},br:{row:13.7,col:1.7}});
              const buffer=await wb.xlsx.writeBuffer();
              const p=await stage42ParseFile(new File([buffer],'constructor-export.xlsx',{
                type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
              const data={sheet:p.sourceSheet,count:p.steps.length,
                sopNumber:p.meta.sopNumber,
                photoIndices:p.steps.map(x=>x.photoIndex),
                chosenAux:p.steps.map(x=>p.media[x.photoIndex]?.auxiliary),
                auxiliary:p.media.filter(x=>x.auxiliary).length,
                unassigned:p.media.filter(x=>x.assigned===-1&&!x.auxiliary).length,
                media:p.media.length,
                matched:p.steps[0].photoIndex>=0&&p.steps[1].photoIndex>=0};
              stage42ReleaseProposal(p);
              return data;
            }""")
            assert generated["count"]==3,generated
            assert generated["sopNumber"]=="12.034.2026. Версия 1",generated
            assert generated["photoIndices"]==[1,3,-1],generated
            assert generated["auxiliary"]==2,generated
            assert generated["unassigned"]==2,generated
            assert generated["media"]==6,generated
            assert generated["matched"],generated
            assert not errors,errors
            print("PASS Stage42 enterprise layouts: actual SOP over Example 8:9, "
                  "landscape B/E/I/K actions and 8 photos including row-2; "
                  "irregular 1. / 2 / 3 sequences and wrapped KMs; "
                  "constructor layered foreground selected over blurred background",
                  flush=True)
        finally:
            browser.close()

if __name__=="__main__":
    main()
