#!/usr/bin/env python3
"""Stage39: accepted Stage38 plus one isolated reversible step-management module."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

MANIFEST=ROOT/"src/app/stage39-parts.json"
STAGE38_MANIFEST=ROOT/"src/app/stage38-parts.json"
BASELINE=ROOT/"releases/stage38-numbered-reasons-corporate-xlsx-browser-candidate.html"
OUT=ROOT/"releases/stage39-step-management-browser-candidate.html"
NEW_MODULE="src/modules/editor/stage39-step-actions.js"


def build() -> str:
    old=json.loads(STAGE38_MANIFEST.read_text(encoding="utf-8"))
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    a=old["modules"]
    b=spec["modules"]
    pos=a.index("src/modules/editor/stage38-steps.js")+1
    assert len(a)==66 and len(set(a))==66
    assert len(b)==67 and len(set(b))==67
    assert b==a[:pos]+[NEW_MODULE]+a[pos:], "Stage39 may only add its own module"
    for key in ("schemaVersion","static","excelJsOpen","excelJsPath",
                "excelJsLicensePath","iconOpen","iconParts","runtimeOpen"):
        assert spec[key]==old[key], "Changed protected asset/layout: "+key
    assert spec["baseRelease"]==old["outputRelease"]
    assert spec["outputRelease"]==OUT.relative_to(ROOT).as_posix()
    return modular.build_from_manifest(spec)


def verify_static() -> None:
    current=build()
    accepted=BASELINE.read_text(encoding="utf-8")
    addition=(ROOT/NEW_MODULE).read_text(encoding="utf-8")
    assert current.count(addition)==1, "Added module not included exactly once"
    assert current.replace(addition,"",1)==accepted, (
        "Accepted Stage38 HTML or vendor assets changed unexpectedly")
    assert "stage39Duplicate" in addition and "stage39Undo" in addition
    assert "stage39OriginalRenderSteps=renderSteps" in addition
    assert "stage39OriginalApplyDocumentLock=applyDocumentLock" in addition


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--verify-release",action="store_true")
    ap.add_argument("--verify-static",action="store_true")
    ap.add_argument("--out",default=str(OUT))
    args=ap.parse_args()
    html=build()
    if args.verify_static:
        verify_static()
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==html, "Stale Stage39 HTML"
    if not (args.verify_release or args.verify_static):
        path=Path(args.out)
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(html,encoding="utf-8")
    print("Stage39 PASS chars="+str(len(html))+" SHA256="+
          hashlib.sha256(html.encode("utf-8")).hexdigest())


if __name__=="__main__":
    main()
