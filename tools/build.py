#!/usr/bin/env python3
"""Rebuild one-click HTML from the exact source segments. Python 3 standard library only."""
from pathlib import Path
import argparse
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src/app/parts.json"
TEMPLATE = ROOT / "src/app/template.html"
BASELINE = ROOT / "releases/stage11-photo-editor.html"


def build() -> str:
    parts = json.loads(MANIFEST.read_text(encoding="utf-8"))
    result = TEMPLATE.read_text(encoding="utf-8")
    for category, label in (("styles", "STYLE"), ("scripts", "SCRIPT")):
        for index, path in enumerate(parts[category], 1):
            marker = "<!-- SOP_" + label + "_" + f"{index:02d}" + " -->"
            if result.count(marker) != 1:
                raise ValueError(f"Missing or repeated build marker: {marker}")
            result = result.replace(marker, (ROOT / path).read_text(encoding="utf-8"))
    if "<!-- SOP_STYLE_" in result or "<!-- SOP_SCRIPT_" in result:
        raise ValueError("Not all build markers were expanded")
    return result


def main() -> int:
    p = argparse.ArgumentParser(description="Build the standalone browser HTML")
    p.add_argument("--out", default="dist/sop-constructor.html", help="Output HTML file")
    p.add_argument("--verify-baseline", action="store_true", help="Check byte-for-byte equality with archived baseline")
    args = p.parse_args()
    result = build()
    if args.verify_baseline:
        baseline = BASELINE.read_text(encoding="utf-8")
        if result != baseline:
            print("FAIL: generated HTML differs from Stage 11 baseline", file=sys.stderr)
            return 1
        print("PASS: generated HTML is identical to Stage 11 baseline")
    destination = ROOT / args.out
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(result, encoding="utf-8")
    print(f"Built {destination} ({len(result.encode('utf-8'))} bytes, SHA256={hashlib.sha256(result.encode('utf-8')).hexdigest()})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
