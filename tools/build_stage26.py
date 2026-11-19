#!/usr/bin/env python3
"""Stage26: final static one-file browser candidate, reproducible from modules."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage26-parts.json"
BASELINE=ROOT/"releases/stage25-ai-safe-replacement.html"
OUT=ROOT/"releases/stage26-final-browser-candidate.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=spec.get("modules",[])
    if spec.get("schemaVersion")!=1 or len(modules)!=50 or len(modules)!=len(set(modules)):
        raise AssertionError("Stage26 requires 50 distinct modules")
    for path in (
        "src/modules/ai/stage26-errors.js",
        "src/modules/ai/stage26-transport.js",
        "src/modules/review/stage26-deterministic.js",
        "src/modules/frv/stage26-proposals.js",
        "src/modules/frv/stage26-study-ai.js",
        "src/modules/ai/stage19-prompts.js",
        "src/modules/ai/stage25-preview.js",
        "src/modules/ai/stage25-generate-sop.js",
        "src/modules/twi/stage24-from-sop.js",
        "src/modules/excel/stage20-export.js"
    ):
        if path not in modules:
            raise AssertionError("Protected module missing: "+path)
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    baseline=BASELINE.read_text(encoding="utf-8")
    result=build()
    marker="<script>\n'use strict';"
    if baseline.split(marker,1)[0]!=result.split(marker,1)[0]:
        raise AssertionError("Static HTML shell, ExcelJS, ISO icons, CSS or photo assets changed")
    if baseline.split("</script>",-1)[-1]!=result.split("</script>",-1)[-1]:
        raise AssertionError("Document footer changed")

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
            at=next((i for i,(x,y) in enumerate(zip(html,checked)) if x!=y),
                min(len(html),len(checked)))
            raise SystemExit("Stage26 source mismatch at "+str(at)+
                "; built="+str(len(html))+", release="+str(len(checked))+
                "; build="+repr(html[max(0,at-80):at+130])+
                "; release="+repr(checked[max(0,at-80):at+130]))
    if args.verify_release or args.verify_static:
        print("PASS Stage26 chars="+str(len(html))+
              " SHA256="+hashlib.sha256(html.encode("utf-8")).hexdigest())
    else:
        dst=Path(args.out)
        dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_text(html,encoding="utf-8")
        print("Built "+str(dst)+" chars="+str(len(html)))

if __name__=="__main__":
    main()
