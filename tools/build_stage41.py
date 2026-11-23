#!/usr/bin/env python3
"""Stage41: additive standalone runtime with byte-exact accepted Stage40."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

PREVIOUS=ROOT/"src/app/stage40-parts.json"
MANIFEST=ROOT/"src/app/stage41-parts.json"
BASELINE=ROOT/"releases/stage40-inline-review-20261123.html"
OUT=ROOT/"releases/stage41-ai-quality-browser-candidate.html"
ANCHOR="src/modules/review/stage40-inline-review.js"
ADDITION="src/modules/ai/stage41-quality.js"


def read(path):
    return (ROOT/path).read_text(encoding="utf-8")


def build():
    prior=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected=prior["modules"].copy()
    assert len(expected)==72 and ANCHOR in expected
    expected.insert(expected.index(ANCHOR)+1,ADDITION)
    assert spec["modules"]==expected and len(set(expected))==73
    for key in ("schemaVersion","static","excelJsOpen","excelJsPath",
                "excelJsLicensePath","iconOpen","iconParts","runtimeOpen"):
        assert spec[key]==prior[key],"Protected static/vendor resource changed: "+key
    assert spec["baseRelease"]==BASELINE.relative_to(ROOT).as_posix()
    assert spec["outputRelease"]==OUT.relative_to(ROOT).as_posix()
    return modular.build_from_manifest(spec)


def verify_static(html=None):
    text=html if html is not None else build()
    prior=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    accepted=BASELINE.read_text(encoding="utf-8")
    assert modular.build_from_manifest(prior)==accepted,"Accepted Stage40 source changed"
    anchor=read(ANCHOR)
    assert accepted.count(anchor)==1,"Stage40 anchor missing/duplicated"
    assert text==accepted.replace(anchor,anchor+read(ADDITION),1),(
        "Stage41 changed something outside the one added quality module"
    )


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--out",default=str(OUT))
    args=p.parse_args()
    text=build()
    if args.verify_static:verify_static(text)
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==text,"Stale Stage41 HTML"
    if not(args.verify_static or args.verify_release):
        dest=Path(args.out)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(text,encoding="utf-8")
    print("Stage41 PASS chars="+str(len(text))+" SHA256="+
          hashlib.sha256(text.encode("utf-8")).hexdigest())


if __name__=="__main__":
    main()
