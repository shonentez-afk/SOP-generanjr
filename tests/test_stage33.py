"""Stage33: independent FRV observation/analysis -> protected SOP draft, no AI required."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage33 as stage33

FRV_FILES=[
 "src/modules/frv/stage33-measurements.js",
 "src/modules/frv/stage33-study-model.js",
 "src/modules/frv/stage33-study-io.js",
 "src/modules/frv/stage33-study-ai.js",
 "src/modules/frv/stage33-study.js",
 "src/modules/excel/stage33-export.js",
 "src/modules/documents/stage33-draft.js",
]

class Stage33Contracts(unittest.TestCase):
    def test_baseline_isolation_and_offline_bundle(self):
        stage33.verify_static()
        spec=json.loads(stage33.MANIFEST.read_text(encoding="utf-8"))
        original=json.loads((ROOT/"src/app/stage32-parts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),58)
        self.assertEqual(len(set(spec["modules"])),58)
        assert spec["static"]["betweenVendorIcons"]=="src/app/stage33-between-vendor-icons.html"
        allowed=set(FRV_FILES)
        left=set(original["modules"])-set(spec["modules"])
        right=set(spec["modules"])-set(original["modules"])
        self.assertEqual(len(left),7)
        self.assertEqual(right,allowed)
        html=stage33.build()
        for name in ("async function frvStudyBuild(","async function frvStudyAnalyze(",
                     "function frvStudyMakeSok(","async function frvStudySendSop(",
                     "function renderFrvStudy(","function computeFrv(",
                     "async function generateExcel(","async function generateSOP(",
                     "async function generateTwiPlan("):
            self.assertEqual(html.count(name),1,name)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(html.count('id="tab-frvstudy"'),1)
        self.assertIn('id="frvs-processDescription"',html)
        self.assertIn('id="frvStudyDraftSteps"',html)
        self.assertIn('id="frvStudyRestoreBtn"',html)
        self.assertIn("sopExcelPhotoForeground(ws,s._excelPhoto,frame)",html)
        self.assertIn("ФОТО_STAGE32_2.xlsx",html)

    def test_javascript_syntax_and_no_mutating_ai_measured_facts(self):
        for path in FRV_FILES:
            src=(ROOT/path).read_text(encoding="utf-8")
            result=subprocess.run(["node","--check","-"],input=src,text=True,
                                  capture_output=True)
            self.assertEqual(result.returncode,0,path+": "+result.stderr)
        ai=(ROOT/"src/modules/frv/stage33-study-ai.js").read_text(encoding="utf-8")
        self.assertIn("d.suggestedActions=seq.map(",ai)
        self.assertIn("durationSec:null,source:'AI-draft'",ai)
        self.assertNotIn("state.description||",ai)
        self.assertNotIn("d.cycles.push(cycle)",ai)
        self.assertIn("frvStudyMeasuredDuration(o)",ai)
        transfer=(ROOT/"src/modules/frv/stage33-study.js").read_text(encoding="utf-8")
        self.assertIn("frvStudyWriteBackups([...previous",transfer)
        self.assertIn("if(choice!=='create')return;",transfer)
        self.assertIn("createEmptyStep()",transfer)
        self.assertIn("state.steps=generated;",transfer)
        self.assertIn("await applyDraft(last.draft);",transfer)
        self.assertIn("plannedTimeSec:measured",transfer)
        self.assertNotIn("Number(a.standardTimeSec)",transfer)

    def test_measured_nulls_value_partition_and_standard_samples(self):
        files=[ROOT/"src/modules/frv/stage33-measurements.js",
               ROOT/"src/modules/frv/stage33-study-model.js",
               ROOT/"src/modules/frv/stage33-study.js"]
        source="\n".join(x.read_text(encoding="utf-8") for x in files)
        script=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
const scope={
 state:{steps:[],frvStudy:null},
 escapeHtml:s=>String(s),
 formatHMS:s=>String(s),formatDuration:s=>String(s),
 $:()=>null,toast:()=>{},
 createEmptyStep:()=>({id:7,durationSeconds:0,frv:{}}),
 frvStudySyncFields:()=>{},saveDraft:()=>{},renderFrvStudy:()=>{},
 saveDraftDebounced:()=>{}
};
vm.createContext(scope);vm.runInContext(SOURCE,scope);
assert.equal(scope.frvStudyMeasuredDuration({durationSec:null}),null);
assert.equal(scope.frvStudyMeasuredDuration({durationSec:''}),null);
assert.equal(scope.frvStudyMeasuredDuration({durationSec:'4.25'}),4.25);
assert.equal(scope.frvStudyMeasuredDuration({durationSec:-3}),null);
const r=scope.computeFrv([{id:1,action:'X',durationSeconds:60,
 frv:{vdc:true,m1:15,m2:10,move:3}}]);
assert.equal(r.rows[0].vdcSec,35);
assert.equal(r.rows[0].vdcSec+r.rows[0].m1+r.rows[0].m2,60);
assert.equal(r.sumV,35);assert.equal(r.errors.length,0);
const invalid=scope.computeFrv([{id:2,action:'Y',durationSeconds:30,
 frv:{vdc:true,m1:20,m2:20}}]);
assert.equal(invalid.errors.length,1);
const d=scope.ensureFrvStudy();
const a={...scope.frvStudyEmptyObservation(1),actionRaw:'Проверить питание',
 durationSec:22.5,standardCandidate:true,valueType:'VA'};
const b={...scope.frvStudyEmptyObservation(1),actionRaw:'Проверить питание',
 durationSec:26.5,standardCandidate:true,valueType:'VA'};
const waste={...scope.frvStudyEmptyObservation(2),actionRaw:'Ожидать материалы',
 durationSec:33,standardCandidate:false,valueType:'WAIT'};
d.cycles=[{cycleNo:1,observations:[a,waste]},
 {cycleNo:2,observations:[b]}];
scope.frvStudyMakeSok();
assert.equal(d.standardCandidate.steps.length,1);
assert.equal(d.standardCandidate.steps[0].observedTimeSec,24.5);
assert.equal(d.standardCandidate.steps[0].plannedTimeSec,24.5);
assert.equal(d.standardCandidate.steps[0].sourceObservationIds.length,2);
assert.equal(scope.frvStudyProposedSteps(d).length,1);
let transferred=scope.frvStudySourceStep(d.standardCandidate.steps[0],d);
assert.equal(transferred.durationSeconds,25);
assert.equal(transferred.frvSource.observedTimeSec,24.5);
assert.equal(transferred.frvSource.observationIds.length,2);
d.standardCandidate.steps[0].plannedTimeSec=null;
assert.equal(scope.frvStudyProposedSteps(d),null);
console.log('PASS Stage33 local FRV partition, null measurement, median project time and evidence references');
"""
        result=subprocess.run(["node","-"],input="const SOURCE="+json.dumps(source)+";\n"+script,
                              capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":unittest.main()
