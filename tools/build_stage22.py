#!/usr/bin/env python3
"""Stage22 A3.1: reproducible standalone runtime with guarded asynchronous AI results."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage22-parts.json"
BASELINE=ROOT/"releases/stage21-review-history.html"
OUT=ROOT/"releases/stage22-a3-ai-guard.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    names=spec.get("modules",[])
    if spec.get("schemaVersion")!=1 or len(names)!=43 or len(names)!=len(set(names)):
        raise AssertionError("Stage22 manifest must contain 43 distinct source modules")
    protected=["src/modules/ai/stage19-transport.js",
               "src/modules/ai/stage19-protocol.js",
               "src/modules/ai/stage19-prompts.js",
               "src/modules/ai/stage22-context-guard.js"]
    if not all(path in names for path in protected):
        raise AssertionError("AI source contracts were omitted")
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    baseline=BASELINE.read_text(encoding="utf-8")
    current=build()
    marker="<script>\n'use strict';"
    if baseline.split(marker,1)[0]!=current.split(marker,1)[0]:
        raise AssertionError("Stage22 changed HTML shell, ExcelJS or ISO assets")
    if baseline.split("</script>",-1)[-1]!=current.split("</script>",-1)[-1]:
        raise AssertionError("Stage22 changed HTML footer")

def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--out",default=str(OUT))
    args=p.parse_args()
    built=build()
    if args.verify_static: verify_static()
    if args.verify_release and built!=OUT.read_text(encoding="utf-8"):
        raise SystemExit("Stage22 release does not match source build exactly")
    if args.verify_static or args.verify_release:
        print("PASS Stage22 chars="+str(len(built))+" SHA256="+hashlib.sha256(built.encode()).hexdigest())
    else:
        target=Path(args.out)
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(built,encoding="utf-8")
        print("Built "+str(target)+" ("+str(len(built))+" chars)")

if __name__=="__main__":
    main()
