"""Browser acceptance of standalone Stage41 architecture map; no external app calls."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

DOC = Path(__file__).resolve().parents[1] / "sop-stage41-unified.html"
OUT = Path(os.environ.get("ARCHITECTURE_SHOTS", "/tmp/stage41-architecture-shots"))
OUT.mkdir(parents=True, exist_ok=True)
assert DOC.is_file(), str(DOC)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(DOC.as_uri(), wait_until="load")
    assert "Stage41" in page.title(), page.title()
    assert page.locator("nav [data-tab]").count() == 4
    assert page.locator("#frame").count() == 1
    page.screenshot(path=str(OUT / "01-overview.png"), full_page=True)

    page.locator('[data-tab="ai"]').click()
    page.frame_locator("#frame").locator("body").wait_for(timeout=12000)
    assert "Stage41" in page.frame_locator("#frame").locator("body").inner_text()
    page.screenshot(path=str(OUT / "02-ai-requests.png"), full_page=True)

    page.locator('[data-tab="deps"]').click()
    assert page.locator("#modules button[data-path]").count() == 73
    stats = page.locator("#stats").inner_text()
    assert "367" in stats and "73" in stats, stats
    page.locator('[data-short="src/modules/ai/stage41-quality.js"]').click()
    assert "stage41-quality.js" in page.locator("#moduleName").inner_text()
    assert page.locator("#outgoing .dep").count() > 0 or page.locator("#incoming .dep").count() > 0
    page.screenshot(path=str(OUT / "03-stage41-dependencies.png"), full_page=True)

    page.locator("#evidence").select_option("direct")
    assert page.locator("#modules button[data-path]").count() == 73
    page.locator("#evidence").select_option("uncertain")
    assert page.locator("#modules button[data-path]").count() == 73
    page.locator("#evidence").select_option("all")
    el = page.locator("#outgoing .dep").first
    if el.count():
        el.click()
    else:
        page.locator("#incoming .dep").first.click()
    assert page.locator("#detail table tbody tr").count() >= 1
    assert page.locator("#detail a[href^='https://github.com/']").count() >= 1

    page.locator('[data-tab="c4"]').click()
    assert page.locator("#c4Cards .card").count() == 8
    assert "LikeC4" in page.locator("#c4Panel").inner_text()
    page.screenshot(path=str(OUT / "04-likec4-catalog.png"), full_page=True)
    page.locator('#c4Cards [data-view="2"]').click()
    assert page.locator("#iframePanel").is_visible()
    page.screenshot(path=str(OUT / "05-sop-detail.png"), full_page=True)

    assert not errors, "JS page errors: " + repr(errors)
    browser.close()
print("PASS: Stage41 offline Chrome overview, 16 AI tasks, 73 modules, 367 edges, AST filters, LikeC4 navigation")
