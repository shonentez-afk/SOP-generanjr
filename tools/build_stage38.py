#!/usr/bin/env python3
"""Stage38: optional numbered reasons in unmodified corporate workbook geometry, from Stage37."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage19 as modular

MANIFEST=ROOT/"src/app/stage38-parts.json"
BASELINE=ROOT/"releases/stage37-desktop-audit-browser-candidate.html"
OUT=ROOT/"releases/stage38-numbered-reasons-corporate-xlsx-browser-candidate.html"
REQUIRED={
    "src/modules/ai/stage27-core.js",
    "src/modules/ai/stage27-intelligence.js",
    "src/modules/ai/stage27-analogs-history.js",
    "src/modules/app/stage28-ui.js",
    "src/modules/review/stage38-review-core.js",
    "src/modules/review/stage28-render.js",
    "src/modules/ai/stage28-review-task.js",
    "src/modules/documents/stage28-review-state.js",
    "src/modules/documents/stage27-db.js",
    "src/modules/documents/stage33-draft.js",
    "src/modules/documents/stage27-library.js",
    "src/modules/core/stage19-config.js",
    "src/modules/ai/stage26-transport.js",
    "src/modules/ai/stage29-generate-sop.js",
    "src/modules/ai/stage38-prompts.js",
    "src/modules/ai/stage38-quality-core.js",
    "src/modules/twi/stage29-from-sop.js",
    "src/modules/twi/stage38-print-xlsx.js",
    "src/modules/documents/stage37-data-loss-safety.js",
    "src/modules/frv/stage35-study-model.js",
    "src/modules/frv/stage36-library.js",
    "src/modules/documents/stage36-backup.js",
    "src/modules/frv/stage34-study-io.js",
    "src/modules/frv/stage35-study-ai.js",
    "src/modules/frv/stage35-study.js",
    "src/modules/frv/stage35-analytics.js",
    "src/modules/frv/stage34-xlsx.js",
    "src/modules/frv/stage34-measurements.js",
    "src/modules/frv/stage34-sop-frv-guard.js",
    "src/modules/photos/stage30-history.js",
    "src/modules/photos/stage31-illustration-editor.js",
    "src/modules/editor/stage38-steps.js",
    "src/modules/excel/stage38-export.js",
    "src/modules/quality/stage38-reasons.js",
}

def build()->str:
    spec=json.loads(MANIFEST.read_text(encoding="utf-8"))
    modules=spec["modules"]
    if modules.count("src/modules/quality/stage38-reasons.js")!=1:
        raise AssertionError("Stage38 reason safeguards must be present once")
    if modules.index("src/modules/quality/stage38-reasons.js")>=modules.index("src/modules/ai/stage29-generate-sop.js"):
        raise AssertionError("Reason helpers must load before generation")
    for old in ["src/modules/ai/stage19-prompts.js","src/modules/ai/stage29-quality-core.js","src/modules/ai/stage29-prompts.js","src/modules/review/stage28-core.js","src/modules/twi/stage36-1-print-xlsx.js","src/modules/excel/stage34-export.js","src/modules/editor/stage34-steps.js"]:
        if old in modules:
            raise AssertionError("Legacy module must not coexist with Stage38 module: "+old)
    if "src/modules/frv/stage35-library.js" in modules:
        raise AssertionError("Stage35 library replaced, not duplicated")
    if spec.get("schemaVersion")!=1 or len(modules)!=66 or len(set(modules))!=66:
        raise AssertionError("Stage38 expects 66 unique JS modules")
    if "src/modules/photos/stage30-illustration-editor.js" in modules:
        raise AssertionError("Stage30 editor must be replaced in Stage38, not duplicated")
    if modules.count("src/modules/photos/stage31-illustration-editor.js")!=1:
        raise AssertionError("Stage38 editor must appear exactly once")
    if "src/modules/excel/stage32-export.js" in modules:
        raise AssertionError("Legacy fixed 150x95 Excel photo export must not run in Stage38")
    if modules.count("src/modules/excel/stage38-export.js")!=1:
        raise AssertionError("Stage38 Excel export must appear exactly once")
    if any(old in modules for old in (
        "src/modules/frv/stage20-measurements.js",
        "src/modules/frv/stage19-study-model.js",
        "src/modules/frv/stage19-study-io.js",
        "src/modules/frv/stage26-study-ai.js",
        "src/modules/frv/stage19-study.js",
        "src/modules/documents/stage27-draft.js",
    )):
        raise AssertionError("Stage38 legacy FRV modules must be replaced, not duplicated")
    if spec.get("static",{}).get("betweenVendorIcons")!="src/app/stage38-between-vendor-icons.html":
        raise AssertionError("Stage38 must ship revised research UX")
    if not REQUIRED.issubset(modules):
        raise AssertionError("Stage38 required protected module missing")
    if modules[-4:]!=[
        "src/modules/ai/stage27-core.js",
        "src/modules/ai/stage27-intelligence.js",
        "src/modules/ai/stage27-analogs-history.js",
        "src/modules/app/stage28-ui.js",
    ]:
        raise AssertionError("Stage38 modules must run after existing bootstrap")
    return modular.build_from_manifest(spec)

def verify_static()->None:
    old=BASELINE.read_text(encoding="utf-8")
    current=build()
    # Revised FRV HTML is intentionally different. Vendor bundles and ISO
    # media must remain byte-for-byte identical to accepted Stage32.2.
    for opening in ('<script id="sop-exceljs-local"', '<script type="application/json" id="sop-local-iso-icons"'):
        o=old.index(opening)
        n=current.index(opening)
        old_asset=old[o:old.index("</script>",o)+9]
        new_asset=current[n:current.index("</script>",n)+9]
        if old_asset!=new_asset:
            raise AssertionError("Protected local ExcelJS/ISO asset changed")
    if old.rsplit("</script>",1)[-1]!=current.rsplit("</script>",1)[-1]:
        raise AssertionError("Static HTML footer changed")


def main()->None:
    p=argparse.ArgumentParser()
    p.add_argument("--verify-release",action="store_true")
    p.add_argument("--verify-static",action="store_true")
    p.add_argument("--out",default=str(OUT))
    opt=p.parse_args()
    html=build()
    if opt.verify_static:
        verify_static()
    if opt.verify_release:
        if not OUT.is_file() or html!=OUT.read_text(encoding="utf-8"):
            raise SystemExit("Stage38 release missing or differs from source manifest")
    if opt.verify_release or opt.verify_static:
        print("PASS Stage38 standalone chars="+str(len(html))+" SHA256="+
              hashlib.sha256(html.encode("utf-8")).hexdigest())
    else:
        path=Path(opt.out);path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(html,encoding="utf-8")
        print("Built "+str(path)+" chars="+str(len(html)))

if __name__=="__main__":main()
