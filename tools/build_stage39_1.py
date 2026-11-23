#!/usr/bin/env python3
"""Stage39.1: AI and FRV consistency fixes without modifying accepted Stage39."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

PREVIOUS=ROOT/"src/app/stage39-parts.json"
MANIFEST=ROOT/"src/app/stage39-1-parts.json"
BASELINE=ROOT/"releases/stage39-step-management-browser-candidate.html"
OUT=ROOT/"releases/stage39-1-ai-reasons-frv-browser-candidate.html"

REPLACEMENTS={
  "src/modules/ai/stage38-base-prompts.js":"src/modules/ai/stage39-1-base-prompts.js",
  "src/modules/review/stage23-safe-fixes.js":"src/modules/review/stage39-1-safe-fixes.js",
  "src/modules/ai/stage22-field-editor.js":"src/modules/ai/stage39-1-field-editor.js",
  "src/modules/review/stage19-checklist.js":"src/modules/review/stage39-1-checklist.js",
  "src/modules/ai/stage28-review-task.js":"src/modules/ai/stage39-1-review-task.js",
  "src/modules/frv/stage35-study-model.js":"src/modules/frv/stage39-1-study-model.js",
  "src/modules/frv/stage35-study-ai.js":"src/modules/frv/stage39-1-study-ai.js",
  "src/modules/frv/stage35-study.js":"src/modules/frv/stage39-1-study.js",
  "src/modules/ai/stage27-intelligence.js":"src/modules/ai/stage39-1-intelligence.js"
}
EXTRA={
  "src/modules/quality/stage38-reasons.js":"src/modules/quality/stage39-1-ai-guards.js",
  "src/modules/ai/stage27-analogs-history.js":"src/modules/app/stage39-1-identity.js",
}
NEW_MODULE="src/modules/editor/stage39-1-reason-cleanup.js"
AI_REASON_MODULE="src/modules/ai/stage39-1-reason-proposal.js"
def read(path):
    return (ROOT/path).read_text(encoding="utf-8")


def build() -> str:
    old=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=old["modules"]
    expected=[]
    for src in modules:
        expected.append(REPLACEMENTS.get(src,src))
        if src in EXTRA:
            expected.append(EXTRA[src])
            if EXTRA[src]=="src/modules/app/stage39-1-identity.js":
                expected.append(NEW_MODULE)
                expected.append(AI_REASON_MODULE)
    assert len(modules)==67 and len(expected)==71 and len(set(expected))==71
    assert spec["modules"]==expected,"Unexpected module or execution order"
    assert spec["baseRelease"]==old["outputRelease"]
    assert spec["outputRelease"]==OUT.relative_to(ROOT).as_posix()
    for key in ("schemaVersion","static","excelJsOpen","excelJsPath",
                "excelJsLicensePath","iconOpen","iconParts","runtimeOpen"):
        assert spec[key]==old[key],"Protected vendor/static changes: "+key
    return modular.build_from_manifest(spec)


def verify_static(html=None):
    result=html if html is not None else build()
    old=json.loads(PREVIOUS.read_text(encoding="utf-8"))
    baseline=BASELINE.read_text(encoding="utf-8")
    # Ensure baseline actually matches its original 67 modules, and that only
    # the 9 approved source substitutions and four added modules differ.
    assert modular.build_from_manifest(old)==baseline,"Accepted Stage39 baseline changed"
    expected=baseline
    for old_path,new_path in REPLACEMENTS.items():
        old_content,new_content=read(old_path),read(new_path)
        assert expected.count(old_content)==1,old_path
        expected=expected.replace(old_content,new_content,1)
    for after_path,extra_path in EXTRA.items():
        marker=read(after_path)
        assert expected.count(marker)==1,after_path
        addition=read(extra_path)
        if extra_path=="src/modules/app/stage39-1-identity.js":
            addition+=read(NEW_MODULE)+read(AI_REASON_MODULE)
        expected=expected.replace(marker,marker+addition,1)
    assert result==expected,"Unexpected standalone HTML change against accepted Stage39"


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--out",default=str(OUT))
    args=p.parse_args()
    result=build()
    if args.verify_static:verify_static(result)
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==result,"Stale Stage39.1 HTML"
    if not(args.verify_static or args.verify_release):
        dest=Path(args.out)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(result,encoding="utf-8")
    print("Stage39.1 PASS chars="+str(len(result))+" sha256="+
          hashlib.sha256(result.encode("utf-8")).hexdigest())

if __name__=="__main__":
    main()
