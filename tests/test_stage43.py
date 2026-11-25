"""Stage43: preserve accepted source, portrait geometry and other sheets."""
import subprocess
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage43

class Stage43(unittest.TestCase):
    def test_baseline(self):
        html=build_stage43.build()
        self.assertEqual(html.count("async function generateExcel(){"),1)
    def test_exporter_shared_code_and_portrait(self):
        old=(ROOT/"src/modules/excel/stage38-export.js").read_text(encoding="utf-8")
        new=(ROOT/"src/modules/excel/stage43-export.js").read_text(encoding="utf-8")
        marker="async function generateExcel(){"
        self.assertEqual(old.split(marker)[0],new.split(marker)[0])
        begin="    ws.getRow(1).height=9;"
        end="    // === ФРВ:"
        old_body=old.split(begin)[1].split(end)[0].replace("    let embeddedStepPhotos=0;\n","").rstrip()
        new_body=new.split(begin)[1].split(end)[0].rstrip()
        self.assertEqual(new_body.removesuffix("    }").rstrip(),old_body)
        end2="    if(embeddedStepPhotos!==expectedStepPhotos)"
        self.assertEqual(old.split(end)[1].split(end2)[0],new.split(end)[1].split(end2)[0])
    def test_layout_only(self):
        for name in ("stage43-landscape-export.js","stage43-export.js"):
            path=ROOT/"src/modules/excel"/name
            result=subprocess.run(["node","--check",str(path)],text=True,capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
        s=(ROOT/"src/modules/excel/stage43-landscape-export.js").read_text(encoding="utf-8")
        for forbidden in ("state.steps","state.meta","localStorage","saveDraft(","idbPutPhoto(","stage42Parse","renderPreview(","aiAsk("):
            self.assertNotIn(forbidden,s)
