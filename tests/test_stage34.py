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
 "src/modules/frv/stage34-measurements.js",
 "src/modules/frv/stage34-sop-frv-guard.js",
 "src/modules/editor/stage34-steps.js",
 "src/modules/excel/stage34-export.js",
]
class Stage34Contracts(unittest.TestCase):
    def test_isolated_release_and_protected_bundles(self):
        stage34.verify_static()
        spec=json.loads(stage34.MANIFEST.read_text(encoding="utf-8"))
        old=json.loads((ROOT/"src/app/stage33-parts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),62)
        self.assertEqual(len(set(spec["modules"])),62)
        self.assertEqual(spec["static"]["betweenVendorIcons"],"src/app/stage34-between-vendor-icons.html")
        lost=set(old["modules"])-set(spec["modules"])
        added=set(spec["modules"])-set(old["modules"])
        self.assertEqual(lost,{
          "src/modules/frv/stage33-study-model.js",
          "src/modules/frv/stage33-study-io.js",
          "src/modules/frv/stage33-study-ai.js",
          "src/modules/frv/stage33-study.js",
          "src/modules/frv/stage33-measurements.js",
          "src/modules/editor/stage19-steps.js",
          "src/modules/excel/stage33-export.js"})
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
        self.assertIn("_ФОТО_STAGE32_2",html)
        self.assertIn("_ФРВ_ПРОВЕРИТЬ",html)

    def test_new_module_javascript_syntax(self):
        for file in NEW:
            content=(ROOT/file).read_text(encoding="utf-8")
            result=subprocess.run(["node","--check","-"],input=content,
              text=True,capture_output=True)
            self.assertEqual(result.returncode,0,file+": "+result.stderr)

    def test_independent_sop_frvs_dont_break_export(self):
        source="\n".join((ROOT/p).read_text(encoding="utf-8") for p in (
            "src/modules/frv/stage34-measurements.js",
            "src/modules/frv/stage34-sop-frv-guard.js"))
        script=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
let answer='export',lastDialog=null;
const scope={
 state:{steps:[],frvStudy:{studyId:'unrelated'}},escapeHtml:String,
 aiReviewChoiceModal:async p=>{lastDialog=p;return answer;},
 formatHMS:s=>String(s),
 setTimeout:()=>{}
};
vm.createContext(scope);vm.runInContext(SOURCE,scope);
let steps=Array.from({length:6},(_,i)=>({
 id:i+1,action:'Действие '+(i+1),durationSeconds:30,
 frv:{vdc:false,m1:'',m2:'',move:''}
}));
steps[5].frv.m1=52;steps[5].frv.m2=8;
const original=JSON.stringify(steps);
assert.equal(scope.sopFrvExportIssues(steps).length,1);
assert.equal(scope.computeFrv(steps).errors.length,1);
(async()=>{
  const snapshot=structuredClone(steps);
  const outcome=await scope.sopFrvCheckBeforeExcel({steps:snapshot});
  assert.equal(outcome.proceed,true);
  assert.equal(outcome.excluded.length,1);
  assert.equal(snapshot[5].frv.m1,'');
  assert.equal(snapshot[5].frv.m2,'');
  assert.match(snapshot[5]._sopFrvExportWarning,/ФРВ не подтверждена/);
  assert.equal(scope.computeFrv(snapshot).errors.length,0);
  assert.equal(JSON.stringify(steps),original,
    'Never mutate actual SOP values or independent FRV study');
  assert.equal(scope.state.frvStudy.studyId,'unrelated');
  assert.match(lastDialog.details,/Шаг 6/);
  assert.match(lastDialog.details,/М1 \+ М2 = 60 с, длительность = 30 с/);
  answer='cancel';
  const cancelled=await scope.sopFrvCheckBeforeExcel({steps:structuredClone(steps)});
  assert.equal(cancelled.proceed,false);
  const derived={durationSeconds:60,
    frv:{m1:60,m2:'',vdc:false,autoFullStep:true},
    frvSource:{observedTimeSec:52.5}};
  derived.durationSeconds=25;
  assert.equal(scope.sopFrvRefreshProjectedPart(derived,60),true);
  assert.equal(derived.frv.m1,25);
  assert.equal(derived.frvSource.observedTimeSec,52.5);
  derived.frv.autoFullStep=false;
  derived.durationSeconds=20;
  assert.equal(scope.sopFrvRefreshProjectedPart(derived,25),false);
  assert.equal(derived.frv.m1,25);
  console.log('PASS Stage34.1: safe SOP export, step6 mismatch, cancelled validation, measured FRV separation');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
        result=subprocess.run(["node","-"],input="const SOURCE="+json.dumps(source)+";\n"+script,
          capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

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
        run=subprocess.run(["node","-"],input="const SOURCE="+json.dumps(source)+";\n"+script,
          capture_output=True,text=True)
        self.assertEqual(run.returncode,0,run.stdout+"\n"+run.stderr)

if __name__=="__main__":
    unittest.main()
