#!/usr/bin/env python3
"""Stage24 A3/A4: standalone SOP with typed AI tasks and safe TWI regeneration."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage24-parts.json"
BASELINE=ROOT/"releases/stage23-a3-review-fixes.html"
OUT=ROOT/"releases/stage24-a3-a4-twi-protected.html"

def build() -> str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=spec.get("modules",[])
    if spec.get("schemaVersion")!=1 or len(modules)!=47 or len(modules)!=len(set(modules)):
        raise AssertionError("Stage24 must use exactly 47 unique source modules")
    for name in (
        "src/modules/ai/stage19-transport.js",
        "src/modules/ai/stage19-prompts.js",
        "src/modules/review/stage23-safe-fixes.js",
        "src/modules/ai/stage24-task-response.js",
        "src/modules/twi/stage24-merge.js",
        "src/modules/twi/stage24-preview.js",
        "src/modules/twi/stage24-from-sop.js",
        "src/modules/excel/stage20-export.js",
    ):
        if name not in modules:
            raise AssertionError("Stage24 lost required module: "+name)
    return modular.build_from_manifest(spec)

def verify_static() -> None:
    old=BASELINE.read_text(encoding="utf-8")
    new=build()
    boundary="<script>\n'use strict';"
    shell=old.split(boundary,1)[0]
    expected_patches=[
        ('placeholder="Назначенный наставник, мастер или другое ответственное лицо"></div>',
         'placeholder="Назначенный наставник, мастер или другое ответственное лицо"></textarea></div>'),
        ('placeholder="Первые самостоятельные выполнения и наиболее важные Key Points"></div>',
         'placeholder="Первые самостоятельные выполнения и наиболее важные Key Points"></textarea></div>'),
    ]
    for from_text,to_text in expected_patches:
        if shell.count(from_text)!=1:
            raise AssertionError("Missing original broken TWI textarea marker")
        shell=shell.replace(from_text,to_text)
    if shell!=new.split(boundary,1)[0]:
        raise AssertionError("Stage24 changed static shell outside two TWI textarea repairs")
    if old.split("</script>",-1)[-1]!=new.split("</script>",-1)[-1]:
        raise AssertionError("Changed HTML footer")

def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--out",default=str(OUT))
    args=p.parse_args()
    html=build()
    if args.verify_static:verify_static()
    if args.verify_release:
        checked=OUT.read_text(encoding="utf-8")
        if html!=checked:
            at=next((i for i,(a,b) in enumerate(zip(html,checked)) if a!=b),
                    min(len(html),len(checked)))
            raise SystemExit("Stage24 differs from source at "+str(at)+
                             " built="+str(len(html))+" checked="+str(len(checked))+
                             " built_part="+repr(html[max(0,at-100):at+200])+
                             " checked_part="+repr(checked[max(0,at-100):at+200]))
    if args.verify_release or args.verify_static:
        print("PASS Stage24 chars="+str(len(html))+
              " SHA256="+hashlib.sha256(html.encode("utf-8")).hexdigest())
    else:
        target=Path(args.out)
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(html,encoding="utf-8")
        print("Built "+str(target)+" chars="+str(len(html)))

if __name__=="__main__":
    main()
