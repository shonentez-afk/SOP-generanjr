"""Stage34: local study library, deterministic analysis and offline XLSX contracts."""
import json
import subprocess
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage34 as stage34

NEW=[
 "src/modules/frv/stage34-study-model.js",
 "src/modules/frv/stage34-study-io.js",
 "src/modules/frv/stage34-study-ai.js",
 "src/modules/frv/stage34-study.js",
 "src/modules/frv/stage34-library.js",
 "src/modules/frv/stage34-analytics.js",
 "src/modules/frv/stage34-xlsx.js",
]
class Stage34Contracts(unittest.TestCase):
    def test_isolated_release_and_protected_bundles(self):
        stage34.verify_static()
        spec=json.loads(stage34.MANIFEST.read_text(encoding="utf-8"))
        old=json.loads((ROOT/"src/app/stage33-parts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),61)
        self.assertEqual(len(set(spec["modules"])),61)
        self.assertEqual(spec["static"]["betweenVendorIcons"],"src/app/stage34-between-vendor-icons.html")
        lost=set(old["modules"])-set(spec["modules"])
        added=set(spec["modules"])-set(old["modules"])
        self.assertEqual(lost,{
          "src/modules/frv/stage33-study-model.js",
          "src/modules/frv/stage33-study-io.js",
          "src/modules/frv/stage33-study-ai.js",
          "src/modules/frv/stage33-study.js"})
        self.assertEqual(added,set(NEW))
        html=stage34.build()
        for function in ("frv34DbOpen","frvStudyQueuePersist","frvStudyRestoreFromFile",
          "frv34AnalyticsData","frv34ExportXlsx","frv34SuggestClassifications",
          "async function generateExcel(","async function generateSOP(",
          "async function generateTwiPlan("):
            self.assertEqual(html.count("function "+function if not function.startswith("async") else function),1,function)
        for marker in ('id="frvStudySaveStatus"','id="frvStudyExportXlsxBtn"',
          'id="frvStudyRestoreJsonInput"','id="frvStudyLibraryPanel"',
          'id="frvStudyClassifyBtn"'):
            self.assertEqual(html.count(marker),1,marker)
        self.assertIn("sopExcelPhotoForeground(ws,s._excelPhoto,frame)",html)
        self.assertIn("_ФОТО_STAGE32_2.xlsx",html)

    def test_new_module_javascript_syntax(self):
        for file in NEW:
            content=(ROOT/file).read_text(encoding="utf-8")
            result=subprocess.run(["node","--check","-"],input=content,
              text=True,capture_output=True)
            self.assertEqual(result.returncode,0,file+": "+result.stderr)

    def test_analytics_no_invented_measurements(self):
        source="\n".join((ROOT/p).read_text(encoding="utf-8")
          for p in ["src/modules/frv/stage34-study-model.js",
            "src/modules/frv/stage34-analytics.js"])
        script=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
const scope={state:{frvStudy:null},escapeHtml:String,$:()=>null,
  saveDraftDebounced:()=>{},frvStudyQueuePersist:()=>{},
  toast:()=>{},saveDraft:()=>{},frvStudyHasBackup:()=>false};
vm.createContext(scope);vm.runInContext(SOURCE,scope);
const d=scope.ensureFrvStudy();
const row=(seq,name,t,type,loss)=>({
 ...scope.frvStudyEmptyObservation(seq),actionRaw:name,
 durationSec:t,valueType:type,lossCode:loss||''});
d.cycles=[
 {cycleNo:1,phase:'baseline',observations:[
  row(1,'Проверить корпус',40,'VA'),
  row(2,'Искать ключ',20,'NVA_Waste','search_tool'),
  row(3,'Ожидать материал',10,'WAIT','material_wait')]},
 {cycleNo:2,phase:'improved',observations:[
  row(1,'Проверить корпус',32,'VA'),
  row(2,'Искать ключ',8,'NVA_Waste','search_tool'),
  row(3,'Ожидать материал',null,'WAIT','material_wait')]}
];
let a=scope.frv34AnalyticsData(d);
assert.equal(a.total,110);
assert.equal(a.missing,1);
assert.equal(a.lossSec,38);
assert.equal(a.pareto.reduce((n,x)=>n+x.durationSec,0),38);
assert.equal(a.pareto[0].key,'search_tool');
assert.equal(a.pareto[0].durationSec,28);
assert.equal(a.pareto.at(-1).cumulativePct,100);
assert.equal(a.comparison.comparable,false);
d.comparisonApproved=true;
a=scope.frv34AnalyticsData(d);
assert.equal(a.comparison.comparable,false,
 'Incomplete improved cycle is not a fake full measured cycle');
d.cycles[1].observations[2].durationSec=5;
a=scope.frv34AnalyticsData(d);
assert.equal(a.comparison.comparable,true);
assert.equal(a.comparison.deltaSec,25);
assert.equal(a.comparison.baselineSec,70);
assert.equal(a.comparison.improvedSec,45);
const copied=d.cycles[0].observations.map((o,i)=>({
 ...scope.frvStudyEmptyObservation(i+1),actionRaw:o.actionRaw,durationSec:null}));
assert(copied.every(x=>x.durationSec===null));
console.log('PASS Stage34 deterministic Pareto, missing time, repeated measurements and verified before-after');
"""
        run=subprocess.run(["node","-e","const SOURCE="+json.dumps(source)+";\n"+script],
          capture_output=True,text=True)
        self.assertEqual(run.returncode,0,run.stdout+"\n"+run.stderr)

if __name__=="__main__":
    unittest.main()
