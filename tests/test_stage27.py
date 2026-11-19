"""Stage27: deterministic contracts, preservation of Stage26, source-level persistence."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage27 as stage27

def node_case(js):
    p=subprocess.run(["node","-e",js],text=True,capture_output=True)
    if p.returncode:
        raise AssertionError(p.stdout+"\n"+p.stderr)

class Stage27Contracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec=json.loads(stage27.MANIFEST.read_text(encoding="utf-8"))

    def test_standalone_54_modules_and_baseline_untouched(self):
        self.assertEqual(len(self.spec["modules"]),54)
        self.assertEqual(len(set(self.spec["modules"])),54)
        stage27.verify_static()
        html=stage27.build()
        self.assertIn('id=\'stage27AssistantPanel\'',html)
        self.assertIn("function stage27ParseProposals",html)
        self.assertIn("function stage27DiffSnapshots",html)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(html.count("async function generateSOP()"),1)
        self.assertEqual(html.count("async function generateTwiPlan()"),1)
        self.assertEqual(html.count("<script>\n'use strict';"),1)

    def test_existing_source_paths_unchanged(self):
        self.assertEqual(stage27.BASELINE.read_text(encoding="utf-8").count(
            "https://functions.yandexcloud.net/d4ehdpoue3sve6s0f92b"),1)
        for name in ("src/modules/core/stage19-config.js",
                     "src/modules/ai/stage26-transport.js",
                     "src/modules/ai/stage25-generate-sop.js",
                     "src/modules/twi/stage24-from-sop.js",
                     "src/modules/frv/stage26-study-ai.js",
                     "src/modules/excel/stage20-export.js",
                     "src/modules/photos/stage19-illustration-editor.js"):
            self.assertIn(name,self.spec["modules"])
            self.assertIn((ROOT/name).read_text(encoding="utf-8"),stage27.build())

    def test_persistence_and_no_editor_patch(self):
        for name in ("stage27-db.js","stage27-draft.js","stage27-library.js"):
            content=(ROOT/"src/modules/documents"/name).read_text(encoding="utf-8")
            self.assertIn("stage27",content)
        self.assertIn("stage27ExportState()",(
            ROOT/"src/modules/documents/stage27-db.js").read_text(encoding="utf-8"))
        self.assertIn("stage27Normalize(d.stage27)",(
            ROOT/"src/modules/documents/stage27-draft.js").read_text(encoding="utf-8"))
        self.assertIn("stage27Normalize(s.stage27)",(
            ROOT/"src/modules/documents/stage27-library.js").read_text(encoding="utf-8"))

    def test_pure_contracts_reject_unconfirmed_or_stale_suggestions(self):
        source=(ROOT/"src/modules/ai/stage27-core.js").read_text(encoding="utf-8")
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const scope={
  aiReadTaskObject:(raw)=>JSON.parse(raw),
  aiTaskSchemaError:(t,k,d)=>Object.assign(new Error(d),{code:k}),
  state:{documentManager:{currentId:'x',status:'Черновик'},steps:[]}
};
vm.createContext(scope);vm.runInContext(CODE,scope);
const data=[
  {id:5,action:'Осмотреть ограждение',keyMoments:['Проверить замок'],
    reason:'',successCriteria:'',durationSeconds:43,hasPhoto:true},
  {id:9,action:'Проверить кнопку',keyMoments:[],reason:'',
    successCriteria:'',durationSeconds:12}
];
const q=scope.stage27ParseQuestions(JSON.stringify({questions:[
  {question:'Что оператор делает при нарушении блокировки?',stepId:5,why:'Условие'},
  {question:'Что оператор делает при нарушении блокировки?',stepId:5,why:'Дубль'}
]}),data);
assert.equal(q.length,1);
q[0].answer='Остановка';q[0].confirmed=true;
let out=scope.stage27ParseProposals(JSON.stringify({proposals:[
  {stepId:5,field:'successCriteria',questionId:'Q1',oldValue:'',
    newValue:'Условие подтверждено',why:'Со слов инженера'},
  {stepId:5,field:'durationSeconds',questionId:'Q1',oldValue:'43',
    newValue:'10',why:'Недопустимо'},
  {stepId:5,field:'reason',questionId:'Q9',oldValue:'',
    newValue:'Факт от другого человека'},
  {stepId:9,field:'reason',questionId:'Q1',oldValue:'',
    newValue:'Недостоверно: вопрос о другом шаге'}
]}),data,q);
assert.equal(out.length,1);
assert.equal(out[0].field,'successCriteria');
assert.equal(out[0].stepId,5);
assert.equal(data[0].durationSeconds,43);
const docs=[
  {id:'yes',status:'Опубликован',title:'Осмотр ограждения',
   snapshot:{steps:data,description:'Конвейер',meta:{operation:'Осмотр'}}},
  {id:'no',status:'Черновик',title:'Осмотр ограждения',
   snapshot:{steps:data,description:'Конвейер',meta:{operation:'Осмотр'}}}
];
const matches=scope.stage27RankAnalogs(docs,'осмотр ограждения',null,5);
assert.equal(matches.length,1);assert.equal(matches[0].doc.id,'yes');
const previous={meta:{safety:'СИЗ'},steps:[data[0]]};
const updated={meta:{safety:'Новые условия'},steps:[
  {...data[0],action:'Проверить ограждение',durationSeconds:43},data[1]
]};
const diff=scope.stage27DiffSnapshots(previous,updated);
assert(diff.impacts.includes('twi'));
assert(diff.impacts.includes('photo'));
assert(diff.impacts.includes('safety'));
assert(!diff.impacts.includes('frv'));
const saved=scope.stage27Normalize({
  questions:q,
  suggestions:out,
  mentor:[{id:'M1',stepId:5,description:'Нужно проверить факт'}]
});
assert.equal(saved.questions[0].confirmed,true);
assert.equal(saved.suggestions.length,1);
console.log('PASS Stage27 pure guards: sources, confirmation, analog and version impact');
"""
        node_case("const CODE="+json.dumps(source)+";\n"+harness)

if __name__=="__main__":unittest.main()
