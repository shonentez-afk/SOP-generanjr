"""Stage38: source contract to preserve corporate XLSX geometry and one Reasons field."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage38 as candidate

class Stage38ReasonContract(unittest.TestCase):
    def test_manifest_and_protected_vendor(self):
        candidate.verify_static()
        old=json.loads((ROOT/"src/app/stage37-parts.json").read_text(encoding="utf-8"))
        new=json.loads(candidate.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(old["modules"]),65)
        self.assertEqual(len(new["modules"]),66)
        self.assertEqual(len(new["modules"]),len(set(new["modules"])))
        self.assertEqual(set(new["modules"])-set(old["modules"]),
            {"src/modules/quality/stage38-reasons.js"})
        self.assertFalse(set(old["modules"])-set(new["modules"]))
        self.assertEqual(new["modules"][-4:],old["modules"][-4:])
        self.assertEqual(candidate.BASELINE.name,
            "stage37-desktop-audit-browser-candidate.html")
        html=candidate.build()
        for marker in (
            "function stage38ReasonIssues(",
            "function stage38CorporateReasonHeight(",
            "function stage38ReasonText(",
            "async function generateExcel(",
            "async function exportTwiPrintXlsx(",
            "async function stage36BuildAllBackup(",
            "async function generateTwiPlan(",
            'id="sopVersionLabel"'
        ):
            self.assertEqual(html.count(marker),1,marker)
        self.assertIn("Stage38 (проверка)",html)

    def test_js_syntax_changed_modules(self):
        paths=[
          "src/modules/quality/stage38-reasons.js",
          "src/modules/ai/stage29-quality-core.js",
          "src/modules/ai/stage29-prompts.js",
          "src/modules/ai/stage19-prompts.js",
          "src/modules/review/stage28-core.js",
          "src/modules/twi/stage36-1-print-xlsx.js",
          "src/modules/excel/stage34-export.js",
          "src/modules/editor/stage34-steps.js"
        ]
        for path in paths:
            p=subprocess.run(["node","--check","-"],
                input=(ROOT/path).read_text(encoding="utf-8"),
                capture_output=True,text=True)
            self.assertEqual(p.returncode,0,path+": "+p.stderr)

    def test_corporate_worksheet_geometry_untouched(self):
        # Source-level guard supplements real Chrome + openpyxl comparison to Stage37.
        # The only export change is one reason row's dynamic HEIGHT.
        baseline=(ROOT/"releases/stage37-desktop-audit-browser-candidate.html").read_text(encoding="utf-8")
        source=(ROOT/"src/modules/excel/stage34-export.js").read_text(encoding="utf-8")
        for marker in (
          "wb.addWorksheet('СОП'",
          "wb.addWorksheet('ФРВ'",
          "wb.addWorksheet('Чек-лист'",
          "const vSpans=[[3,5],[6,9],[10,12]]",
          "const aSpans=[[3,4,5],[6,8,9],[10,11,12]]",
          "M(r,2,r,2,'Причина'",
          "M(r,c1,r,c2,s?(s.reason||''):'',",
          "const expectedStepPhotos=await ensureStepImagesForExport(",
          "sopExcelPhotoVisibleExtent("
        ):
            self.assertIn(marker,source)
            self.assertIn(marker,baseline)
        self.assertIn("ws.getRow(r).height=stage38CorporateReasonHeight(g,30);",source)
        self.assertIn("textLines(s?.reason||'',30)",baseline)
        self.assertNotIn("rsLines=Math.max(",source)
        self.assertIn("stage38StripOrdinalLabels(s[field])",
            (ROOT/"src/modules/ai/stage29-quality-core.js").read_text(encoding="utf-8"))
        self.assertIn("stage38StripOrdinalLabels(s.reason)",
            (ROOT/"src/modules/ai/stage29-quality-core.js").read_text(encoding="utf-8"))
        self.assertIn("reason:cleanText(s.reason)",
            (ROOT/"src/modules/ai/stage23-protocol.js").read_text(encoding="utf-8"))
        self.assertIn("s.reason=String(s.reason||'')",
            (ROOT/"src/modules/core/stage19-step-shape.js").read_text(encoding="utf-8"))

if __name__=="__main__":
    unittest.main()
