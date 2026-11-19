#!/usr/bin/env python3
"""Stage23 A3.2: safe typed AI review corrections without changing AI transport."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage23-parts.json"
BASELINE=ROOT/"releases/stage22-a3-ai-guard.html"
OUT=ROOT/"releases/stage23-a3-review-fixes.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=spec.get("modules",[])
    if spec.get("schemaVersion")!=1 or len(modules)!=44 or len(modules)!=len(set(modules)):
        raise AssertionError("Stage23 requires exactly 44 unique source modules")
    for required in ("src/modules/review/stage23-safe-fixes.js",
                     "src/modules/ai/stage19-transport.js",
                     "src/modules/ai/stage19-prompts.js",
                     "src/modules/twi/stage22-from-sop.js",
                     "src/modules/excel/stage20-export.js"):
        if required not in modules:
            raise AssertionError("Stage23 lost a protected runtime contract: "+required)
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    old=BASELINE.read_text(encoding="utf-8")
    new=build()
    start="<script>\n'use strict';"
    if old.split(start,1)[0]!=new.split(start,1)[0]:
        raise AssertionError("Stage23 changed HTML, ExcelJS, safety icons or CSS")
    if old.split("</script>",-1)[-1]!=new.split("</script>",-1)[-1]:
        raise AssertionError("Stage23 changed document footer")

def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-release",action="store_true")
    parser.add_argument("--verify-static",action="store_true")
    parser.add_argument("--out",default=str(OUT))
    args=parser.parse_args()
    result=build()
    if args.verify_static:
        verify_static()
    if args.verify_release:
        checked=OUT.read_text(encoding="utf-8")
        if result!=checked:
            at=next((i for i,(a,b) in enumerate(zip(result,checked)) if a!=b),
                    min(len(result),len(checked)))
            raise SystemExit(f"Stage23 release mismatch at {at}; built={len(result)} checked={len(checked)}; "
                             f"built_segment={result[max(0,at-90):at+160]!r}; "
                             f"checked_segment={checked[max(0,at-90):at+160]!r}")
    if args.verify_release or args.verify_static:
        print("PASS Stage23 chars="+str(len(result))+
              " SHA256="+hashlib.sha256(result.encode("utf-8")).hexdigest())
    else:
        out=Path(args.out)
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(result,encoding="utf-8")
        print("Built "+str(out)+" ("+str(len(result))+" chars)")

if __name__=="__main__":
    main()
