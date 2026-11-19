"""Stage23 A3.2: review proposal values must be real and safe to apply."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("stage23_builder",ROOT/"tools/build_stage23.py")
stage23=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage23)

class Stage23ReviewFixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage23.build()
        cls.original=stage23.BASELINE.read_text(encoding="utf-8")
        cls.manifest=json.loads(stage23.MANIFEST.read_text(encoding="utf-8"))

    def test_release_and_unchanged_html_shell(self):
        self.assertEqual(self.html,stage23.OUT.read_text(encoding="utf-8"))
        stage23.verify_static()
        self.assertNotEqual(self.html,self.original)
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)
        self.assertEqual(self.html.count("function reviewNormalizeFixValue("),1)
        self.assertEqual(self.html.count("function applyIssueFix("),1)

    def test_existing_ai_proxy_prompts_and_other_features_untouched(self):
        for path in (
            "src/modules/ai/stage19-transport.js",
            "src/modules/ai/stage19-prompts.js",
            "src/modules/ai/stage22-context-guard.js",
            "src/modules/twi/stage22-from-sop.js",
            "src/modules/frv/stage22-study-ai.js",
            "src/modules/excel/stage20-export.js",
            "src/modules/photos/stage20-photo-read.js",
            "src/modules/core/stage19-config.js",
            "src/modules/documents/stage21-draft.js",
            "src/modules/documents/stage21-db.js",
        ):
            self.assertIn(path,self.manifest["modules"])
            contents=(ROOT/path).read_text(encoding="utf-8")
            self.assertIn(contents,self.original)
            self.assertIn(contents,self.html)
        self.assertEqual(self.html.count("async function aiAsk("),1)
        self.assertEqual(self.html.count("async function generateTwiPlan("),1)
        self.assertEqual(len(self.manifest["modules"]),44)

    def test_current_review_null_and_invalid_fields_cannot_apply_via_node(self):
        contract=(ROOT/"src/modules/review/stage23-safe-fixes.js").read_text(encoding="utf-8")
        proto=(ROOT/"src/modules/ai/stage23-protocol.js").read_text(encoding="utf-8")
        storage=(ROOT/"src/modules/documents/stage23-review-state.js").read_text(encoding="utf-8")
        render=(ROOT/"src/modules/review/stage23-render.js").read_text(encoding="utf-8")
        apply_source=render.split("function applyIssueFix(idx){",1)[1].split("// Stage 17:",1)[0]
        apply_source="function applyIssueFix(idx){"+apply_source
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const notices=[],step={id:7,action:'Проверить электроинструмент',
  keyMoments:['Осмотреть изоляцию'],reason:'Для безопасности',
  durationSeconds:55,successCriteria:'Проверено'};
const form={value:'Ранее согласованные СИЗ'};
const ctx=vm.createContext({
  console,
  state:{steps:[step],meta:{safety:'Ранее согласованные СИЗ'},documentManager:{status:'Черновик'}},
  reviewIssues:[],reviewSummary:{summary:'',overall_quality:'good'},
  deferredIssueKeys:new Set(),showDeferredReviewIssues:false,
  ICON_LIB:[],
  isDeferredIssue:()=>false,
  parseDuration:x=>{if(!/^\d{1,4}:\d{2}$/.test(x))return 0;let [m,s]=x.split(':').map(Number);return s<=59?m*60+s:0},
  toast:(msg)=>notices.push(msg),
  stateChanged:()=>{},saveDraftDebounced:()=>{},renderReviewResults:()=>{},
  htmlFieldToState:()=>{ctx.state.meta.safety=form.value},
  $:id=>id==='meta-safety'?form:null
});
vm.runInContext(SAFE+'\n'+PROTO+'\n'+STORE+'\n'+APPLY,ctx);
for(const v of ['null',' NULL ','"null"',"''null''",'NONE','undefined','N/A','nil','—','не указано','',null,undefined,{},42]){
  assert.equal(ctx.reviewNormalizeFixValue(v),null,JSON.stringify(v));
}
assert.equal(ctx.reviewNormalizeFixValue('Инструмент не должен двигаться'),'Инструмент не должен двигаться');
const i=ctx.validateReviewResponse({issues:[{
  stepId:1,severity:'improvement',type:'unrealistic',field:'time',
  description:'Время выполнения 00:55 слишком короткое',fixValue:'null'
}]});
assert.equal(i.issues[0].fixValue,null);
const reply=ctx.validateDisputeResponse({reply:'Согласен',verdict:'keep',new_fix:'none'});
assert.equal(reply.new_fix,null);
ctx.reviewIssues=[{
  stepId:1,severity:'improvement',field:'time',status:'open',
  description:'Длительность требует проверки',fixValue:'null',thread:[]}];
assert.equal(ctx.reviewGetApplicableFix(ctx.reviewIssues[0]),null);
ctx.applyIssueFix(0);
assert.equal(step.durationSeconds,55);
assert.equal(ctx.reviewIssues[0].status,'open');
assert.equal(notices.length,1);
let snapshot=ctx.captureSopReviewState();
assert.equal(snapshot.issues[0].fixValue,null);
ctx.restoreSopReviewState({reviewState:{issues:[{...ctx.reviewIssues[0],fixValue:'NULL'}],summary:null}});
assert.equal(ctx.reviewIssues[0].fixValue,null);
ctx.reviewIssues=[{stepId:1,field:'time',fixValue:'Увеличить время',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(step.durationSeconds,55);
assert.equal(ctx.reviewIssues[0].status,'open');
ctx.reviewIssues=[{stepId:1,field:'time',fixValue:'00:65',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(step.durationSeconds,55);
ctx.reviewIssues=[{stepId:1,field:'time',fixValue:'02:10',status:'open'}];
assert.equal(ctx.reviewGetApplicableFix(ctx.reviewIssues[0]).value,130);
ctx.applyIssueFix(0);
assert.equal(step.durationSeconds,130);
assert.equal(ctx.reviewIssues[0].status,'applied');
ctx.reviewIssues=[{stepId:1,field:'photo',fixValue:'Замени фото',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(ctx.reviewIssues[0].status,'open');
ctx.reviewIssues=[{stepId:19,field:'action',fixValue:'Изменить шаг',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(step.action,'Проверить электроинструмент');
step.keyMoments=['Один','Два','Три'];
ctx.reviewIssues=[{stepId:1,field:'keyMoments',fixValue:'Четыре',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(step.keyMoments.length,3);
ctx.reviewIssues=[{stepId:null,field:'safety',fixValue:'Диэлектрические перчатки',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(ctx.state.meta.safety,'Диэлектрические перчатки');
assert.equal(ctx.reviewIssues[0].status,'applied');
ctx.state.documentManager.status='Опубликован';
ctx.reviewIssues=[{stepId:1,field:'time',fixValue:'03:00',status:'open'}];
ctx.applyIssueFix(0);
assert.equal(step.durationSeconds,130);
assert.equal(ctx.reviewIssues[0].status,'open');
console.log('PASS: null response, current review storage, unsupported targets, time and document lock');
"""
        code=("const SAFE="+json.dumps(contract,ensure_ascii=False)+
              ";\nconst PROTO="+json.dumps(proto,ensure_ascii=False)+
              ";\nconst STORE="+json.dumps(storage,ensure_ascii=False)+
              ";\nconst APPLY="+json.dumps(apply_source,ensure_ascii=False)+";\n"+harness)
        result=subprocess.run(["node","-e",code],text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
