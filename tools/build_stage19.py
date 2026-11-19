#!/usr/bin/env python3
"""Stage19: assemble one standalone HTML from ordered source modules.

No Stage12-18 textual patches, runtime imports, filesystem reads from the
browser, or dependency on a previous release for the actual build.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"src/app/stage19-parts.json"
BASELINE=ROOT/"releases/stage18-mentor-reply-cleanup.html"
OUT=ROOT/"releases/stage19-modular-runtime.html"

def _read(relative: str) -> str:
    path=(ROOT/relative).resolve()
    if path==ROOT or ROOT not in path.parents:
        raise ValueError("Source path outside repository: "+relative)
    return path.read_text(encoding="utf-8")

def _icons(paths: list[str]) -> str:
    icons: dict[str,str]={}
    for path in paths:
        bundle=json.loads(_read(path))
        if bundle.get("schemaVersion")!=1:
            raise AssertionError("Unsupported icon schema: "+path)
        for key,info in bundle["icons"].items():
            if key in icons or re.fullmatch(r"[MWP]\d{3}",key) is None:
                raise AssertionError("Invalid/duplicate icon: "+str(key))
            svg=info["svg"].strip()
            if not svg.startswith(("<svg","<?xml")) or "</svg>" not in svg:
                raise AssertionError("Invalid SVG for "+key)
            lowered=svg.lower()
            if any(x in lowered for x in ("<script","</script","<foreignobject","onload=","onerror=",'href="http',"href='http")):
                raise AssertionError("Unsafe SVG "+key)
            icons[key]=svg
    if len(icons)!=60:
        raise AssertionError("Expected 60 local ISO 7010 icons; got "+str(len(icons)))
    return json.dumps(icons,ensure_ascii=False,separators=(",",":")).replace("<",r"\u003c")

def _manifest() -> dict:
    parts=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if parts.get("schemaVersion")!=1:
        raise AssertionError("Unexpected Stage19 parts schema")
    names=parts.get("modules",[])
    if len(names)<24 or len(set(names))!=len(names):
        raise AssertionError("Missing/duplicate runtime modules")
    if any(not p.startswith("src/modules/") or not p.endswith(".js") for p in names):
        raise AssertionError("Runtime must come from semantic source modules only")
    return parts

def build_from_manifest(p: dict) -> str:
    body="".join(_read(path) for path in p["modules"])
    if not body.startswith("\n'use strict';"):
        raise AssertionError("Wrong runtime entrypoint")
    if body.count("const AI_PROXY_BASE=")!=1 or body.count("async function generateTwiPlan()")!=1:
        raise AssertionError("AI/TWI code lost or duplicated")
    license_text=_read(p["excelJsLicensePath"])
    vendor="\n/*\n"+license_text+"*/\n"+_read(p["excelJsPath"])
    layout=p["static"]
    return (
        _read(layout["beforeVendor"])
        +p["excelJsOpen"]+vendor+"</script>"
        +_read(layout["betweenVendorIcons"])
        +p["iconOpen"]+_icons(p["iconParts"])+"</script>"
        +_read(layout["betweenIconsRuntime"])
        +p["runtimeOpen"]+body
        +_read(layout["afterRuntime"])
    )

def build() -> str:
    return build_from_manifest(_manifest())

def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument("--verify-baseline",action="store_true",help="Exact Stage18 comparison")
    ap.add_argument("--verify-release",action="store_true",help="Exact checked-in Stage19 comparison")
    ap.add_argument("--out",default=str(OUT),help="Destination HTML")
    args=ap.parse_args()
    data=build()
    if args.verify_baseline and data!=BASELINE.read_text(encoding="utf-8"):
        raise SystemExit("FAIL: modular Stage19 differs from Stage18")
    if args.verify_release and data!=OUT.read_text(encoding="utf-8"):
        raise SystemExit("FAIL: Stage19 release stale")
    if args.verify_baseline or args.verify_release:
        print("PASS: chars="+str(len(data))+" SHA256="+hashlib.sha256(data.encode("utf-8")).hexdigest())
    else:
        path=Path(args.out)
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(data,encoding="utf-8")
        print("Built "+str(path)+" chars="+str(len(data))+" SHA256="+hashlib.sha256(data.encode("utf-8")).hexdigest())

if __name__=="__main__":
    main()
