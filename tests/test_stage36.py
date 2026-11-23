import json
import subprocess
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage36

class Safety(unittest.TestCase):
    def test_manifest_and_static_assets(self):
        build_stage36.verify_static()
        old=json.loads((ROOT/"src/app/stage35-parts.json").read_text(encoding="utf8"))
        new=json.loads(build_stage36.MANIFEST.read_text(encoding="utf8"))
        self.assertEqual(len(new["modules"]),63)
        self.assertEqual(len(new["modules"]),len(set(new["modules"])))
        self.assertEqual(set(old["modules"])-set(new["modules"]),{"src/modules/frv/stage35-library.js"})
        self.assertEqual(set(new["modules"])-set(old["modules"]),{"src/modules/frv/stage36-library.js","src/modules/documents/stage36-backup.js"})
        html=build_stage36.build()
        for name in ("function frv36SaveConflictCopy(","async function stage36BuildAllBackup(","async function stage36MakePlan(","async function stage36CommitPlan(",'id="doc36ExportAllBtn"','id="doc36ImportAllBtn"','id="frv36SaveConflictCopyBtn"',"async function generateExcel(","async function generateTwiPlan("):
            self.assertEqual(html.count(name),1,name)
    def test_syntax_and_transaction(self):
        for path in ("src/modules/frv/stage36-library.js","src/modules/documents/stage36-backup.js"):
            js=(ROOT/path).read_text(encoding="utf8")
            result=subprocess.run(["node","--check","-"],input=js,text=True,capture_output=True)
            self.assertEqual(result.returncode,0,path+": "+result.stderr)
        js=(ROOT/"src/modules/frv/stage36-library.js").read_text(encoding="utf8")
        for name in ("const tx=db.transaction(FRV34_STORE,'readwrite')","const req=st.get(record.id)","st.put(record)","frv36RecordRevision(req.result)!==expectedRevision","copy.libraryId=frvStudyNewId()"):
            self.assertIn(name,js)

if __name__=="__main__":
    unittest.main()
