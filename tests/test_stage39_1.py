"""Stage39.1 isolated AI/FRV fix contract; accepted Stage39 stays byte-identical."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage39_1 as new


class Stage391Contracts(unittest.TestCase):
    def test_sources_and_accepted_html(self):
        html=new.build()
        new.verify_static(html)
        old=json.loads(new.PREVIOUS.read_text(encoding="utf-8"))
        cur=json.loads(new.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(old["modules"]),67)
        self.assertEqual(len(cur["modules"]),69)
        self.assertTrue(set(new.REPLACEMENTS).issubset(set(old["modules"])))
        for unchanged in ("src/modules/excel/stage38-export.js",
                          "src/modules/twi/stage38-print-xlsx.js",
                          "src/modules/editor/stage39-step-actions.js",
                          "src/modules/ai/stage26-transport.js"):
            self.assertIn(unchanged,cur["modules"])

    def test_changed_js_syntax(self):
        for p in [*new.REPLACEMENTS.values(),*new.EXTRA.values()]:
            result=subprocess.run(["node","--check","-"],input=new.read(p),
                                  text=True,encoding='utf-8',capture_output=True)
            self.assertEqual(result.returncode,0,p+": "+result.stderr)

    def test_data_safety_contract(self):
        f=new.read("src/modules/ai/stage39-1-field-editor.js")
        gate=new.read("src/modules/quality/stage39-1-ai-guards.js")
        checklist=new.read("src/modules/review/stage39-1-checklist.js")
        frv=new.read("src/modules/frv/stage39-1-study.js")
        frv_ui=new.read("src/modules/frv/stage39-1-study-model.js")
        review=new.read("src/modules/ai/stage39-1-review-task.js")
        facts=new.read("src/modules/ai/stage39-1-intelligence.js")
        self.assertIn("stage391AcceptedReasonFill",f)
        self.assertIn("if(type==='reason')return stage391AcceptedReasonFill(btn,type,source,applyFn);",f)
        self.assertNotIn("stage391StarReasonOnly",f)
        self.assertNotIn("stage391RejectInvalidReason",f)
        accepted=new.read("src/modules/ai/stage22-field-editor.js")
        accepted_fn=accepted.split("async function aiFillField(",1)[1].strip()
        self.assertIn("async function stage391AcceptedReasonFill("+accepted_fn,f)
        base=new.read("src/modules/ai/stage38-base-prompts.js")
        rollback=new.read("src/modules/ai/stage39-1-base-prompts.js")
        reason=lambda s:s.split("\\n reason:`",1)[1].split("\\n photoHint:",1)[0]
        self.assertEqual(reason(base),reason(rollback))
        self.assertIn("stage391ValidateKeyPointProposal",f)
        self.assertIn("selectedKeyPointIndex",f)
        self.assertIn("allKeyPoints",f)
        self.assertIn("stage29HasUnconfirmedNumber",gate)
        self.assertIn("stage38StripOrdinalLabels",gate)
        self.assertIn("stage391ReasonShape",gate)
        self.assertIn("const requiringWhy",checklist)
        self.assertIn("stage391TwiReasonQualityIssues",gate)
        self.assertIn("stage391NormalizeWithReasonReview",gate)
        self.assertIn("stage391TwiStructureWithWhy",gate)
        self.assertIn("не переписывай",new.read("src/modules/ai/stage39-1-base-prompts.js").lower())
        self.assertNotIn("const ref=S.filter",checklist)
        self.assertIn("norm",review.lower())
        self.assertIn("stage391ValidateReasonProposal",facts)
        self.assertIn("stage391ReasonShape",frv)
        self.assertIn("s.reason=stage38ReasonText",frv)
        self.assertIn('data-frvs-step="reason"',frv_ui)
        self.assertIn("field==='reason'?'textarea':'text'",frv_ui)
        self.assertIn("frvSource={",frv)

if __name__=="__main__":
    unittest.main()
