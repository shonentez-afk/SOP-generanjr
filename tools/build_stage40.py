#!/usr/bin/env python3
"""Stage40: one appended inline review module, accepted Stage39.1 unchanged."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

PREVIOUS=ROOT/"src/app/stage39-1-parts.json"
MANIFEST=ROOT/"src/app/stage40-parts.json"
BASELINE=ROOT/"releases/stage39-1-reason-direct-20261123.html"
OUT=ROOT/"releases/stage40-inline-review-browser-candidate.html"
ANCHOR="src/modules/ai/stage39-1-reason-proposal.js"
ADDITION="src/modules/review/stage40-inline-review.js"


def read(path):
    return (ROOT/path).read_text(encoding="utf-8")


def build():
    prior=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected=prior["modules"].copy()
    assert len(expected)==71 and ANCHOR in expected
    expected.insert(expected.index(ANCHOR)+1,ADDITION)
    assert spec["modules"]==expected and len(set(expected))==72
    for key in ("schemaVersion","static","excelJsOpen","excelJsPath",
                "excelJsLicensePath","iconOpen","iconParts","runtimeOpen"):
        assert spec[key]==prior[key],"Protected vendor or static resource: "+key
    assert spec["baseRelease"]==prior["outputRelease"] or spec["baseRelease"]==BASELINE.relative_to(ROOT).as_posix()
    assert spec["outputRelease"]==OUT.relative_to(ROOT).as_posix()
    return modular.build_from_manifest(spec)


def verify_static(html=None):
    text=html if html is not None else build()
    prior=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    baseline=BASELINE.read_text(encoding="utf-8")
    assert modular.build_from_manifest(prior)==baseline,"Accepted Stage39.1 changed"
    anchor=read(ANCHOR)
    assert baseline.count(anchor)==1,"Unexpected Stage39.1 Reason module"
    expected=baseline.replace(anchor,anchor+read(ADDITION),1)
    assert text==expected,"Stage40 touched outside the single appended module"


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--out",default=str(OUT))
    args=p.parse_args()
    text=build()
    if args.verify_static:verify_static(text)
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==text,"Stale Stage40 HTML"
    if not(args.verify_static or args.verify_release):
        path=Path(args.out)
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(text,encoding="utf-8")
    print("Stage40 PASS chars="+str(len(text))+" sha256="+
          hashlib.sha256(text.encode("utf-8")).hexdigest())


if __name__=="__main__":
    main()
