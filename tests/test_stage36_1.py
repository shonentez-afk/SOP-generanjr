"""Stage36.1: TWI print module isolation and accepted Stage36 static assets."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage36_1 as candidate
class TwiPrintStage361(unittest.TestCase):
    def test_build_manifest_and_protection(self):
        candidate.verify_static()
        old=json.loads((ROOT/"src/app/stage36-parts.json").read_text(encoding="utf-8"))
        new=json.loads(candidate.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(old["modules"]),63)
        self.assertEqual(len(new["modules"]),64)
        self.assertEqual(len(new["modules"]),len(set(new["modules"])))
        self.assertEqual(set(old["modules"])-set(new["modules"]),set())
        self.assertEqual(set(new["modules"])-set(old["modules"]),
                         {"src/modules/twi/stage36-1-print-xlsx.js"})
        self.assertEqual(new["static"]["betweenVendorIcons"],
                         "src/app/stage36-1-between-vendor-icons.html")
        html=candidate.build()
        for mark in [
            "async function exportTwiPrintXlsx(",
            "function twiCreatePrintWorkbook(",
            "function twiPrintBreakdown(",
            "function twiPrintInstructor(",
            'id="twiExportXlsxBtn"',
            'id="twiExportStatus"',
            "async function stage36BuildAllBackup(",
            "async function generateExcel(",
            "async function generateTwiPlan(",
        ]:
            self.assertEqual(html.count(mark),1,mark)
    def test_syntax_and_no_ai_or_state_mutation(self):
        source=(ROOT/"src/modules/twi/stage36-1-print-xlsx.js").read_text(encoding="utf-8")
        p=subprocess.run(["node","--check","-"],input=source,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertNotIn("aiAsk(",source)
        self.assertNotIn("\n  htmlToTwi(",source.split("function twiPrintSnapshot(){")[1].split("function twiPrintIssues")[0])
        self.assertIn("fitToWidth:1,fitToHeight:0",source)
        self.assertIn("printTitlesRow",source)
        self.assertIn("TWI_PRINT_SECTIONS",source)

if __name__=="__main__":
    unittest.main()
