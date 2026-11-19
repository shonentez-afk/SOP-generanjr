"""Stage20 A2: immutable export snapshots, owned media reads, and build guards."""
from __future__ import annotations
import importlib.util
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("stage20_builder",ROOT/"tools/build_stage20.py")
import sys
sys.path.insert(0,str(ROOT/"tools"))
stage20=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage20)

class Stage20ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage20.build()
        cls.original=stage20.BASELINE.read_text(encoding="utf-8")

    def test_release_is_reproducible_and_static_assets_identical(self):
        self.assertEqual(self.html,stage20.OUT.read_text(encoding="utf-8"))
        stage20.verify_static()
        self.assertNotEqual(self.html,self.original)
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)
        self.assertEqual(self.html.count("const AI_PROXY_BASE="),1)

    def test_other_ai_config_and_twi_untouched(self):
        start="const AI_PROXY_BASE="
        end="// 2. Generic helpers"
        self.assertEqual(
            self.original.split(start,1)[1].split(end,1)[0],
            self.html.split(start,1)[1].split(end,1)[0])
        for term in ["async function generateTwiPlan()","function mentorCleanDisputeReply(value)","function renderReviewResults("]:
            self.assertEqual(self.html.count(term),self.original.count(term))

    def test_export_only_reads_snapshot_not_live_global_state(self):
        exporter=(ROOT/"src/modules/excel/stage20-export.js").read_text(encoding="utf-8")
        self.assertNotIn("state.steps=state.steps.map",exporter)
        self.assertNotIn("localStorage.removeItem(DRAFT_KEY)",exporter)
        preparation=exporter.split("async function ensureStepImagesForExport(",1)[1].split("async function generateExcel(",1)[0]
        self.assertNotIn("state.",preparation)
        self.assertIn("readSopStepPhotoBlobForExport(step,documentId)",preparation)
        generate=exporter.split("async function generateExcel(",1)[1]
        self.assertIn("createSopExportSnapshot(state)",generate)
        self.assertIn("ensureStepImagesForExport(exportData.steps,exportData.documentManager?.currentId)",generate)
        self.assertIn("computeFrv(exportData.steps)",generate)
        self.assertIn("saveDraft();",generate)
        self.assertNotIn("state.steps=state.steps.map",generate)

    def test_snapshot_purity_and_fr_v_override_using_node(self):
        core=(ROOT/"src/modules/core/stage20-export-snapshot.js").read_text(encoding="utf-8")
        frv=(ROOT/"src/modules/frv/stage20-measurements.js").read_text(encoding="utf-8")
        harness=r"""
const assert=require('node:assert/strict');
const vm=require('node:vm');
const ctx=vm.createContext({
  structuredClone,Blob,Uint8Array,parseDuration:()=>5,formatHMS:n=>'s'+n,
  state:{steps:[{action:'GLOBAL SENTINEL',durationSeconds:9,keyMoments:['X'],frv:{vdc:false}}]}
});
vm.runInContext(CORE+FRV,ctx);
const src={meta:{operation:'Original'},responsibles:['A'],agreedList:[{name:'B'}],
 safetyIconIds:['M004'],frvMeta:{purpose:'test'},checklist:[{score:1,weight:1}],
 documentManager:{currentId:'doc-1'},steps:[{id:8,action:'Проверка',
 keyMoments:['KM'],durationSeconds:45,frv:{vdc:true,m2:'1',m1:'0',move:'5',comment:'safe'},
 photoAnnotations:[{x:10}],imageBuffer:new Uint8Array([137,80,78,71]),hasPhoto:true}]};
const previousRefs={steps:src.steps,step:src.steps[0],frv:src.steps[0].frv,buf:src.steps[0].imageBuffer};
const before=JSON.stringify(src);
const copy=ctx.createSopExportSnapshot(src);
assert.equal(JSON.stringify(src),before);
assert.equal(src.steps,previousRefs.steps);
assert.equal(src.steps[0],previousRefs.step);
assert.notEqual(copy.steps,src.steps);
assert.notEqual(copy.steps[0],src.steps[0]);
assert.notEqual(copy.steps[0].frv,previousRefs.frv);
assert.notEqual(copy.steps[0].imageBuffer,previousRefs.buf);
assert.equal(copy.steps[0].imageBuffer[0],137);
assert.equal(copy.steps[0].photoAnnotations[0].x,10);
assert.equal(copy.totalTimeSeconds,45);
const result=ctx.computeFrv(copy.steps);
assert.equal(result.cum,45);
assert.equal(result.sumV,45);
assert.equal(result.sumMove,5);
assert.equal(result.rows[0].action,'Проверка');
assert.equal(ctx.computeFrv().rows[0].action,'GLOBAL SENTINEL');
copy.steps[0].action='EXPORTED ONLY';
copy.steps[0].frv.m2='99';
copy.steps[0].photoAnnotations[0].x=22;
copy.steps[0].imageBuffer[0]=1;
assert.equal(JSON.stringify(src),before);
assert.equal(src.steps[0].imageBuffer[0],137);
console.log('PASS: private snapshot + FRV computed from captured steps only');
"""
        # The module text is evaluated as function declarations, without executing UI handlers.
        code="const CORE="+repr(core)+";\nconst FRV="+repr(frv)+";\n"+harness
        result=subprocess.run(["node","-e",code],text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
