#!/usr/bin/env python3
"""Stage29: reproducible one-file Chrome/Edge file:// release, preserving Stage28."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

MANIFEST=ROOT/"src/app/stage29-parts.json"
BASELINE=ROOT/"releases/stage28-evidence-mentor-browser-candidate.html"
OUT=ROOT/"releases/stage29-sop-twi-quality-browser-candidate.html"
REQUIRED={
    "src/modules/ai/stage27-core.js",
    "src/modules/ai/stage27-intelligence.js",
    "src/modules/ai/stage27-analogs-history.js",
    "src/modules/app/stage28-ui.js",
    "src/modules/review/stage28-core.js",
    "src/modules/review/stage28-render.js",
    "src/modules/ai/stage28-review-task.js",
    "src/modules/documents/stage28-review-state.js",
    "src/modules/documents/stage27-db.js",
    "src/modules/documents/stage27-draft.js",
    "src/modules/documents/stage27-library.js",
    "src/modules/core/stage19-config.js",
    "src/modules/ai/stage26-transport.js",
    "src/modules/ai/stage29-generate-sop.js",
    "src/modules/ai/stage29-prompts.js",
    "src/modules/ai/stage29-quality-core.js",
    "src/modules/twi/stage29-from-sop.js",
    "src/modules/frv/stage26-study-ai.js",
}

def build()->str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=spec["modules"]
    if spec.get("schemaVersion")!=1 or len(modules)!=57 or len(set(modules))!=57:
        raise AssertionError("Stage29 expects 57 unique JS modules")
    if not REQUIRED.issubset(modules):
        raise AssertionError("Stage29 required protected module missing")
    if modules[-4:]!=[
        "src/modules/ai/stage27-core.js",
        "src/modules/ai/stage27-intelligence.js",
        "src/modules/ai/stage27-analogs-history.js",
        "src/modules/app/stage28-ui.js",
    ]:
        raise AssertionError("Stage29 modules must run after existing bootstrap")
    return modular.build_from_manifest(spec)

def verify_static()->None:
    old=BASELINE.read_text(encoding="utf-8")
    current=build()
    marker="<script>\n'use strict';"
    if old.split(marker,1)[0]!=current.split(marker,1)[0]:
        raise AssertionError("Static HTML/CSS/ExcelJS/ISO assets changed")
    if old.rsplit("</script>",1)[-1]!=current.rsplit("</script>",1)[-1]:
        raise AssertionError("Static HTML footer changed")

def main()->None:
    p=argparse.ArgumentParser()
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--out",default=str(OUT))
    opt=p.parse_args()
    html=build()
    if opt.verify_static:
        verify_static()
    if opt.verify_release:
        if not OUT.is_file() or html!=OUT.read_text(encoding="utf-8"):
            raise SystemExit("Stage29 release missing or differs from source manifest")
    if opt.verify_release or opt.verify_static:
        print("PASS Stage29 standalone chars="+str(len(html))+" SHA256="+
              hashlib.sha256(html.encode("utf-8")).hexdigest())
    else:
        path=Path(opt.out);path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(html,encoding="utf-8")
        print("Built "+str(path)+" chars="+str(len(html)))

if __name__=="__main__":main()
