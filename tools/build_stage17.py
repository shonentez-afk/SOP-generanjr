#!/usr/bin/env python3
"""Reproduce Stage 17 from unchanged Stage 16 and isolated AI mentor patch."""
from pathlib import Path
import argparse

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"releases/stage16-excel-photos-and-editor-fixed.html"
PATCH=ROOT/"src/modules/ai/stage17-mentor-dispute-recovery.js"
OUT=ROOT/"releases/stage17-mentor-json-recovery.html"
START="async function sendDispute(idx){"
END="async function reviewEntireSOP(){"

def build():
    html=BASE.read_text(encoding="utf-8")
    module=PATCH.read_text(encoding="utf-8")
    assert html.count(START)==html.count(END)==1
    start=html.index(START)
    end=html.index(END,start)
    assert end>start and "JSON.parse(extractJson(await aiAsk(AI_SYS.dispute" in html[start:end]
    assembled=html[:start]+module+"\n"+html[end:]
    assert assembled[:start]==html[:start]
    assert assembled.endswith(html[end:])
    assert "mentorRequestDisputeResponse" in assembled
    return assembled

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-release",action="store_true")
    args=parser.parse_args()
    html=build()
    if args.verify_release:
        assert OUT.read_text(encoding="utf-8")==html, "Stage 17 HTML is not reproducible"
        print("PASS: Stage 17 standalone HTML is reproducible")
    else:
        OUT.write_text(html,encoding="utf-8")
        print("Built",OUT)

if __name__=="__main__":
    main()
