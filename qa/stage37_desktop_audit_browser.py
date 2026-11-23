#!/usr/bin/env python3
"""Stage37 desktop audit: browser data-loss guards, seven real screens, full regression."""
from __future__ import annotations
import importlib.util
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage37-desktop-audit-browser-candidate.html"
ART=ROOT/"artifacts"
SHOTS=ROOT/"docs"/"img"

def accepted_regression():
    spec=importlib.util.spec_from_file_location(
        "sop361_accepted",ROOT/"qa/stage36_1_twi_print_browser.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RELEASE=RELEASE
    mod.main()

def make_page(context,errors):
    p=context.new_page()
    p.on("pageerror",lambda e:errors.append(str(e)))
    p.route("http://**",lambda route:route.abort())
    p.route("https://**",lambda route:route.abort())
    p.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
    return p

def draft_recovery(p):
    # Put a valid old draft in storage, as it exists when the user opens a
    # newer standalone HTML in Chrome. Prevent fixture's current beforeunload
    # from overwriting what would otherwise be the prior owner's draft.
    raw=p.evaluate("""() => {
      const d=collectDraft();
      d.savedAt=Date.now()-3600*1000;
      d.meta.operation='Несохранённый черновик Stage37 QA';
      d.steps=[{id:37001,action:'Не потерять проверку',keyMoments:['Отменить перезапись'],
        reason:'Сохранность данных',durationSeconds:33}];
      const raw=JSON.stringify(d);
      localStorage.setItem(DRAFT_KEY,raw);
      stage37DraftDecisionPending=true;
      return raw;
    }""")
    p.reload(wait_until="domcontentloaded")
    assert p.locator("#draftBanner").is_visible()
    assert p.locator("#draftRestoreBtn").is_visible()
    same=p.evaluate("""() => {
      saveDraft(); // must NOT replace the unconfirmed saved draft
      return localStorage.getItem(DRAFT_KEY)
    }""")
    assert same==raw,"Unconfirmed saved draft was silently overwritten"
    p.reload(wait_until="domcontentloaded")
    assert p.evaluate("() => localStorage.getItem(DRAFT_KEY)")==raw
    assert p.locator("#draftBanner").is_visible()
    p.locator("#draftRestoreBtn").click()
    p.wait_for_function("() => document.querySelector('#draftBanner').classList.contains('hidden')")
    assert p.evaluate("() => state.meta.operation")=="Несохранённый черновик Stage37 QA"
    assert p.evaluate("() => state.steps[0].action")=="Не потерять проверку"
    assert not p.evaluate("() => stage37DraftDecisionPending")
    assert p.evaluate("() => !!localStorage.getItem(DRAFT_KEY)")
    print("PASS Stage37: recovery survives repeated reload/unload; no silent overwrites",flush=True)

def malformed_draft(context,errors):
    p=make_page(context,errors)
    p.evaluate("""() => {
      localStorage.setItem(DRAFT_KEY,'{corrupted Stage37 QA');
      stage37DraftDecisionPending=true;
    }""")
    p.reload(wait_until="domcontentloaded")
    assert p.locator("#draftBanner").is_visible()
    assert "Скачать" in p.locator("#draftRestoreBtn").inner_text()
    with p.expect_download(timeout=20000) as down:
        p.locator("#draftRestoreBtn").click()
    assert down.value.suggested_filename.endswith(".txt")
    text=Path(ART/"stage37-unreadable-draft.txt")
    down.value.save_as(str(text))
    assert text.read_text(encoding="utf-8")=="{corrupted Stage37 QA"
    p.once("dialog",lambda d:d.dismiss())
    p.locator("#draftDismissBtn").click()
    assert p.evaluate("() => localStorage.getItem(DRAFT_KEY)")=="{corrupted Stage37 QA"
    p.once("dialog",lambda d:d.accept())
    p.locator("#draftDismissBtn").click()
    assert p.evaluate("() => localStorage.getItem(DRAFT_KEY)") is None
    p.close()
    print("PASS Stage37: unreadable drafts downloadable and deleted only after confirmation",flush=True)

def document_guard_and_gallery(p):
    # Two locally saved SOPs; the first has unsaved changes in BOTH steps
    # and TWI. The guard must not erase these on an accidental library click.
    p.evaluate("""async () => {
      const a=createEmptyStep();
      a.id=37001;a.action='Остановить оборудование';
      a.keyMoments=['Отключить привод','Убедиться в остановке'];
      a.reason='Безопасность работника';
      a.durationSeconds=60;
      state.steps=[a];
      state.meta.operation='Проверка оборудования — учебный пример';
      state.meta.department='Участок 1';
      state.meta.workplace='Линия обслуживания';
      state.meta.executor='Оператор';
      state.meta.safety='Остановить оборудование; применить СИЗ';
      state.meta.tools='Ключ, защитные перчатки';
      state.meta.material='Салфетки';
      state.twi={
        enabled:true,trainer:'Иванов И.И.',trainee:'Петров П.П.',
        prepare:{purpose:'Изучить безопасное выполнение работы',
          known:'Знаком с оборудованием',prep:'Подготовить инструменты и СИЗ',
          interest:'Работать без ошибок и травм'},
        present:{round1:'Показать операцию целиком',
          round2:'Назвать важные шаги и ключевые моменты',
          round3:'Пояснить причины'},
        tryOut:{perform:'Повторить операцию',explain:'Назвать шаги',
          check:'Проверить безопасное выполнение',correct:'Исправить ошибки'},
        followUp:{help:'Мастер смены',control:'Первые самостоятельные выполнения',
          observe:'Безопасность и качество',close:'Работает без подсказок'}
      };
      state.twi.sourceSignature=twiSourceSignature();
      stateToHtml();
      const snap=docSnapshot();
      const now=Date.now();
      const base={id:'STAGE37-TEST-A',status:'Черновик',seqNo:null,
        deptCode:'',year:2026,version:1,number:'Черновик',
        title:snap.meta.operation,createdAt:now,updatedAt:now,
        createdBy:'',publishedBy:'',versionOf:null,snapshot:snap};
      const other=structuredClone(base);other.id='STAGE37-TEST-B';
      other.snapshot.meta.operation='Другой сохранённый СОП';
      other.snapshot.steps[0].action='Очистить оборудование';
      other.title=other.snapshot.meta.operation;
      await docDbPut(base);await docDbPut(other);
      docLoadToState(base);
      renderSteps();renderFrv();renderTwi();renderChecklist();
    }""")
    assert p.evaluate("() => state.documentManager.currentId")=="STAGE37-TEST-A"
    # Dirty edits cannot be silently overwritten.
    p.evaluate("""() => {
      state.steps[0].action='НЕ СОХРАНЕНО: проверить подшипник';
      state.twi.prepare.purpose='НЕ СОХРАНЕНО: обучение';
      renderSteps();twiToHtml();
    }""")
    p.once("dialog",lambda d:d.dismiss())
    p.evaluate("async () => await docOpen('STAGE37-TEST-B')")
    assert p.evaluate("() => state.documentManager.currentId")=="STAGE37-TEST-A"
    assert p.evaluate("() => state.steps[0].action").startswith("НЕ СОХРАНЕНО:")
    p.once("dialog",lambda d:d.accept())
    p.evaluate("async () => await docOpen('STAGE37-TEST-B')")
    assert p.evaluate("() => state.documentManager.currentId")=="STAGE37-TEST-B"
    assert p.evaluate("() => state.meta.operation")=="Другой сохранённый СОП"
    assert p.evaluate("async () => (await docDbGet('STAGE37-TEST-A')).snapshot.steps[0].action")=="Остановить оборудование"
    print("PASS Stage37: library Open warns, Cancel keeps unsaved SOP/TWI, confirm changes only active editor",flush=True)
    # New SOP: meta-only content is protected, even with no action rows.
    p.evaluate("""() => {
      state.documentManager={currentId:null,status:'Черновик'};
      state.steps=[];state.description='';state.meta.operation='Только название, ещё без шагов';
      stateToHtml();
    }""")
    p.once("dialog",lambda d:d.dismiss())
    p.evaluate("async () => await docNew()")
    assert p.evaluate("() => state.meta.operation")=="Только название, ещё без шагов"
    print("PASS Stage37: meta-only new SOP guarded",flush=True)
    # Use saved illustrative record for screenshots, not any private project.
    p.evaluate("""async () => {
      const doc=await docDbGet('STAGE37-TEST-A');
      docLoadToState(doc);
      renderSteps();renderFrv();renderChecklist();renderTwi();renderFrvStudy();
    }""")
    assert p.locator("#sopVersionLabel").count()==1
    assert any(v in p.locator("#sopVersionLabel").inner_text() for v in ("Stage37","Stage38","Stage39"))
    # Wait until the normal transient "Opened" toast has faded, so that
    # documentation screenshots show the complete toolbar and AI indicator.
    p.wait_for_timeout(3900)
    assert not p.locator("#toastContainer .toast").is_visible()
    paths={}
    for tab,filename in [
      ("editor","stage37-editor.png"),
      ("frv","stage37-frv.png"),
      ("preview","stage37-preview.png"),
      ("checklist","stage37-checklist.png"),
      ("frvstudy","stage37-frv-analysis.png"),
      ("twi","stage37-twi.png"),
      ("documents","stage37-library.png")]:
        p.locator(f'[data-tab="{tab}"]').click()
        p.locator("#tab-"+tab).wait_for(state="visible")
        p.wait_for_timeout(250)
        path=SHOTS/filename
        p.screenshot(path=str(path),full_page=False)
        assert path.stat().st_size>6000,(path,path.stat().st_size)
        paths[tab]=path.name
    assert len(set(paths.values()))==7
    print("PASS Stage37: 7 real desktop Chrome screenshots generated from safe illustrative SOP, not mockups",flush=True)

def main():
    ART.mkdir(parents=True,exist_ok=True)
    SHOTS.mkdir(parents=True,exist_ok=True)
    accepted_regression()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome",headless=True,
          args=["--no-sandbox","--disable-dev-shm-usage"])
        errors=[]
        ctx=browser.new_context(viewport={"width":1500,"height":930},accept_downloads=True)
        try:
            page=make_page(ctx,errors)
            draft_recovery(page)
            page.close()
            malformed_draft(browser.new_context(
              viewport={"width":1500,"height":930},accept_downloads=True),errors)
            gallery=make_page(browser.new_context(
              viewport={"width":1500,"height":930},accept_downloads=True),errors)
            document_guard_and_gallery(gallery)
            assert not errors,errors
        finally:
            browser.close()
    print("PASS Stage37: desktop recovery, document navigation, metadata, seven tabs and all previous regressions",flush=True)

if __name__=="__main__":
    main()
