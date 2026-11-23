"""Stage39: structural actions must not alter the accepted Stage38 bundle or photo data."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage39 as stage39


class Stage39Contract(unittest.TestCase):
    def test_exact_stage38_preservation(self):
        stage39.verify_static()
        old=json.loads(stage39.STAGE38_MANIFEST.read_text(encoding="utf-8"))
        new=json.loads(stage39.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(old["modules"]),66)
        self.assertEqual(len(new["modules"]),67)
        self.assertEqual(len(new["modules"]),len(set(new["modules"])))
        self.assertEqual(set(new["modules"])-set(old["modules"]),{stage39.NEW_MODULE})
        self.assertEqual(set(old["modules"])-set(new["modules"]),set())
        self.assertEqual(new["modules"][-4:],old["modules"][-4:])

    def test_stage39_js_syntax(self):
        source=(ROOT/stage39.NEW_MODULE).read_text(encoding="utf-8")
        check=subprocess.run(["node","--check","-"],input=source,
                             capture_output=True,text=True)
        self.assertEqual(check.returncode,0,check.stderr)

    def test_guardrails(self):
        source=(ROOT/stage39.NEW_MODULE).read_text(encoding="utf-8")
        delete=source.split("function stage39Delete(id){",1)[1].split("async function stage39Duplicate",1)[0]
        self.assertNotIn("idbDeletePhoto(",delete)
        self.assertIn("stage39Remember(before,'Удаление шага')",delete)
        self.assertIn("state.steps=before.filter",delete)
        duplicate=source.split("async function stage39Duplicate(id){",1)[1].split("function stage39Undo()",1)[0]
        self.assertIn("copy.frv=blank.frv",duplicate)
        self.assertIn("delete copy.frvSource",duplicate)
        self.assertIn("photoCopyRecordToKey(photoRecord,newId)",duplicate)
        self.assertIn("updateStepPhotoFromRecord(copy,photoRecord)",duplicate)
        self.assertIn("stage39DocumentKey()!==documentKey",duplicate)
        self.assertIn("stage39HistoryCurrent()",source)
        self.assertIn("stage39UndoLimit=20",source)
        self.assertIn("stage39CollapsedIds",source)
        self.assertIn("stage39OriginalRenderSteps=renderSteps",source)
        self.assertIn("stage39OriginalApplyDocumentLock=applyDocumentLock",source)
        self.assertIn("e.stopImmediatePropagation()",source)


if __name__=="__main__":
    unittest.main()
