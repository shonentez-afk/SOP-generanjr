#!/usr/bin/env python3
"""Real Chrome: choose print layout, export same SOP twice, inspect both XLSX."""
from pathlib import Path
from datetime import timedelta, time
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage43-sop-print-formats-20261125.html"
ART=ROOT/"artifacts/stage43"

def seconds(value):
    if isinstance(value,timedelta): return round(value.total_seconds())
    if isinstance(value,time): return value.hour*3600+value.minute*60+value.second
    return round(float(value)*86400)

def main():
    ART.mkdir(parents=True,exist_ok=True)
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page(viewport={"width":1640,"height":1020},accept_downloads=True)
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=40000)
            page.wait_for_function("!!document.querySelector('#stage43EditorExportFormat')")
            page.evaluate("""async () => {
                Object.assign(state.meta,{branch:'Учебный филиал',department:'Учебный участок',
                  operation:'Учебная проверка оборудования',sopNumber:'00.123.2026',date:'2026-11-25',
                  workplace:'Учебное место',executor:'Учебный исполнитель',safety:'Учебная безопасность',
                  tools:'Учебный инструмент',material:'Учебный материал',approverPost:'Учебный руководитель',
                  approverName:'Учебное имя'});
                state.responsibles=['Участник один','Участник два'];
                state.agreedList=[{post:'Согласующий один',name:'Имя один'},
                  {post:'Согласующий два',name:'Имя два'},{post:'Согласующий три',name:'Имя три'}];
                state.steps=Array.from({length:9},(_,i)=>{
                    const s=createEmptyStep();
                    s.action='Учебное действие '+(i+1);
                    s.keyMoments=Array.from({length:i===0?5:2},(_,j)=>'Учебный пункт '+(j+1));
                    s.reason='Учебная причина '+(i+1);s.durationSeconds=10+i;
                    return s;
                });
                for(const [i,w,h,color] of [[0,80,160,'#ff0000'],[1,160,80,'#0000ff'],[2,60,150,'#008000'],[3,160,80,'#800080'],[8,100,100,'#ff8800']]){
                    const c=document.createElement('canvas');c.width=w;c.height=h;
                    const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,w,h);
                    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
                    const s=state.steps[i];s.imageData=c.toDataURL('image/png');s.imageBuffer=await blob.arrayBuffer();s.imageExt='png';s.hasPhoto=true;
                    if(!await idbPutPhoto(s.id,blob,'png',{annotations:[],updatedAt:Date.now()}))throw new Error('photo fixture');
                }
                stateToHtml();htmlFieldToState();
                window.__stage43Original=JSON.stringify({meta:state.meta,steps:state.steps.map(s=>({id:s.id,action:s.action,keyMoments:s.keyMoments,reason:s.reason,durationSeconds:s.durationSeconds,imageData:s.imageData}))});
            }""")
            assert page.evaluate("stage43ExportFormat")=="portrait"
            books={}
            for orientation,rows,cols,time_cols in [("portrait",[16,20,24],[3,6,10],[5,9,12]),("landscape",[10,14,18],[2,5,9,11],[4,8,10,13])]:
                page.locator(f'#stage43EditorExportFormat [data-stage43-export-format="{orientation}"]').click()
                assert page.locator(f'#stage43LibraryExportFormat [data-stage43-export-format="{orientation}"]').get_attribute("aria-pressed")=="true"
                with page.expect_download(timeout=85000) as download:
                    page.locator("#generateBtn").click()
                path=ART/(orientation+".xlsx")
                download.value.save_as(str(path))
                assert ("АЛЬБОМНАЯ" in download.value.suggested_filename)==(orientation=="landscape")
                book=load_workbook(path);books[orientation]=book
                assert book.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"],book.sheetnames
                ws=book["СОП"]
                assert ws.page_setup.orientation==orientation,ws.page_setup
                assert int(ws.page_setup.paperSize)==8,ws.page_setup
                for i in range(9):
                    rr,cc=rows[i//len(cols)],cols[i%len(cols)]
                    tc=time_cols[i%len(cols)]
                    assert ws.cell(rr,cc).value==f"{i+1}. Учебное действие {i+1}",(orientation,rr,cc,ws.cell(rr,cc).value)
                    assert ws.cell(rr+2,cc).value==f"Учебная причина {i+1}"
                    assert ws.cell(rr+2,cc).alignment.horizontal=="left"
                    assert seconds(ws.cell(rr,tc).value)==10+i,(orientation,rr,tc,ws.cell(rr,tc).value)
                assert "5. Учебный пункт 5" in ws.cell(rows[0]+1,cols[0]).value
                assert len(ws._images)>=11,(orientation,len(ws._images))
                if orientation=="landscape":
                    assert ws["F3"].data_type=="f" and "D10" in ws["F3"].value and "D18" in ws["F3"].value
                    assert str(ws.print_area).endswith("$M$21"),ws.print_area
                    assert ws["G1"].value=="00.123.2026"
                    assert ws["C3"].value=="Учебная проверка оборудования"
                    assert ws["A7"].value=="Учебный исполнитель"
                    assert "Имя три" in ws["L7"].value
                else:
                    assert ws["G5"].data_type=="f"
                same=page.evaluate("JSON.stringify({meta:state.meta,steps:state.steps.map(s=>({id:s.id,action:s.action,keyMoments:s.keyMoments,reason:s.reason,durationSeconds:s.durationSeconds,imageData:s.imageData}))})===window.__stage43Original")
                assert same,"Export format selection changed source SOP"
            for sheet in ("ФРВ","Чек-лист оценки СОП"):
                a,b=(books[x][sheet] for x in ("portrait","landscape"))
                assert list(a.values)==list(b.values),sheet
                assert set(str(x) for x in a.merged_cells.ranges)==set(str(x) for x in b.merged_cells.ranges),sheet
            assert not errors,errors
            print("PASS Stage43: both A3 formats, 9 actions, full KM, reasons, times, photo count, unchanged source and other sheets")
        finally:
            browser.close()

if __name__=="__main__":
    main()
