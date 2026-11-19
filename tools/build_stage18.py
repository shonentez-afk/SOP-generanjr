#!/usr/bin/env python3
"""Deterministically assemble Stage 18 without modifying Stage 17 or AI settings."""
from pathlib import Path
import argparse

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"releases/stage17-mentor-json-recovery.html"
PATCH=ROOT/"src/modules/ai/stage18-mentor-reply-presentation.js"
OUT=ROOT/"releases/stage18-mentor-reply-cleanup.html"
START="function mentorParseDisputeResponse(raw){"
END="async function mentorRequestDisputeResponse(ctx){"

def build():
    baseline=BASE.read_text(encoding="utf-8")
    module=PATCH.read_text(encoding="utf-8")
    assert baseline.count(START)==baseline.count(END)==1
    a=baseline.index(START)
    b=baseline.index(END,a)
    assert a<b
    result=baseline[:a]+module+"\n"+baseline[b:]
    dollar=chr(36)
    replacements=[
      ("m.role==='user'?'bg-blue-50 border border-blue-200':'bg-emerald-50 border border-emerald-200'",
       "m.role==='user'?'bg-blue-50 border border-blue-200':m.role==='system'?'bg-amber-50 border border-amber-200':'bg-emerald-50 border border-emerald-200'"),
      ("m.role==='user'?'👷 Вы':'🧑‍ Наставник'",
       "m.role==='user'?'👷 Вы':m.role==='system'?'⚠️ Система':'🧑‍ Наставник'"),
      (dollar+"{escapeHtml(m.text)}",
       dollar+"{escapeHtml(m.role==='mentor'?mentorCleanDisputeReply(m.text):m.text)}")
    ]
    for old,new in replacements:
        assert result.count(old)==1, "Unexpected mentor renderer: "+old
        result=result.replace(old,new)
    assert "function mentorCleanDisputeReply(value)" in result
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-release",action="store_true")
    args=parser.parse_args()
    result=build()
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==result, "Stage 18 release differs from source"
        print("PASS: Stage 18 reproducible ("+str(len(result))+" characters)")
    else:
        OUT.write_text(result,encoding="utf-8")
        print("Built",OUT)

if __name__=="__main__":
    main()
