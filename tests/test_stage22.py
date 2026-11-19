"""Stage22 A3.1: AI reply guard, version preservation and no model/proxy changes."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("stage22_builder",ROOT/"tools/build_stage22.py")
stage22=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage22)

class Stage22AiGuards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage22.build()
        cls.baseline=stage22.BASELINE.read_text(encoding="utf-8")
        cls.manifest=json.loads(stage22.MANIFEST.read_text(encoding="utf-8"))

    def test_exact_rebuild_and_unchanged_shell(self):
        self.assertEqual(self.html,stage22.OUT.read_text(encoding="utf-8"))
        stage22.verify_static()
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)
        self.assertNotEqual(self.html,self.baseline)

    def test_ai_transport_prompts_protocol_and_storage_untouched(self):
        paths=self.manifest["modules"]
        for path in ("src/modules/ai/stage19-transport.js",
                     "src/modules/ai/stage19-protocol.js",
                     "src/modules/ai/stage19-prompts.js",
                     "src/modules/core/stage19-config.js",
                     "src/modules/documents/stage21-draft.js",
                     "src/modules/documents/stage21-db.js",
                     "src/modules/documents/stage21-review-state.js",
                     "src/modules/excel/stage20-export.js"):
            self.assertIn(path,paths)
            contents=(ROOT/path).read_text(encoding="utf-8")
            self.assertIn(contents,self.baseline)
            self.assertIn(contents,self.html)
        self.assertEqual(len(paths),43)
        self.assertEqual(self.html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(self.html.count("async function aiAsk("),1)
        self.assertEqual(self.html.count("async function generateTwiPlan("),1)
        self.assertIn("const DRAFT_VERSION=4;",self.html)
        self.assertIn("const DOC_DB_NAME=",self.html)

    def test_all_mutating_ai_tasks_have_guards(self):
        for path,capture,decision in (
            ("src/modules/ai/stage22-generate-sop.js","aiGuardCapture()","aiGuardCanApply(guard)"),
            ("src/modules/ai/stage22-field-editor.js","aiGuardCapture()","aiGuardCanApply(guard)"),
            ("src/modules/ai/stage22-review-task.js","aiGuardCapture({review:true})","aiGuardCanApply(guard)"),
            ("src/modules/ai/stage22-dispute.js","aiGuardCapture({review:true})","aiGuardMatches(guard)"),
            ("src/modules/twi/stage22-from-sop.js","aiGuardCapture({twi:true})","aiGuardCanApply(guard)"),
            ("src/modules/frv/stage22-study-ai.js","aiGuardCapture({frv:true})","aiGuardCanApply(guard)")
        ):
            body=(ROOT/path).read_text(encoding="utf-8")
            self.assertIn(capture,body)
            self.assertIn(decision,body)
        ai=(ROOT/"src/modules/frv/stage22-study-ai.js").read_text(encoding="utf-8")
        self.assertEqual(ai.count("aiGuardCapture({frv:true})"),3)
        self.assertEqual(ai.count("aiGuardCanApply(guard)"),3)

    def test_context_guard_via_node(self):
        guard=(ROOT/"src/modules/ai/stage22-context-guard.js").read_text(encoding="utf-8")
        script=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const fields={'meta-description':{value:'Этап технологического процесса'},
              'meta-operation':{value:'Проверка ограждения'},
              'twi-purpose':{value:'Обучение'}};
const notices=[];
const step={id:1,action:'Проверить ограждение',keyMoments:['Осмотреть замок'],
  reason:'Исключить доступ',durationSeconds:30,successCriteria:'Закрыто',
  photoAnnotations:[],hasPhoto:false,imageData:null,imageBuffer:null,frv:{}};
const state={documentManager:{currentId:'doc-A',status:'Черновик',version:1},
  meta:{operation:'Проверка ограждения'},description:'Этап технологического процесса',
  steps:[step],openQuestions:[],safetyIconIds:[],
  twi:{enabled:true,prepare:{purpose:'Обучение'}},
  frvStudy:{studyId:'frv-A',cycles:[{observations:[{id:'obs-1',actionRaw:'Осмотреть'}]}]}};
const context=vm.createContext({state,reviewIssues:[{description:'Проверить'}],
  document:{getElementById:id=>fields[id]??null},
  captureSopReviewState:()=>({issues:context.reviewIssues.map(x=>({...x}))}),
  toast:(text)=>notices.push(text)});
vm.runInContext(SRC,context);
let token=context.aiGuardCapture();
assert.equal(context.aiGuardMatches(token),true);
step.action='Изменено пользователем';
assert.equal(context.aiGuardMatches(token),false);
step.action='Проверить ограждение';
token=context.aiGuardCapture();
step.imageData='data:image/jpeg;base64,/9j/';
assert.equal(context.aiGuardMatches(token),false);
step.imageData=null;
token=context.aiGuardCapture();
state.documentManager.currentId='doc-B';
assert.equal(context.aiGuardMatches(token),false);
state.documentManager.currentId='doc-A';
token=context.aiGuardCapture();
fields['meta-description'].value='Изменено без stateChanged';
assert.equal(context.aiGuardMatches(token),false);
fields['meta-description'].value='Этап технологического процесса';
token=context.aiGuardCapture({twi:true});
state.twi.prepare.purpose='Правка наставника';
assert.equal(context.aiGuardMatches(token),false);
state.twi.prepare.purpose='Обучение';
token=context.aiGuardCapture({frv:true});
state.frvStudy.cycles[0].observations[0].actionRaw='Изменено измерение';
assert.equal(context.aiGuardMatches(token),false);
state.frvStudy.cycles[0].observations[0].actionRaw='Осмотреть';
token=context.aiGuardCapture({review:true});
context.reviewIssues[0].description='Решение пользователя';
assert.equal(context.aiGuardMatches(token),false);
context.reviewIssues[0].description='Проверить';
token=context.aiGuardCapture();
assert.equal(context.aiGuardCanApply(token),true);
state.steps=[{...step}];
assert.equal(context.aiGuardCanApply(token),false);
assert.equal(notices.length,1);
console.log('PASS: AI guard rejects stale document, form, media, FRV, review, TWI and step data');
"""
        js="const SRC="+json.dumps(guard,ensure_ascii=False)+";\n"+script
        r=subprocess.run(["node","-e",js],capture_output=True,text=True)
        self.assertEqual(r.returncode,0,r.stdout+"\n"+r.stderr)

if __name__=="__main__":
    unittest.main()
