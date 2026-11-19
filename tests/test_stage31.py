"""Stage31: photo annotation precision and safe-save protections."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage31 as stage31

class Stage31PrecisionTests(unittest.TestCase):
    def test_standalone_preserves_stage30(self):
        stage31.verify_static()
        spec=json.loads(stage31.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),58)
        self.assertEqual(len(set(spec["modules"])),58)
        self.assertNotIn("src/modules/photos/stage30-illustration-editor.js",spec["modules"])
        self.assertIn("src/modules/photos/stage31-illustration-editor.js",spec["modules"])
        self.assertIn("src/modules/photos/stage30-history.js",spec["modules"])
        html=stage31.build()
        self.assertEqual(html.count("async function openIllustrationEditor("),1)
        self.assertEqual(html.count("async function generateSOP()"),1)
        self.assertEqual(html.count("async function generateTwiPlan()"),1)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)
        self.assertIn("aria-busy",html)
    def test_precision_and_transaction_guards(self):
        src=(ROOT/"src/modules/photos/stage31-illustration-editor.js").read_text(encoding="utf-8")
        self.assertIn("drawArrow(item.x2,item.y2,item.x1,item.y1,item)",src)
        self.assertIn("s.text=value;draw();commitIllustrationEdit()",src)
        self.assertIn("if(segment && ctx.measureText(segment+ch).width>maxW)",src)
        self.assertIn("if(savingIllustration)return;",src)
        self.assertIn("if(savingIllustration&&!saved)return false;",src)
        self.assertIn("step.imageBuffer=imageBuffer;",src)
        self.assertIn("if(!(await idbPutPhoto(step.id,baseBlob",src)
        self.assertIn("finally{",src)
        self.assertIn("window.removeEventListener('keydown',onKey)",src)
        self.assertNotIn("drawArrow(item.x1,item.y1,item.x2,item.y2,item);const anchorX=",src)
        script=src.replace("async function openIllustrationEditor(stepId)", "async function openIllustrationEditor(stepId)")
        p=subprocess.run(["node","--check","-"],input=script,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stderr)

if __name__=="__main__":unittest.main()
