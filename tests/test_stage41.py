"""Stage41: accepted Stage40 byte-exact, additive AI quality only."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage41


class Stage41QualityContracts(unittest.TestCase):
    def test_previous_release_is_byte_exact(self):
        candidate=build_stage41.build()
        build_stage41.verify_static(candidate)
        old=json.loads(build_stage41.PREVIOUS.read_text(encoding="utf-8"))
        new=json.loads(build_stage41.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(old["modules"]),72)
        self.assertEqual(len(new["modules"]),73)
        self.assertEqual(new["modules"][-3:],[
            "src/modules/review/stage40-inline-review.js",
            "src/modules/ai/stage41-quality.js",
            "src/modules/app/stage28-ui.js"
        ])
        self.assertEqual(build_stage41.read(build_stage41.ANCHOR),
                         build_stage41.read("src/modules/review/stage40-inline-review.js"))

    def test_prompt_changes_are_task_limited(self):
        js=build_stage41.read(build_stage41.ADDITION)
        for name in ("generate_sop","review","twi_generate",
                     "stage41PromptForTask","stage41UniqueActionableAIReview",
                     "stage41UnderlyingAIRequest","stage41PreviousGroundAIReview",
                     "stage41PreviousRenderSteps"):
            self.assertIn(name,js)
        self.assertIn("task==='review'",js)
        self.assertIn("revised.replace(NORM_BASE,'')",js)
        self.assertIn("if(!fix)return true",js)
        for forbidden in ("fetch(", "AI_PROXY_BASE=", "localStorage.",
                          "indexedDB", "state.steps.push(", "state.steps=",
                          "aiReviewChoiceModal(", "confirm(", "ExcelJS",
                          "stage391SafeReasonField=", "generateSOP=", "generateTwiPlan="):
            self.assertNotIn(forbidden,js)
        checked=subprocess.run(["node","--check","-"],input=js,
                               text=True,encoding="utf-8",capture_output=True)
        self.assertEqual(checked.returncode,0,checked.stderr)

    def test_accepted_reason_and_review_ux_unchanged(self):
        reason=build_stage41.read("src/modules/ai/stage39-1-reason-proposal.js")
        ui=build_stage41.read("src/modules/review/stage40-inline-review.js")
        self.assertIn("applyFn(fresh.value)",reason)
        self.assertIn("stage391ReasonAIInspect",reason)
        self.assertNotIn("stage391ReasonAIReviewModal",reason)
        self.assertIn("stage40SnapshotFresh",ui)
        self.assertIn("stage40ComparisonCard",ui)


if __name__=="__main__":
    unittest.main()
