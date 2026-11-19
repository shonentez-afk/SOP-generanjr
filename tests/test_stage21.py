"""Stage21 A2: review history is owned by document snapshots and drafts."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("stage21_builder",ROOT/"tools/build_stage21.py")
stage21=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage21)

class Stage21ReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage21.build()
        cls.original=stage21.BASELINE.read_text(encoding="utf-8")

    def test_release_exact_and_shell_unchanged(self):
        self.assertEqual(self.html,stage21.OUT.read_text(encoding="utf-8"))
        stage21.verify_static()
        self.assertNotEqual(self.html,self.original)
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)

    def test_ai_proxy_prompts_and_twi_are_unchanged(self):
        original=self.original
        newer=self.html
        start="const AI_PROXY_BASE="
        end="// 2. Generic helpers"
        self.assertEqual(original.split(start,1)[1].split(end,1)[0],
                         newer.split(start,1)[1].split(end,1)[0])
        manifest=json.loads((ROOT/"src/app/stage21-parts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["modules"]),42)
        for path in ("src/modules/ai/stage19-transport.js",
                     "src/modules/ai/stage19-prompts.js",
                     "src/modules/twi/stage19-from-sop.js",
                     "src/modules/excel/stage20-export.js"):
            self.assertIn(path,manifest["modules"])

    def test_review_state_unit_roundtrips_via_node(self):
        helper=(ROOT/"src/modules/documents/stage21-review-state.js").read_text(encoding="utf-8")
        draft=(ROOT/"src/modules/documents/stage21-draft.js").read_text(encoding="utf-8")
        db=(ROOT/"src/modules/documents/stage21-db.js").read_text(encoding="utf-8").removesuffix("async ")
        library=(ROOT/"src/modules/documents/stage21-library.js").read_text(encoding="utf-8")
        files=[helper,draft,db,library]
        harness=r"""
const assert=require('node:assert/strict');
const vm=require('node:vm');
const c=vm.createContext({
  console,DRAFT_VERSION:4,
  state:{
    meta:{operation:'Учебная операция'},description:'',openQuestions:[],
    totalTimeSeconds:30,responsibles:[''],agreedList:[{post:'',name:''}],
    safetyIconIds:[],frvMeta:{},frvStudy:null,checklist:[],twi:{enabled:false},
    documentManager:{currentId:'doc-A'},steps:[{
      id:1,action:'Установить ограждение',keyMoments:['Замок'],reason:'Защита',
      durationSeconds:30,successCriteria:'Закрыто',decisionPoints:[],
      commonPitfalls:[],visualMarkers:[],photoHint:'',hasPhoto:false,
      photoAnnotations:[],frv:{}
    }]
  },
  reviewIssues:[{
    severity:'warning',type:'incomplete',stepId:1,field:'reason',
    description:'Уточнить причину',why:'Почему',suggestion:'Проверить',
    fixValue:'Уточнено',status:'withdrawn',pending:false,
    thread:[{role:'user',text:'Возражение'},{role:'mentor',text:'Согласен'}]
  }],
  reviewSummary:{summary:'Проверка',overall_quality:'good'},
  deferredIssueKeys:new Set(['1|reason|ограждение|причина']),
  showDeferredReviewIssues:true,
  sanitizeIllustrationAnnotations:v=>v||[],
  htmlFieldToState:()=>{},normalizeStepShape:s=>s,
  stateToHtml:()=>{}, $:()=>null,
  stepIdCounter:0
});
vm.runInContext(SOURCES.join('\n'),c);
const captured=c.captureSopReviewState();
assert.equal(captured.schemaVersion,1);
assert.equal(captured.issues[0].thread[1].text,'Согласен');
assert.equal(captured.issues[0].pending,undefined);
assert.equal(captured.deferredIssueKeys.length,1);
captured.issues[0].thread[0].text='CHANGED IN CAPTURE';
assert.equal(c.reviewIssues[0].thread[0].text,'Возражение');
const draft=c.collectDraft();
const librarySnapshot=c.docSnapshot();
assert.equal(draft.reviewState.issues[0].status,'withdrawn');
assert.equal(librarySnapshot.reviewState.issues[0].thread[1].text,'Согласен');
c.reviewIssues=[];c.reviewSummary=null;c.deferredIssueKeys=new Set();
c.restoreSopReviewState(draft);
assert.equal(c.reviewIssues[0].thread[0].text,'Возражение');
assert.equal(c.reviewIssues[0].status,'withdrawn');
assert.equal(c.reviewIssues[0].pending,undefined);
assert.equal(c.showDeferredReviewIssues,false);
c.reviewIssues[0].thread[0].text='MUTATED AFTER RESTORE';
assert.equal(draft.reviewState.issues[0].thread[0].text,'Возражение');
c.restoreSopReviewState({deferredIssueKeys:['legacy']});
assert.equal(c.reviewIssues.length,0);
assert.equal(c.deferredIssueKeys.has('legacy'),true);
c.docLoadToState({id:'doc-A',status:'Черновик',version:1,snapshot:librarySnapshot});
assert.equal(c.reviewIssues[0].thread[1].text,'Согласен');
c.docLoadToState({id:'doc-B',status:'Черновик',version:1,snapshot:{steps:[]}});
assert.equal(c.reviewIssues.length,0);
assert.equal(c.reviewSummary,null);
assert.equal(c.deferredIssueKeys.size,0);
console.log('PASS review capture, draft, versioned library, legacy, isolation');
"""
        # JSON strings ensure valid JS source quoting independent of Russian text.
        js="const SOURCES="+json.dumps(files,ensure_ascii=False)+";\n"+harness
        result=subprocess.run(["node","-e",js],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
