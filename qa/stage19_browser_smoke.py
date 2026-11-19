#!/usr/bin/env python3
"""Exercise Stage19 in actual Chrome file:// using the complete Stage16/18 E2E suites.

No production data or external Yandex Cloud request is made. Previous QA
functions are reused, but their RELEASE path is directed to the NEW file.
"""
from __future__ import annotations
import importlib.util
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage19-modular-runtime.html"

def run_suite(relative: str):
    path=ROOT/relative
    name="stage19_reusing_"+path.stem
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module,"RELEASE"):
        raise AssertionError("Original QA suite has no release override: "+relative)
    module.RELEASE=RELEASE
    saved_argv=sys.argv[:]
    try:
        sys.argv=[str(path)]
        print("Stage19 browser QA using "+relative+" on "+RELEASE.name,flush=True)
        module.main()
    finally:
        sys.argv=saved_argv

def main():
    if not RELEASE.is_file():
        raise SystemExit("Modular Stage19 HTML not built")
    run_suite("qa/stage18_real_mentor_reply.py")
    run_suite("qa/stage16_real_excel_photos.py")
    print("PASS: Stage19 actual file:// browser, mentor, photo editor, IndexedDB, XLSX",flush=True)

if __name__=="__main__":
    main()
