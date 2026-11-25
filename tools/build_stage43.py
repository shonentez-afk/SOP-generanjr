#!/usr/bin/env python3
"""Stage43 XLSX export only. Keep accepted Stage42 source/release intact."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import build_stage19 as modular
import build_stage42

ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/"src/app/stage42-parts.json"
MANIFEST=ROOT/"src/app/stage43-parts.json"
BASELINE=ROOT/"releases/stage42-import-wizard-20261125.html"
OUT=ROOT/"releases/stage43-sop-print-formats-20261125.html"

def build():
    old=json.loads(OLD.read_text(encoding="utf-8"))
    new=json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected=old["modules"].copy()
    n=expected.index("src/modules/excel/stage38-export.js")
    expected[n:n+1]=["src/modules/excel/stage43-landscape-export.js","src/modules/excel/stage43-export.js"]
    assert new["modules"]==expected and len(expected)==77 and len(set(expected))==77
    for key in ("schemaVersion","static","excelJsOpen","excelJsPath","excelJsLicensePath","iconOpen","iconParts","runtimeOpen"):
        assert new[key]==old[key],key
    assert modular.build_from_manifest(old)==BASELINE.read_text(encoding="utf-8")
    build_stage42.verify_static()
    return modular.build_from_manifest(new)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--out",default=str(OUT))
    a=p.parse_args()
    html=build()
    if a.verify_release:
        assert OUT.read_text(encoding="utf-8")==html
    if not (a.verify_static or a.verify_release):
        Path(a.out).write_text(html,encoding="utf-8")
    print("Stage43 PASS SHA256="+hashlib.sha256(html.encode("utf-8")).hexdigest())

if __name__=="__main__":
    main()
