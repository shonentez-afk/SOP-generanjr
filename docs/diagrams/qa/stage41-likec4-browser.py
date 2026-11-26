"""Read-only Chrome smoke inspection for the official LikeC4 Stage41 website."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright

url = os.environ.get("LIKEC4_SITE_URL","http://127.0.0.1:18767/")
out = Path(os.environ.get("LIKEC4_SHOTS","/tmp/likec4-stage41-shots"))
out.mkdir(parents=True,exist_ok=True)
titles = ["Общее устройство конструктора","Подсистемы внутри автономного HTML","Жизненный цикл СОП",
          "Запросы и ответы ИИ","TWI Job Instruction","Исследование ФРВ",
          "Документы, фото и синхронизация","Excel и локальные ресурсы"]
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(channel="chrome", headless=True)
    page=browser.new_page(viewport={"width":1600,"height":1000},device_scale_factor=1)
    page.on("pageerror",lambda e:errors.append(str(e)))
    response=page.goto(url,wait_until="networkidle",timeout=30000)
    assert response is not None and response.status==200, "HTML server returned bad status"
    page.wait_for_timeout(1300)
    title=page.title()
    body=page.locator("body").inner_text()
    page.screenshot(path=str(out/"01-likec4-home.png"),full_page=True)
    assert len(body.strip())>=20, "LikeC4 page did not render meaningful content"
    # Inspect visible view labels. View routes may be lazy or accessible through a sidebar.
    labels_on_home=[t for t in titles if t in body]
    links=[{"text":a.inner_text().strip()[:110],"href":a.get_attribute("href") or ""}
           for a in page.locator("a[href]").all()[:150]]
    buttons=[b.inner_text().strip()[:110] for b in page.locator("button").all()[:80]]
    visited=[]
    for key in ["СОП","Запросы и ответы ИИ","TWI","ФРВ"]:
        candidates=page.get_by_text(key,exact=False)
        for i in range(min(candidates.count(),8)):
            target=candidates.nth(i)
            if target.is_visible():
                try:
                    target.click(timeout=2000)
                    page.wait_for_timeout(350)
                    visited.append({"key":key,"url":page.url,"title":page.title()})
                    page.screenshot(path=str(out/f"view-{len(visited):02d}.png"),full_page=True)
                    break
                except Exception:
                    continue
    result={
        "title":title,"html_status":response.status,"home_body_prefix":body[:650],
        "recognized_home_labels":labels_on_home,
        "links_sample":links[:45], "buttons_sample":buttons[:45],
        "navigation_attempts":visited,"page_errors":errors
    }
    (out/"likec4-browser-results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
    assert not errors, "LikeC4 JavaScript errors: "+repr(errors[:5])
    browser.close()
print("LIKEC4_BROWSER_RESULT="+json.dumps({
    "http":result["html_status"],"title":title,"home_labels":len(labels_on_home),
    "navigation_checks":len(visited),"js_errors":len(errors)
},ensure_ascii=False))
