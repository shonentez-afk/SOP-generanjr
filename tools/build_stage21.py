#!/usr/bin/env python3
"""Stage21 A2: review discussions survive drafts, library versions and backups."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage21-parts.json"
BASELINE=ROOT/"releases/stage20-a2-safe-export.html"
OUT=ROOT/"releases/stage21-review-history.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    names=spec.get("modules",[])
    if spec.get("schemaVersion")!=1 or len(names)<42 or len(names)!=len(set(names)):
        raise AssertionError("Stage21 manifest invalid or contains duplicate modules")
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    old=BASELINE.read_text(encoding="utf-8")
    new=build()
    runtime="<script>\n'use strict';"
    if old.split(runtime,1)[0]!=new.split(runtime,1)[0]:
        raise AssertionError("Stage21 changed static HTML, ExcelJS or offline ISO 7010 assets")
    if old.split("</script>",-1)[-1]!=new.split("</script>",-1)[-1]:
        raise AssertionError("Stage21 changed HTML footer")

def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-release",action="store_true")
    parser.add_argument("--verify-static",action="store_true")
    parser.add_argument("--out",default=str(OUT))
    args=parser.parse_args()
    built=build()
    if args.verify_static:verify_static()
    if args.verify_release and built!=OUT.read_text(encoding="utf-8"):
        raise SystemExit("Stage21 release differs from source modules")
    if args.verify_static or args.verify_release:
        print("PASS Stage21 chars="+str(len(built))+" SHA256="+hashlib.sha256(built.encode()).hexdigest())
    else:
        destination=Path(args.out)
        destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_text(built,encoding="utf-8")
        print("Built "+str(destination))

if __name__=="__main__":
    main()
