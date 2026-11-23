"""Stage40 strict additive build and inline guarded full-review contract."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage40 as stage40


class Stage40Review(unittest.TestCase):
    def test_manifest_and_accepted_baseline(self):
        html=stage40.build()
        stage40.verify_static(html)
        previous=json.loads(stage40.PREVIOUS.read_text(encoding="utf-8"))
        candidate=json.loads(stage40.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(previous["modules"]),71)
        self.assertEqual(len(candidate["modules"]),72)
        self.assertEqual(candidate["modules"][-2:],[
            "src/modules/review/stage40-inline-review.js",
            "src/modules/app/stage28-ui.js"
        ])
        self.assertIn("Stage40 (проверка)",html)
        self.assertIn("stage40ApplyReviewFix",html)

    def test_implementation_avoids_new_panels_and_duplicate_buttons(self):
        js=stage40.read(stage40.ADDITION)
        for expected in ("renderReviewResults=function stage40RenderReview",
                         "applyIssueFix=function stage40ApplyReviewFix",
                         "stage28ReviewMeta", "stage40SnapshotFresh",
                         "stage40SourceFromReview", "document.createElement",
                         "data-stage40-compare", "textContent=value",
                         "source", "after"):
            if expected in ("source","after"):
                continue
            self.assertIn(expected,js)
        for forbidden in ("aiAsk(", "aiReviewChoiceModal(", "window.confirm(",
                          "prompt(", "data-stage391-cleanup", "localStorage.",
                          "ExcelJS", "state.steps.push(", "new Function("):
            self.assertNotIn(forbidden,js)
        checked=subprocess.run(["node","--check","-"],input=js,
                               encoding="utf-8",text=True,capture_output=True)
        self.assertEqual(checked.returncode,0,checked.stderr)

    def test_previous_ai_reason_remains_direct(self):
        reason=stage40.read("src/modules/ai/stage39-1-reason-proposal.js")
        self.assertIn("applyFn(fresh.value)",reason)
        self.assertNotIn("stage391ReasonAIReviewModal(",reason)
        self.assertIn("stage391ReasonAIInspect(",reason)
        cleaner=stage40.read("src/modules/editor/stage39-1-reason-cleanup.js")
        self.assertNotIn("stage391ShowReasonCleanup",cleaner)


if __name__=="__main__":
    unittest.main()
