#!/usr/bin/env python3
"""A2: one autonomous HTML from source modules, with safe Excel snapshots."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage20-parts.json"
BASELINE=ROOT/"releases/stage19-modular-runtime.html"
OUT=ROOT/"releases/stage20-a2-safe-export.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if spec.get("schemaVersion")!=1 or len(spec.get("modules",[]))<40:
        raise AssertionError("Invalid Stage20 modules manifest")
    if len(spec["modules"])!=len(set(spec["modules"])):
        raise AssertionError("Duplicate runtime modules")
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    base=BASELINE.read_text(encoding="utf-8")
    current=build()
    main="<script>\n'use strict';"
    if base.split(main,1)[0]!=current.split(main,1)[0]:
        raise AssertionError("A2 modified vendor, HTML, offline ISO assets or UI")
    if base.split("</script>",-1)[-1]!=current.split("</script>",-1)[-1]:
        raise AssertionError("A2 modified HTML footer")

def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--out",default=str(OUT))
    args=p.parse_args()
    data=build()
    if args.verify_static: verify_static()
    if args.verify_release:
        if data!=OUT.read_text(encoding="utf-8"):
            raise SystemExit("Stage20 release differs from the modular source build")
    if args.verify_release or args.verify_static:
        print("PASS Stage20 source build: chars="+str(len(data))+" SHA256="+hashlib.sha256(data.encode()).hexdigest())
    else:
        result=Path(args.out)
        result.parent.mkdir(parents=True,exist_ok=True)
        result.write_text(data,encoding="utf-8")
        print("Built "+str(result)+" ("+str(len(data))+" chars)")

if __name__=="__main__":
    main()
