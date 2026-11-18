#!/usr/bin/env python3
"""Stage 15: build a standalone SOP HTML with 60 embedded ISO 7010 safety icons.

Only the icon-loader and icon-export portions of Stage 14 are replaced.
AI/Yandex proxy and settings, ExcelJS, photo handling, FRV and TWI are unchanged.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "releases/stage14-desktop-ux-data-integrity.html"
OUTPUT = ROOT / "releases/stage15-local-iso7010-icons.html"
PARTS = [ROOT / f"src/assets/safety/iso7010-part{i:02d}.json" for i in range(1, 8)]
LOADER = ROOT / "src/modules/safety/local-iso7010-loader-stage15.js"
EXPORT = ROOT / "src/modules/safety/local-iso7010-export-stage15.js"

def replace_region(html: str, first: str, following: str, replacement: str) -> str:
    begin = html.index(first)
    end = html.index(following, begin + len(first))
    if begin == end:
        raise AssertionError("Empty replacement region: " + first)
    return html[:begin] + replacement.rstrip() + "\n" + html[end:]

def build() -> str:
    html = BASE.read_text(encoding="utf-8")
    all_icons: dict[str, str] = {}
    for path in PARTS:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("schemaVersion") != 1:
            raise AssertionError("Unexpected icon bundle: " + str(path))
        for icon_id, info in data["icons"].items():
            if icon_id in all_icons or not re.fullmatch(r"[MWP]\d{3}", icon_id):
                raise AssertionError("Duplicate/invalid ISO code: " + icon_id)
            svg = info["svg"].strip()
            if not svg.startswith(("<svg", "<?xml")) or "</svg>" not in svg:
                raise AssertionError("Invalid vector: " + icon_id)
            if any(bad in svg.lower() for bad in ('<script', '</script', '<foreignobject', 'onload=', 'onerror=', 'href="http', "href='http")):
                raise AssertionError("Disallowed SVG feature: " + icon_id)
            all_icons[icon_id] = svg

    icon_start = html.index("const ICON_LIB=[")
    icon_end = html.index("].map(([id,type,label])", icon_start)
    codes = re.findall(r"\['([MWP]\d{3})',", html[icon_start:icon_end])
    if len(codes) != 60 or len(set(codes)) != 60 or set(codes) != set(all_icons):
        raise AssertionError(f"Expected all 60 ISO codes, got {len(codes)}, missing={set(codes)-set(all_icons)}, extra={set(all_icons)-set(codes)}")

    # Preserve the existing application's exports and all non-icon business logic.
    html = replace_region(html, "function isoIconFileName(id)", "function makeLogo()", LOADER.read_text(encoding="utf-8"))
    html = replace_region(html, "const _pngCache=new Map();", "async function buildIconStripPng(", EXPORT.read_text(encoding="utf-8"))
    before = 'src="${ISO_ICON_PLACEHOLDER}" data-iso-icon="${it.id}"'
    after = 'src="${isoIconUrl(it.id)}" data-iso-icon="${it.id}"'
    if html.count(before) != 1:
        raise AssertionError("Icon picker template changed")
    html = html.replace(before, after, 1)

    # Escaping < ensures the JSON cannot accidentally terminate the HTML <script>.
    payload = json.dumps(all_icons, ensure_ascii=False, separators=(",", ":")).replace("<", r"\u003c")
    html_marker = "<script>\n'use strict';"
    if html.count(html_marker) != 1:
        raise AssertionError("Main app script boundary changed")
    mit = (ROOT / "src/assets/safety/LICENSE_UPSTREAM_MIT.txt").read_text(encoding="utf-8").strip()
    if "Copyright (c) 2024 Karl Norling" not in mit or "-->" in mit:
        raise AssertionError("Upstream license absent or invalid")
    attribution = "<!--\nISO 7010 local vector image bundle. Upstream: karlnorling/iso-safety-signs.\n" + mit + "\nOriginal icon authors/licensing: see docs/ISO7010_ASSETS_RU.md and Commons individual file pages.\n-->\n"
    html = html.replace(html_marker, '<script type="application/json" id="sop-local-iso-icons">' + payload + "</script>\n" + attribution + html_marker, 1)

    base_text = BASE.read_text(encoding="utf-8")
    ai_begin = "const AI_PROXY_BASE="
    ai_end = "// 2. Generic helpers"
    base_ai = base_text[base_text.index(ai_begin):base_text.index(ai_end)]
    new_ai = html[html.index(ai_begin):html.index(ai_end)]
    if base_ai != new_ai:
        raise AssertionError("AI configuration modified")
    if base_text.split(html_marker)[0] != html.split(html_marker)[0].split('<script type="application/json" id="sop-local-iso-icons">')[0]:
        raise AssertionError("Changes before main app script beyond local icon bundle")
    if any(host in html[html.index(html_marker):] for host in ("https://wsrv.nl/", "https://images.weserv.nl/", "https://commons.wikimedia.org/wiki/Special:FilePath/")):
        raise AssertionError("Remote icon dependencies remain")
    if "async function buildIconStripPng(" not in html or "canvas.toDataURL('image/png')" not in html:
        raise AssertionError("Offline Excel icon rasterization missing")
    return html

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-release", action="store_true")
    args = ap.parse_args()
    html = build()
    if args.verify_release:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != html:
            raise SystemExit("Stage 15 release is stale; rebuild with python tools/build_stage15.py")
        print(f"OK Stage 15 release matches source ({len(html):,} chars, 60 embedded icons)")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(html, encoding="utf-8")
        print(f"Built {OUTPUT} ({len(html):,} chars, 60 embedded icons)")

if __name__ == "__main__":
    main()
