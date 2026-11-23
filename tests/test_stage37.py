"""Stage37 non-destructive desktop audit: guards, frozen baseline and build."""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage37 as candidate

class Stage37Safety(unittest.TestCase):
    def test_accepted_modules_and_vendor_are_frozen(self):
        candidate.verify_static()
        base=json.loads((ROOT/"src/app/stage36-1-parts.json").read_text(encoding="utf-8"))
        new=json.loads(candidate.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(base["modules"]),64)
        self.assertEqual(len(new["modules"]),65)
        self.assertEqual(len(new["modules"]),len(set(new["modules"])))
        self.assertEqual(set(base["modules"])-set(new["modules"]),set())
        self.assertEqual(set(new["modules"])-set(base["modules"]),
                         {"src/modules/documents/stage37-data-loss-safety.js"})
        self.assertEqual(new["static"]["betweenVendorIcons"],
                         "src/app/stage37-between-vendor-icons.html")
        html=candidate.build()
        for marker in (
          'id="sopVersionLabel"',
          "function stage37ConfirmLeaveSop(",
          "function stage37SafeDraftInit(",
          "function stage37SafeDraftSave(",
          "function stage37GuardedDocOpen(",
          "function stage37GuardedDocNewVersion(",
          "async function exportTwiPrintXlsx(",
          "async function stage36BuildAllBackup(",
          "async function generateExcel(",
          "async function generateTwiPlan("
        ):
          self.assertEqual(html.count(marker),1,marker)

    def test_guard_source_syntax_and_no_accepted_ai_changes(self):
        path=ROOT/"src/modules/documents/stage37-data-loss-safety.js"
        js=path.read_text(encoding="utf-8")
        result=subprocess.run(["node","--check","-"],input=js,
                              capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        for marker in ("stage37DraftDecisionPending","stage37PreviousSaveDraft",
            "stage37OriginalDocOpen","stage37OriginalDocNewVersion",
            "stage37OriginalDocNew","stage37SopComparable",
            "stage37DownloadUnreadableDraft"):
            self.assertIn(marker,js)
        self.assertNotIn("aiAsk(",js)
        self.assertNotIn("docDbPut(",js)
        self.assertNotIn("frv34StorePut(",js)

    def test_release_uses_accepted_baseline(self):
        self.assertEqual(candidate.BASELINE.name,
                         "stage36-1-twi-print-xlsx-browser-candidate.html")
        self.assertEqual(candidate.OUT.name,
                         "stage37-desktop-audit-browser-candidate.html")

if __name__=="__main__":
    unittest.main()
