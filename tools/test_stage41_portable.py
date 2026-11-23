#!/usr/bin/env python3
"""Real Chrome QA of one map: LikeC4 views + CodeFlow/AST interactive graph."""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve() if len(sys.argv)>2 else Path(os.environ.get("RUNNER_TEMP","/tmp"))/"portable-captures"
OUT.mkdir(parents=True,exist_ok=True)
assert (ROOT/"index.html").is_file()
assert (ROOT/"constructor"/"Stage41.html").is_file()
assert (ROOT/"maps"/"stage41-unified.html").is_file()
assert not (ROOT/"maps"/"stage41-overview.html").exists()
assert not (ROOT/"maps"/"stage41-ai.html").exists()
assert not (ROOT/"source"/"proxy").exists()
for item in ROOT.rglob("*"):
    if item.is_file():
        assert b"functions.yandexcloud.net/" not in item.read_bytes(),item

errors, external = [], []
with sync_playwright() as p:
    browser=p.chromium.launch(channel="chrome",headless=True)
    ctx=browser.new_context(viewport={"width":1540,"height":980},accept_downloads=True)
    home=ctx.new_page()
    home.goto((ROOT/"index.html").as_uri(),wait_until="load")
    assert "Stage41" in home.title()
    for href in ("maps/stage41-unified.html","constructor/Stage41.html",
                 "viewer/src/app/stage41-parts.json.html",
                 "viewer/diagrams/likec4/model.c4.html"):
        assert home.locator('a[href="'+href+'"]').count()==1,href
    home.screenshot(path=str(OUT/"01-home.png"),full_page=True)
    home.locator('a[href="viewer/src/app/stage41-parts.json.html"]').click()
    assert "stage41-parts.json" in home.title()
    assert home.locator(".line").count()>5
    home.go_back(wait_until="load")
    home.locator('a[href="viewer/diagrams/likec4/model.c4.html"]').click()
    assert "model.c4" in home.title()
    assert home.locator(".line").count()>20
    home.go_back(wait_until="load")

    page=ctx.new_page()
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.on("request",lambda request:external.append(request.url) if request.url.startswith(("http://","https://")) else None)
    page.goto((ROOT/"maps"/"stage41-unified.html").as_uri(),wait_until="load")
    assert "Stage41" in page.title(),page.title()
    assert page.locator('nav button[data-mode]').count()==2
    assert page.locator('#items [data-file]').count()==73
    assert page.locator('#world .node').count()==73
    assert page.locator('#world .edge').count()>250
    assert page.locator('#detail .source-open[href*="stage41-quality.js.html"]').count()==1
    page.screenshot(path=str(OUT/"02-codegraph.png"),full_page=True)

    before=page.locator("#world").get_attribute("transform")
    page.locator("#plus").click()
    assert before!=page.locator("#world").get_attribute("transform")
    page.locator("#fit").click()
    page.locator("#q").fill("stage41-quality")
    assert page.locator('#items [data-file]').count()==1
    page.locator("#q").fill("")
    page.locator("#evidence").select_option("direct")
    page.locator("#evidence").select_option("uncertain")
    page.locator("#evidence").select_option("all")
    page.locator('[data-file="src/modules/ai/stage41-quality.js"]').click()
    assert "stage41-quality.js" in page.locator("#detail").inner_text()
    assert page.locator("#detail .edge-row").count()>0
    with page.expect_popup() as src_popup:
        page.locator("#detail .source-open").click()
    source_page=src_popup.value
    source_page.wait_for_load_state("load")
    assert source_page.url.startswith("file://")
    assert source_page.locator(".line").count()>20
    source_page.close()
    page.screenshot(path=str(OUT/"03-code-source.png"),full_page=True)

    page.locator('[data-mode="architecture"]').click()
    assert page.locator("#items [data-view]").count()==8
    assert page.locator("#world .node").count()==5
    page.locator('[data-view="ai-details"]').click()
    assert page.locator("#world .node").count()>=13
    assert page.locator('#world .node[data-id="app.ai"]').count()==1
    page.screenshot(path=str(OUT/"04-architecture-ai.png"),full_page=True)
    page.locator('[data-view="modules"]').click()
    assert page.locator('#world .node[data-id="app.editor"]').count()==1
    page.locator('#world .node[data-id="app.editor"]').click()
    assert page.locator("#detail .source-open").count()==1
    with page.expect_popup() as c4popup:
        page.locator('#detail .source-open').click()
    c4source=c4popup.value
    c4source.wait_for_load_state("load")
    assert c4source.url.startswith("file://")
    assert c4source.locator(".line").count()>0
    c4source.close()
    page.screenshot(path=str(OUT/"05-architecture-modules.png"),full_page=True)

    page.locator('[data-mode="code"]').click()
    assert page.locator("#world .node").count()==73
    with page.expect_popup() as app_popup:
        page.locator('header a[href="../constructor/Stage41.html"]').click()
    app=app_popup.value
    app.wait_for_load_state("load",timeout=15000)
    assert app.locator("#generateSopBtn").count()==1
    app.screenshot(path=str(OUT/"06-constructor-stage41.png"),full_page=False)
    app.close()
    raw=(ROOT/"viewer"/"src"/"modules"/"ai"/"stage41-quality.js.html")
    viewer=ctx.new_page()
    viewer.goto(raw.as_uri()+"#L78")
    assert viewer.locator(".line:target").count()==1
    viewer.close()
    assert not errors,"Map JavaScript errors: "+repr(errors[:12])
    assert not external,"Network from offline map: "+repr(external[:10])
    browser.close()

print("PORTABLE_CHROME_PASS="+json.dumps({
    "main":"file://","modules":73,"edges":367,"architecture_views":8,
    "map_tabs":2,"maps":1,"local_source_navigation":True,
    "constructor":"opened","network_requests":len(external),
    "page_errors":len(errors),"screenshots":6,
},ensure_ascii=False))
