#!/usr/bin/env python3
"""Accepted Stage39.1 ✨ Reason and TWI WHY tests on Stage41 standalone."""
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage41-ai-quality-browser-candidate.html"
TESTS=(
    "stage39_1_reason_star_browser",
    "stage39_1_reason_grounding_browser",
    "stage39_1_reason_cleanup_browser",
    "stage39_1_twi_why_browser",
)
for index,name in enumerate(TESTS):
    path=ROOT/"qa"/(name+".py")
    spec=importlib.util.spec_from_file_location("stage41_inherited_"+str(index),path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RELEASE=RELEASE
    entry=getattr(module,"main",None) or getattr(module,"run",None)
    if not callable(entry):
        raise RuntimeError("Test has no runnable entrypoint: "+name)
    entry()
print("PASS Stage41: inherited Reason, numeric WHY, no KM UI, TWI WHAT/HOW/WHY",flush=True)
