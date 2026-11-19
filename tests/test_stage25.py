"""Stage25 A3/A4: safe structured AI previews and classified errors."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("stage25_builder",ROOT/"tools/build_stage25.py")
stage25=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage25)

class Stage25SafeAi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage25.build()
        cls.baseline=stage25.BASELINE.read_text(encoding="utf-8")
        cls.manifest=json.loads(stage25.MANIFEST.read_text(encoding="utf-8"))

    def test_rebuild_release_and_offline_assets(self):
        self.assertEqual(self.html,stage25.OUT.read_text(encoding="utf-8"))
        stage25.verify_static()
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)
        self.assertNotEqual(self.html,self.baseline)
        self.assertEqual(len(self.manifest["modules"]),49)
        self.assertEqual(self.html.count("async function aiAsk("),1)
        self.assertEqual(self.html.count("async function generateSOP("),1)
        self.assertEqual(self.html.count("async function frvStudyBuild("),1)
        self.assertEqual(self.html.count("function aiReviewChoiceModal("),1)

    def test_transport_contract_identical_except_user_facing_diagnosis(self):
        previous=(ROOT/"src/modules/ai/stage19-transport.js").read_text(encoding="utf-8")
        current=(ROOT/"src/modules/ai/stage25-transport.js").read_text(encoding="utf-8")
        a="function makeTimeoutSignal(ms){"
        self.assertEqual(previous.split(a,1)[1],current.split(a,1)[1])
        self.assertEqual(previous.split("function diagnoseAIError(e){",1)[0],
                         current.split("function diagnoseAIError(e){",1)[0])
        self.assertEqual(current.count("async function aiAsk("),1)
        self.assertEqual(current.count("async function testAIConnection("),1)
        for path in ("src/modules/ai/stage19-prompts.js",
                     "src/modules/core/stage19-config.js",
                     "src/modules/ai/stage24-task-response.js",
                     "src/modules/twi/stage24-from-sop.js",
                     "src/modules/photos/stage20-photo-read.js",
                     "src/modules/excel/stage20-export.js",
                     "src/modules/documents/stage21-draft.js"):
            contents=(ROOT/path).read_text(encoding="utf-8")
            self.assertIn(path,self.manifest["modules"])
            self.assertIn(contents,self.baseline)
            self.assertIn(contents,self.html)
        self.assertEqual(self.html.count("const AI_PROXY_BASE="),1)

    def test_network_error_taxonomy_and_preview_detection_via_node(self):
        source=[
            (ROOT/"src/modules/ai/stage25-errors.js").read_text(encoding="utf-8"),
            (ROOT/"src/modules/ai/stage25-preview.js").read_text(encoding="utf-8")
        ]
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const context=vm.createContext({
  console,
  state:{
    meta:{operation:'Проверка'},
    steps:[],
    frvStudy:null
  },
  document:{createElement(){throw new Error('No DOM allowed in pure tests')}}
});
vm.runInContext(SOURCES.join('\n'),context);
function classification(e,kind,retryable){
  const r=context.aiErrorClassify(e);
  assert.equal(r.kind,kind);
  assert.equal(r.retryable,retryable);
  assert.ok(r.message.length>14);
  return r.message;
}
classification(Object.assign(new Error('bad JSON'),{code:'AI_TASK_JSON_FORMAT'}),'invalid_json',true);
classification(Object.assign(new Error('partial'),{code:'AI_TASK_INCOMPLETE'}),'incomplete',true);
classification(Object.assign(new Error('aborted'),{name:'AbortError'}),'timeout',true);
classification(new TypeError('Failed to fetch'),'network',true);
classification(new SyntaxError('Unexpected token in JSON'),'proxy_json',true);
classification(new Error('401 unauthorized'),'access',false);
classification(new Error('403 forbidden'),'access',false);
classification(new Error('404 route'),'not_found',false);
classification(new Error('429 Too Many Requests'),'rate_limit',true);
classification(new Error('502 gateway'),'server',true);
classification(new Error('504 timeout'),'timeout',true);
classification(new Error('413 too large'),'too_large',false);
classification(new Error('400 invalid'),'http',false);
classification(new Error('Пустой ответ от YandexGPT'),'empty',true);
classification(new Error('Unknown plain error'),'other',false);
assert.equal(context.aiErrorClassify(new Error('measurement 5000 items')).kind,'other');
assert.equal(context.aiUserFacingError(new Error('429 limit')),
  context.aiErrorClassify(new Error('429 limit')).message);
assert.equal(context.aiSopHasMeaningfulSteps(),false);
context.state.steps=[{action:'',reason:'',durationSeconds:0,keyMoments:[''],hasPhoto:false}];
assert.equal(context.aiSopHasMeaningfulSteps(),false);
context.state.steps[0].hasPhoto=true;
assert.equal(context.aiSopHasMeaningfulSteps(),true);
context.state.steps=[{action:'Проверить корпус'}];
assert.equal(context.aiSopHasMeaningfulSteps(),true);
assert.equal(context.aiFrvHasMeaningfulObservations({cycles:[{observations:[{actionRaw:'',durationSec:null}]}]}),false);
assert.equal(context.aiFrvHasMeaningfulObservations({cycles:[{observations:[{actionRaw:'Осмотр',durationSec:42}]}]}),true);
assert.equal(context.aiFrvHasMeaningfulObservations({cycles:[{observations:[{actionRaw:'',durationSec:33}]}]}),true);
console.log('PASS Stage25: classified errors and meaningful SOP/FRV source detection');
"""
        js="const SOURCES="+json.dumps(source,ensure_ascii=False)+";\n"+harness
        r=subprocess.run(["node","-e",js],capture_output=True,text=True)
        self.assertEqual(r.returncode,0,r.stdout+"\n"+r.stderr)

    def test_no_unapproved_mutation_in_implemented_tasks(self):
        sop=(ROOT/"src/modules/ai/stage25-generate-sop.js").read_text(encoding="utf-8")
        frv=(ROOT/"src/modules/frv/stage25-study-ai.js").read_text(encoding="utf-8")
        preview=(ROOT/"src/modules/ai/stage25-preview.js").read_text(encoding="utf-8")
        self.assertIn("choice=await aiSopPlanPreview(sop);",sop)
        self.assertIn("if(!aiGuardCanApply(guard))return;",sop)
        self.assertIn("state.steps.push(...additions);",sop)
        self.assertIn("state.steps=additions;",sop)
        self.assertIn("const choice=await aiFrvAppendPreview(d,observations);",frv)
        self.assertIn("d.cycles.push(cycle);",frv)
        self.assertIn("durationSec:null",frv)
        self.assertIn("d.analysisNeedsReview=true;",frv)
        self.assertIn("data-ai-preview-action",preview)
        self.assertIn("escapeHtml(",preview)

if __name__=="__main__":
    unittest.main()
