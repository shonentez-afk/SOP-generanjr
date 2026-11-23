"""Stage38: independent modules, byte-exact previous releases and corporate XLSX print."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage38 as candidate

REPLACEMENTS={
    "src/modules/ai/stage19-prompts.js":"src/modules/ai/stage38-base-prompts.js",
    "src/modules/ai/stage29-quality-core.js":"src/modules/ai/stage38-quality-core.js",
    "src/modules/ai/stage29-prompts.js":"src/modules/ai/stage38-prompts.js",
    "src/modules/review/stage28-core.js":"src/modules/review/stage38-review-core.js",
    "src/modules/twi/stage36-1-print-xlsx.js":"src/modules/twi/stage38-print-xlsx.js",
    "src/modules/excel/stage34-export.js":"src/modules/excel/stage38-export.js",
    "src/modules/editor/stage34-steps.js":"src/modules/editor/stage38-steps.js"
}

class Stage38ReasonContract(unittest.TestCase):
    def test_manifest_and_protected_vendor(self):
        candidate.verify_static()
        old=json.loads((ROOT/"src/app/stage37-parts.json").read_text(encoding="utf-8"))
        new=json.loads(candidate.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(old["modules"]),65)
        self.assertEqual(len(new["modules"]),66)
        self.assertEqual(len(new["modules"]),len(set(new["modules"])))
        self.assertEqual(set(new["modules"])-set(old["modules"]),
            set(REPLACEMENTS.values())|{"src/modules/quality/stage38-reasons.js"})
        self.assertEqual(set(old["modules"])-set(new["modules"]),
            set(REPLACEMENTS))
        accepted=(ROOT/"releases/stage37-desktop-audit-browser-candidate.html").read_text(encoding="utf-8")
        for older,newer in REPLACEMENTS.items():
            self.assertNotIn(older,new["modules"])
            self.assertIn(newer,new["modules"])
            self.assertIn((ROOT/older).read_text(encoding="utf-8"),accepted,
                "Historical source changed: "+older)
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
        for path in ["src/modules/quality/stage38-reasons.js",*REPLACEMENTS.values()]:
            p=subprocess.run(["node","--check","-"],
                input=(ROOT/path).read_text(encoding="utf-8"),
                capture_output=True,text=True)
            self.assertEqual(p.returncode,0,path+": "+p.stderr)

    def test_corporate_worksheet_geometry_untouched(self):
        baseline=(ROOT/"releases/stage37-desktop-audit-browser-candidate.html").read_text(encoding="utf-8")
        source=(ROOT/"src/modules/excel/stage38-export.js").read_text(encoding="utf-8")
        for marker in (
          "wb.addWorksheet('СОП'",
          "wb.addWorksheet('ФРВ'",
          "wb.addWorksheet('Чек-лист",
          "const vSpans=[[3,5],[6,9],[10,12]]",
          "aSpans=[[3,4,5],[6,8,9],[10,11,12]]",
          "M(r,2,r,2,'Причина'",
          "M(r,c1,r,c2,s?(s.reason||''):'',",
          "const expectedStepPhotos=await ensureStepImagesForExport(",
          "sopExcelPhotoVisibleExtent("
        ):
            self.assertIn(marker,source)
            self.assertIn(marker,baseline)
        self.assertIn("ws.getRow(r).height=stage38CorporateReasonHeight(g,30);",source)
        self.assertIn("M(r,c1,r,c2,s?(s.reason||''):'',{font:{size:11,color:{argb:GRAYTXT}},alignment:T});",source)
        self.assertIn("const T={horizontal:'left',vertical:'top',wrapText:true};",source)
        self.assertIn("M(r,c1,r,c2,s?(s.reason||''):'',{font:{size:11,color:{argb:GRAYTXT}},alignment:C});",baseline)
        self.assertIn("textLines(s?.reason||'',30)",baseline)
        self.assertNotIn("rsLines=Math.max(",source)
        quality=(ROOT/"src/modules/ai/stage38-quality-core.js").read_text(encoding="utf-8")
        self.assertIn("stage38StripOrdinalLabels(s[field])",quality)
        self.assertIn("stage38StripOrdinalLabels(s.reason)",quality)
        self.assertIn("reason:cleanText(s.reason)",
            (ROOT/"src/modules/ai/stage23-protocol.js").read_text(encoding="utf-8"))
        self.assertIn("s.reason=String(s.reason||'')",
            (ROOT/"src/modules/core/stage19-step-shape.js").read_text(encoding="utf-8"))

if __name__=="__main__":
    unittest.main()
