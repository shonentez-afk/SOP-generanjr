#!/usr/bin/env python3
"""Actual Chrome file:// QA for the unpacked full Stage41 portable package."""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT=Path(sys.argv[1]).resolve()
OUT=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else Path(os.environ.get("RUNNER_TEMP","/tmp"))/"portable-captures"
OUT.mkdir(parents=True,exist_ok=True)
assert (ROOT/"index.html").is_file() and (ROOT/"constructor"/"Stage41.html").is_file()
errors=[]
external=[]

with sync_playwright() as p:
    browser=p.chromium.launch(channel="chrome",headless=True)
    ctx=browser.new_context(viewport={"width":1540,"height":980},accept_downloads=True)
    page=ctx.new_page()
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.on("request",lambda request: external.append(request.url) if request.url.startswith(("http://","https://")) else None)

    page.goto((ROOT/"index.html").as_uri(),wait_until="load")
    assert "Stage41" in page.title()
    assert page.locator('a[href="maps/stage41-unified.html"]').count()==1
    assert page.locator('a[href="constructor/Stage41.html"]').count()==1
    page.screenshot(path=str(OUT/"01-home.png"),full_page=True)

    page.locator('a[href="maps/stage41-unified.html"]').click()
    assert "Stage41" in page.title(),page.title()
    assert page.locator("#frame").count()==1
    assert page.locator('nav a[href="../constructor/Stage41.html"]').count()==1
    assert page.locator('nav [data-tab]').count()==4
    frame=page.frame_locator("#frame")
    assert frame.locator('.node').count()>=14
    frame.locator('.node[data-id="ai"]').click()
    assert frame.locator("#details a").count()>=1
    links=frame.locator('#details a')
    local_refs=links.evaluate_all("(items)=>items.map(x=>x.getAttribute('href')).filter(x=>x&&x.includes('../viewer/'))")
    assert len(local_refs)>0,"Overview did not link to local source viewer"
    assert all("http" not in x for x in local_refs)
    page.screenshot(path=str(OUT/"02-overview-local-links.png"),full_page=True)

    page.locator('[data-tab="ai"]').click()
    frame.locator("body").wait_for()
    assert "Stage41" in frame.locator("body").inner_text()
    assert frame.locator('a[href*="../viewer/"]').count()>=1
    page.screenshot(path=str(OUT/"03-ai-local-links.png"),full_page=True)

    page.locator('[data-tab="deps"]').click()
    assert page.locator('#modules button[data-path]').count()==73
    page.locator('[data-short="src/modules/ai/stage41-quality.js"]').click()
    assert "stage41-quality.js" in page.locator("#moduleName").inner_text()
    page.locator("#evidence").select_option("uncertain")
    page.locator("#evidence").select_option("direct")
    page.locator("#evidence").select_option("all")
    if page.locator("#outgoing .dep").count():
        page.locator("#outgoing .dep").first.click()
    else:
        page.locator("#incoming .dep").first.click()
    assert page.locator("#detail tbody tr").count()>0
    assert page.locator("#detail a[href*='../viewer/']").count()>0
    page.screenshot(path=str(OUT/"04-dependencies.png"),full_page=True)

    source=(ROOT/"viewer"/"src"/"modules"/"ai"/"stage41-quality.js.html")
    assert source.is_file()
    view=ctx.new_page()
    view.goto(source.as_uri()+"#L78")
    assert view.locator(".line:target").count()==1
    assert "stage41-quality.js" in view.title()
    assert view.locator("header a").count()==2
    view.screenshot(path=str(OUT/"05-source-line.png"),full_page=False)
    view.close()

    page.locator('[data-tab="c4"]').click()
    assert page.locator("#c4Cards .card").count()==8
    assert page.locator("#c4Panel a[href='../diagrams/likec4/model.c4']").count()==1
    page.locator('#c4Cards [data-view="2"]').click()
    assert page.locator("#iframePanel").is_visible()
    page.screenshot(path=str(OUT/"06-c4-level.png"),full_page=True)

    with page.expect_popup() as popup_info:
        page.locator('nav a[href="../constructor/Stage41.html"]').click()
    app=popup_info.value
    app.wait_for_load_state("load",timeout=15000)
    assert "СОП" in app.title().upper() or "SOP" in app.title().upper(),app.title()
    assert app.locator("#generateSopBtn").count()==1
    app.screenshot(path=str(OUT/"07-constructor-stage41.png"),full_page=False)
    app.close()

    assert not external,"Architecture requested network unexpectedly: "+repr(external[:10])
    assert not errors,"Architecture JavaScript errors: "+repr(errors[:10])
    browser.close()

print("PORTABLE_CHROME_PASS="+json.dumps({
    "main":"file://","modules":73,"maps":4,"local_source_navigation":True,
    "constructor":"opened","network_requests":len(external),"page_errors":len(errors),
    "screenshots":7
},ensure_ascii=False))
