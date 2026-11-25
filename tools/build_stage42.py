#!/usr/bin/env python3
"""Stage42: one-file XLSX wizard on byte-exact accepted Stage41."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

PREVIOUS=ROOT/"src/app/stage41-parts.json"
MANIFEST=ROOT/"src/app/stage42-parts.json"
BASELINE=ROOT/"releases/stage41-ai-quality-20261123.html"
OUT=ROOT/"releases/stage42-import-wizard-browser-candidate.html"
ANCHOR="src/modules/ai/stage41-quality.js"
ADDITIONS=[
    "src/modules/excel/stage42-parse.js",
    "src/modules/excel/stage42-apply.js",
    "src/modules/excel/stage42-wizard.js",
]

def read(path):
    return (ROOT/path).read_text(encoding="utf-8")

def build():
    old=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    new=json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert len(old["modules"])==73 and ANCHOR in old["modules"]
    expected=old["modules"].copy()
    at=expected.index(ANCHOR)+1
    expected[at:at]=ADDITIONS
    assert new["modules"]==expected and len(set(expected))==76
    for key in ("schemaVersion","static","excelJsOpen","excelJsPath",
                "excelJsLicensePath","iconOpen","iconParts","runtimeOpen"):
        assert new[key]==old[key],"Protected Stage41 resources changed: "+key
    assert new["baseRelease"]==BASELINE.relative_to(ROOT).as_posix()
    assert new["outputRelease"]==OUT.relative_to(ROOT).as_posix()
    return modular.build_from_manifest(new)

def verify_static(html=None):
    result=html if html is not None else build()
    old=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    accepted=BASELINE.read_text(encoding="utf-8")
    assert modular.build_from_manifest(old)==accepted,(
        "Stage41 source no longer produces byte-exact accepted release"
    )
    anchor=read(ANCHOR)
    assert accepted.count(anchor)==1,"Stage41 insertion anchor missing or repeated"
    inserted="".join(read(path) for path in ADDITIONS)
    assert result==accepted.replace(anchor,anchor+inserted,1),(
        "Unexpected modification outside the three isolated Stage42 modules"
    )

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-static",action="store_true")
    parser.add_argument("--verify-release",action="store_true")
    parser.add_argument("--out",default=str(OUT))
    args=parser.parse_args()
    html=build()
    if args.verify_static:verify_static(html)
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==html,"Stage42 HTML is not current"
    if not(args.verify_static or args.verify_release):
        dest=Path(args.out)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(html,encoding="utf-8")
    print("Stage42 PASS chars="+str(len(html))+" sha256="+
          hashlib.sha256(html.encode("utf-8")).hexdigest())

if __name__=="__main__":
    main()
