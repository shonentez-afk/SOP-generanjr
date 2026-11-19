#!/usr/bin/env python3
"""Stage25 A3/A4: safe SOP/FRV proposals and AI error categories, one offline HTML."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage25-parts.json"
BASELINE=ROOT/"releases/stage24-a3-a4-twi-protected.html"
OUT=ROOT/"releases/stage25-ai-safe-replacement.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=spec.get("modules",[])
    if spec.get("schemaVersion")!=1 or len(modules)!=49 or len(modules)!=len(set(modules)):
        raise AssertionError("Stage25 manifest requires exactly 49 unique modules")
    for required in (
        "src/modules/ai/stage25-errors.js",
        "src/modules/ai/stage25-preview.js",
        "src/modules/ai/stage25-transport.js",
        "src/modules/ai/stage25-generate-sop.js",
        "src/modules/frv/stage25-study-ai.js",
        "src/modules/ai/stage19-prompts.js",
        "src/modules/twi/stage24-from-sop.js",
        "src/modules/excel/stage20-export.js",
    ):
        if required not in modules:
            raise AssertionError("Missing protected runtime module "+required)
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    old=BASELINE.read_text(encoding="utf-8")
    current=build()
    boundary="<script>\n'use strict';"
    if old.split(boundary,1)[0]!=current.split(boundary,1)[0]:
        raise AssertionError("Stage25 changed static HTML, CSS, offline ExcelJS or safety icons")
    if old.split("</script>",-1)[-1]!=current.split("</script>",-1)[-1]:
        raise AssertionError("Stage25 changed footer")

def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-release",action="store_true")
    parser.add_argument("--verify-static",action="store_true")
    parser.add_argument("--out",default=str(OUT))
    args=parser.parse_args()
    html=build()
    if args.verify_static:verify_static()
    if args.verify_release:
        checked=OUT.read_text(encoding="utf-8")
        if html!=checked:
            at=next((i for i,(a,b) in enumerate(zip(html,checked)) if a!=b),
                    min(len(html),len(checked)))
            raise SystemExit("Stage25 differs at "+str(at)+
                             " built="+str(len(html))+" checked="+str(len(checked))+
                             " built_part="+repr(html[max(0,at-100):at+130])+
                             " checked_part="+repr(checked[max(0,at-100):at+130]))
    if args.verify_release or args.verify_static:
        print("PASS Stage25 chars="+str(len(html))+
              " SHA256="+hashlib.sha256(html.encode("utf-8")).hexdigest())
    else:
        dest=Path(args.out)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(html,encoding="utf-8")
        print("Built "+str(dest)+" chars="+str(len(html)))

if __name__=="__main__":
    main()
