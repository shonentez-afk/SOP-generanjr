#!/usr/bin/env python3
"""Stage36: Chrome file:// checks for portable library and two-tab write conflicts."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage36-library-safety-browser-candidate.html"
OUT=ROOT/"artifacts"

def previous_regression():
    spec=importlib.util.spec_from_file_location("stage35QA",ROOT/"qa/stage35_browser_smoke.py")
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RELEASE=RELEASE
    module.main()

def stage36_browser():
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        context=browser.new_context(viewport={"width":1450,"height":1000},accept_downloads=True)
        p=context.new_page()
        errors=[]
        for page in [p]:
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("http://**",lambda route:route.abort())
            page.route("https://**",lambda route:route.abort())
        try:
            p.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            assert p.locator("#doc36ExportAllBtn").count()==1
            assert p.locator("#doc36ImportAllBtn").count()==1
            assert p.locator("#frv36SaveConflictCopyBtn").count()==1
            # Create a saved SOP with photo, plus an independent measurement.
            p.evaluate("""async () => {
              const doc={id:'SOP-STAGE36-QA',status:'Черновик',number:'Черновик',
                seqNo:null,deptCode:'',year:2026,version:1,createdAt:Date.now(),
                updatedAt:Date.now(),snapshot:{meta:{operation:'SOP36 QA'},steps:[
                  {id:361,action:'Check machine',hasPhoto:true}]}};
              const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
              const blob=new Blob([bytes],{type:'image/png'});
              if(!(await idbPutPhoto(photoDocumentRecordKey(doc.id,361),blob,'png',
                   {annotations:[{type:'badge',x:5,y:6,n:1}]}))) throw Error('photo save');
              await docDbPut(doc);
              const d=frvStudyEmptyData();
              d.operationId='FRV36 QA study';
              d.cycles[0].observations[0].actionRaw='Observe';
              d.cycles[0].observations[0].durationSec=23.75;
              await frvStudySwitchTo(d);
              window.stage36Id=d.libraryId;
            }""")
            backup=p.evaluate("async () => await stage36BuildAllBackup()")
            assert len(backup["documents"])==1 and len(backup["studies"])==1,backup
            assert backup["documents"][0]["photoAssets"]["361"]["original"].startswith("data:image/")
            assert backup["integrity"]["sha256"]
            p.evaluate("""async p => {
              await stage36ValidateBackup(p);
              const modified=JSON.parse(JSON.stringify(p));
              modified.documents[0].constructor.steps[0].action='tampered';
              let rejected=false;
              try{await stage36ValidateBackup(modified)}catch(e){rejected=true}
              if(!rejected)throw Error('tamper bypass');
            }""",backup)
            # Fresh import and repeat import: no duplicates, no mutation.
            p.evaluate("""async () => {
              const d=await docDbOpen();
              await new Promise((res,rej)=>{
                const tx=d.transaction(DOC_STORE,'readwrite');
                tx.objectStore(DOC_STORE).delete('SOP-STAGE36-QA');
                tx.oncomplete=res;tx.onerror=rej;
              });d.close();
              await idbDeletePhoto(photoDocumentRecordKey('SOP-STAGE36-QA',361));
              await frv34StoreRemove(window.stage36Id);
              state.frvStudy=null;
              frv36KnownRevisions.delete(window.stage36Id);
            }""")
            result=p.evaluate("""async pack => {
              const plan=await stage36MakePlan(pack);
              await stage36CommitPlan(plan);
              const again=await stage36MakePlan(pack);
              const doc=await docDbGet('SOP-STAGE36-QA');
              const photo=await idbGetPhoto(photoDocumentRecordKey('SOP-STAGE36-QA',361));
              return {stats:plan.stats,again:again.stats,doc:doc?.snapshot?.meta?.operation,
                photoSize:photo?.blob?.size,annotations:photo?.annotations?.length,
                saved:!!(await frv34StoreGet(window.stage36Id))};
            }""",backup)
            assert result["stats"]["sopNew"]==1 and result["stats"]["frvNew"]==1,result
            assert result["again"]["sopSkipped"]==1 and result["again"]["frvSkipped"]==1,result
            assert result["doc"]=="SOP36 QA" and result["photoSize"]==12 and result["annotations"]==1,result
            assert result["saved"],result
            # Conflicting restore adds an independent copy; original untouched.
            result=p.evaluate("""async pack => {
              const d=await docDbGet('SOP-STAGE36-QA');
              d.snapshot.meta.operation='Locally changed';await docDbPut(d);
              const local=await frv34StoreGet(window.stage36Id);
              local.payload.cycles[0].observations[0].durationSec=27;
              await frv34StorePut(local,frv36RecordRevision(local));
              const plan=await stage36MakePlan(pack);
              const stats=await stage36CommitPlan(plan);
              return {stats,original:(await docDbGet('SOP-STAGE36-QA')).snapshot.meta.operation,
                originalSeconds:(await frv34StoreGet(window.stage36Id)).payload.cycles[0]
                .observations[0].durationSec,
                docs:(await docDbGetAll()).length,studies:(await frv34StoreAll()).length};
            }""",backup)
            assert result["stats"]["sopCopied"]==1 and result["stats"]["frvCopied"]==1,result
            assert result["original"]=="Locally changed" and result["originalSeconds"]==27,result
            assert result["docs"]==2 and result["studies"]==2,result
            # Separate tab editing exactly the same research.
            p.evaluate("""async () => {const rec=await frv34StoreGet(window.stage36Id);
              await frvStudySwitchTo(rec.payload,{persist:false});
              frv36KnownRevisions.set(rec.id,frv36RecordRevision(rec));}""")
            other=context.new_page()
            other.on("pageerror",lambda e:errors.append(str(e)))
            other.route("http://**",lambda route:route.abort())
            other.route("https://**",lambda route:route.abort())
            other.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            other.locator('[data-tab="frvstudy"]').click()
            other.evaluate("""async id => {await frvStudyOpenById(id)}""",
                           p.evaluate("() => window.stage36Id"))
            p.evaluate("""() => {
              state.frvStudy.cycles[0].observations[0].durationSec=31;
              frvStudyQueuePersist();
            }""")
            p.wait_for_function("""() => document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""")
            other.evaluate("""() => {
              state.frvStudy.cycles[0].observations[0].durationSec=45;
              frvStudyQueuePersist();
            }""")
            other.wait_for_function("""() =>
              !document.querySelector('#frv36SaveConflictCopyBtn')?.classList.contains('hidden')""",
              timeout=20000)
            other.locator("#frv36SaveConflictCopyBtn").click()
            other.wait_for_function("""() =>
              document.querySelector('#frvStudySaveStatus')?.dataset.status==='saved'""")
            observed=other.evaluate("""async id => ({
               original:(await frv34StoreGet(id)).payload.cycles[0].observations[0].durationSec,
               copy:state.frvStudy.cycles[0].observations[0].durationSec,
               copyId:state.frvStudy.libraryId
            })""",p.evaluate("() => window.stage36Id"))
            assert observed["original"]==31 and observed["copy"]==45,observed
            assert observed["copyId"]!=p.evaluate("() => window.stage36Id"),observed
            p.screenshot(path=str(OUT/"stage36-library-safety.png"),full_page=True)
            assert not errors,errors
            print("PASS Stage36: checked SOP/photo/FRV backup, repeated import, conflict copy and two browser tabs",flush=True)
        finally:
            browser.close()

def main():
    previous_regression()
    stage36_browser()

if __name__=="__main__":
    main()
