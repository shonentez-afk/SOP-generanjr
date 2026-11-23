#!/usr/bin/env python3
"""Run unchanged Stage39.1 Reason checks against the Stage40 standalone HTML."""
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage40-inline-review-browser-candidate.html"

for index,name in enumerate((
    "stage39_1_reason_star_browser",
    "stage39_1_reason_grounding_browser",
    "stage39_1_reason_cleanup_browser",
    "stage39_1_twi_why_browser",
)):
    path=ROOT/"qa"/(name+".py")
    spec=importlib.util.spec_from_file_location("stage40_backcompat_"+str(index),path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RELEASE=RELEASE
    entry=getattr(module,'main',None) or getattr(module,'run',None)
    if not callable(entry):
        raise RuntimeError('No browser test entrypoint in '+name)
    entry()
print("PASS Stage40 inherited Stage39.1 Reason/WHY direct-apply regressions",flush=True)
