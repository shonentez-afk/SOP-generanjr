"""Stage28: evidence contracts, selective review, no destructive changes."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage28 as stage28

def node_case(js):
    p=subprocess.run(["node","-e",js],text=True,capture_output=True)
    if p.returncode:
        raise AssertionError(p.stdout+"\n"+p.stderr)

class Stage28Contracts(unittest.TestCase):
    def test_builder_frozen_stage27_and_single_review(self):
        spec=json.loads(stage28.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),55)
        self.assertEqual(len(set(spec["modules"])),55)
        stage28.verify_static()
        html=stage28.build()
        self.assertIn("stage28EvidenceForIssue",html)
        self.assertIn("stage28ReviewChanged",html)
        self.assertIn("stage28ReviewLogic",html)
        self.assertEqual(html.count("async function reviewEntireSOP("),1)
        self.assertEqual(html.count("async function generateSOP()"),1)
        self.assertEqual(html.count("async function generateTwiPlan()"),1)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(html.count("<script>\n'use strict';"),1)
        self.assertNotIn("case 'stage27MentorBtn': stage27ReviewLogic();",html)
        self.assertIn("case 'stage27MentorBtn': stage28ReviewLogic();",html)

    def test_original_stage27_feature_modules_unchanged(self):
        spec=json.loads(stage28.MANIFEST.read_text(encoding="utf-8"))
        for file in ("src/modules/ai/stage27-core.js",
                     "src/modules/ai/stage27-intelligence.js",
                     "src/modules/ai/stage27-analogs-history.js",
                     "src/modules/ai/stage26-transport.js",
                     "src/modules/ai/stage25-generate-sop.js",
                     "src/modules/twi/stage24-from-sop.js",
                     "src/modules/frv/stage26-study-ai.js",
                     "src/modules/excel/stage20-export.js",
                     "src/modules/photos/stage19-illustration-editor.js"):
            self.assertIn(file,spec["modules"])
            self.assertIn((ROOT/file).read_text(encoding="utf-8"),stage28.build())

    def test_storage_baseline_retains_dialogues(self):
        source=(ROOT/"src/modules/documents/stage28-review-state.js").read_text(encoding="utf-8")
        for word in ("reviewMeta:stage28NormalizeMeta","stage28ReviewMeta=stage28NormalizeMeta",
                     "evidenceSource","thread","pendingDraft","deferredIssueKeys"):
            self.assertIn(word,source)

    def test_pure_verified_and_invalid_evidence(self):
        src=(ROOT/"src/modules/review/stage28-core.js").read_text(encoding="utf-8")
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(CODE,ctx);
const steps=[
 {id:41,action:'Осмотреть ограждение',keyMoments:[],
  reason:'Предотвращает контакт с механизмом',successCriteria:'Дверца закрыта',
  visualMarkers:['Снять табличку'],durationSeconds:21},
 {id:42,action:'Закрыть защитный кожух',keyMoments:['Проверить замок'],
  reason:'Для защиты оператора',successCriteria:'Защёлка закрыта',
  visualMarkers:['Снять фото замка'],durationSeconds:50},
 {id:43,action:'Проверить кнопку',keyMoments:[],
  reason:'Проверка отклика',successCriteria:'Индикатор загорелся',
  durationSeconds:33},
 {id:44,action:'Начать операцию',reason:'',keyMoments:[],
  successCriteria:'Запуск выполнен',durationSeconds:23}
];
const meta={safety:'Уточнить требования к безопасности',tools:'Ключ'};
const input={meta,description:'Проверить станок',steps,
  documentManager:{currentId:'r1',status:'Черновик'}};
const ctxSign=ctx.stage28DocumentSignature(input);
const sig=steps.map(ctx.stage28StepSignature);
let first=ctx.stage28CompareSteps(steps,{aiComplete:false},ctxSign);
assert(first.full&&first.changed.length===4);
const baseline={contextSignature:ctxSign,aiComplete:true,stepSignatures:sig};
let unchanged=ctx.stage28CompareSteps(steps,baseline,ctxSign);
assert(!unchanged.full&&unchanged.changed.length===0);
const changed=steps.map(s=>({...s}));
changed[1].action='Закрыть другой кожух';
let selective=ctx.stage28CompareSteps(changed,baseline,ctxSign);
assert(!selective.full);
assert.equal(selective.changed.join(','),'2');
assert.equal(selective.affected.join(','),'1,2,3');
assert(ctx.stage28CompareSteps(changed,baseline,ctxSign+'change').full);
assert(ctx.stage28CompareSteps(changed.slice(1),baseline,ctxSign).full);
let photo=ctx.stage28PhotoGuidance(steps);
assert.equal(photo.length,2);
assert(photo.some(x=>x.stepId===2&&x.message.includes('не обязательна')));
let validated={issues:[
 {stepId:2,field:'action',severity:'improvement',type:'incomplete',
  description:'Проверить положение кожуха',fixValue:'Проверить фиксацию'},
 {stepId:4,field:'action',severity:'safety_gap',type:'contradiction',
  description:'Выдуманное правило об остановке',fixValue:'Удалить шаг'},
 {stepId:1,field:'time',severity:'improvement',type:'unrealistic',
  description:'ИИ предложил заменить измеренное время',fixValue:'00:12'}
]};
const raw={issues:[
 {evidence:{field:'action',quote:'Закрыть защитный кожух'}},
 {evidence:{field:'action',quote:'несуществующий норматив'}},
 {evidence:{field:'action',quote:'Осмотреть ограждение'}}]};
let grounded=ctx.stage28GroundAIReview(validated,raw,steps,meta);
assert.equal(grounded.length,3);
assert.equal(grounded[0].evidenceKind,'observed');
assert.equal(grounded[0].fixValue,'Проверить фиксацию');
assert.equal(grounded[1].severity,'question');
assert.equal(grounded[1].fixValue,null);
assert(grounded[1].evidenceKind!=='observed');
assert.equal(grounded[2].evidenceVerified,true);
assert.equal(grounded[2].fixValue,null);
assert.equal(ctx.stage28TwiStructureChecks(steps).length,0);
const checks=ctx.stage28TwiStructureChecks([{
 id:1,action:'Проверить фиксатор перед запуском',
 keyMoments:['Проверить замок','Проверить замок','Записать','Проверить'],
 reason:'Проверить фиксатор перед запуском',
 successCriteria:'Проверить фиксатор перед запуском'
}]);
assert(checks.some(x=>x.field==='keyMoments'&&x.description.includes('трёх')));
assert(checks.some(x=>x.field==='keyMoments'&&x.description.includes('повторяется')));
assert(checks.some(x=>x.field==='reason'));
assert(checks.some(x=>x.field==='successCriteria'));
assert(checks.every(x=>x.fixValue===null));
let old=[{stepId:4,field:'action',description:'Сохранённый вопрос',
  status:'deferred',thread:[{role:'user',text:'Проверено на месте'}]},
 {stepId:2,field:'action',description:'Старая формулировка',status:'withdrawn'}];
let next=[{stepId:2,field:'reason',description:'Новое замечание',status:'open'}];
let merged=ctx.stage28MergeIssueLists(old,next,[1,2,3],()=>false);
assert.equal(merged.length,2);
assert.equal(merged.find(x=>x.stepId===4).status,'deferred');
assert.equal(merged.find(x=>x.stepId===4).thread.length,1);
assert(!merged.some(x=>x.description==='Старая формулировка'));
const exact=ctx.stage28PreserveIssue(
 {stepId:4,field:'action',description:'Same',status:'withdrawn',
  thread:[{role:'user',text:'Доказано'}]},
 {stepId:4,field:'action',description:'Same',status:'open'},true);
assert.equal(exact.status,'withdrawn');
assert.equal(exact.thread.length,1);
console.log('PASS Stage28 source evidence, delta, photos and conversation retention');
"""
        node_case("const CODE="+json.dumps(src)+";\n"+harness)

if __name__=="__main__":unittest.main()
