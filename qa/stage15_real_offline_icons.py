#!/usr/bin/env python3
"""Real Chromium file:// smoke test of all 60 embedded ISO 7010 signs.

Tests both UI <img> decoding and local SVG->PNG rasterization used by XLSX.
Chrome is launched with HTTP(S) requests blocked; no proxy fallback allowed.
"""
from pathlib import Path
import argparse
import json

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome-channel", default="chrome")
    ap.add_argument("--screenshot", default="")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright

    html = Path(__file__).resolve().parents[1] / "releases/stage15-local-iso7010-icons.html"
    if not html.is_file():
        raise SystemExit("Stage 15 release missing")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=args.chrome_channel, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 1365, "height": 920}, device_scale_factor=1)
        network = []
        page.on("request", lambda request: network.append(request.url) if request.url.startswith(("https:", "http:")) else None)
        page.route("https://**", lambda route: route.abort())
        page.route("http://**", lambda route: route.abort())
        page.goto(html.resolve().as_uri(), wait_until="domcontentloaded", timeout=30000)
        page.locator("img[data-iso-icon]").first.wait_for(timeout=15000)
        page.wait_for_function("""() => [...document.querySelectorAll('img[data-iso-icon]')].every(el => el.complete)""", timeout=15000)
        result = page.evaluate("""async () => {
          const all = [...document.querySelectorAll('img[data-iso-icon]')];
          const missing = all.filter(el=>!el.complete||el.naturalWidth===0).map(el=>el.dataset.isoIcon);
          const pngFailures = [];
          for(const item of ICON_LIB){
            try {
              const png = await svgToPngDataUrl(item.id,192);
              if(!png || !png.startsWith('data:image/png;base64,') || png.length<300)pngFailures.push(item.id+': bad PNG');
            } catch(error) { pngFailures.push(item.id+': '+error.message); }
          }
          return {catalog:ICON_LIB.length,images:all.length,missing,pngFailures};
        }""")
        if args.screenshot:
            dest = Path(args.screenshot)
            dest.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(dest), full_page=True)
        browser.close()
        print(json.dumps({"result": result, "network": network}, ensure_ascii=False, indent=2))
        assert result["catalog"] == 60 and result["images"] == 60, result
        assert not result["missing"], result
        assert not result["pngFailures"], result
        assert not network, "Network dependence: " + repr(network)

if __name__ == "__main__":
    main()
