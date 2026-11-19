"""Stage29 SOP+TWI quality: no unsupported facts, safe preview, source-derived training."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage29 as stage29

def node_case(js):
    p=subprocess.run(["node","-e",js],text=True,capture_output=True)
    if p.returncode:
        raise AssertionError(p.stdout+"\n"+p.stderr)

class Stage29Quality(unittest.TestCase):
    def test_unchanged_stage28_and_standalone(self):
        stage29.verify_static()
        spec=json.loads(stage29.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),57)
        self.assertEqual(len(set(spec["modules"])),57)
        html=stage29.build()
        for needle in ["function stage29SopNormalize","function stage29TwiNormalize",
                       "const STAGE29_TWI_PROMPT=","const STAGE29_SOP_PROMPT=",
                       "stage29TwiNormalize(aiReadTwiPlan(raw),src,",
                       "stage29SopNormalize(validateGeneratedSop"]:
            self.assertIn(needle,html)
        self.assertEqual(html.count("async function generateSOP()"),1)
        self.assertEqual(html.count("async function generateTwiPlan()"),1)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(html.count("<script>\n'use strict';"),1)
        self.assertIn("src/modules/frv/stage26-study-ai.js",spec["modules"])
        self.assertNotIn("src/modules/ai/stage25-generate-sop.js",spec["modules"])
        self.assertNotIn("src/modules/twi/stage24-from-sop.js",spec["modules"])

    def test_existing_stage28_and_infrastructure_untouched(self):
        spec=json.loads(stage29.MANIFEST.read_text(encoding="utf-8"))
        for file in ("src/modules/review/stage28-core.js",
                     "src/modules/review/stage28-render.js",
                     "src/modules/ai/stage28-review-task.js",
                     "src/modules/app/stage28-ui.js",
                     "src/modules/ai/stage27-core.js",
                     "src/modules/ai/stage27-intelligence.js",
                     "src/modules/ai/stage26-transport.js",
                     "src/modules/frv/stage26-study-ai.js",
                     "src/modules/excel/stage20-export.js",
                     "src/modules/photos/stage19-illustration-editor.js",
                     "src/modules/core/stage19-config.js"):
            self.assertIn(file,spec["modules"])
            self.assertIn((ROOT/file).read_text(encoding="utf-8"),stage29.build())

    def test_source_grounding_sop_and_twi(self):
        src=(ROOT/"src/modules/ai/stage29-quality-core.js").read_text(encoding="utf-8")
        harness=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
const q={};vm.createContext(q);vm.runInContext(CODE,q);
const base={
  operation:'Проверка конвейера',department:'',executor:'Оператор',
  workplace:'',tools:'Ключ KF37',material:'',
  safety:'',userDescription:'Осмотреть кожух конвейера, закрыть замок. Проверка 40 секунд.'
};
const valid=()=>({
  steps:[
    {action:'Осмотреть кожух конвейера',keyMoments:['Осмотреть замок','Осмотреть замок'],
      reason:'Не допустить повреждения',time:'00:40',success_criteria:'Кожух цел',
      decision_points:[],common_pitfalls:[],visual_markers:[]},
    {action:'Закрыть замок',keyMoments:[],reason:'',time:null,
      success_criteria:'Замок закрыт',decision_points:[],common_pitfalls:[],
      visual_markers:['null']}
  ],openQuestions:[]
});
let a=q.stage29SopNormalize(valid(),base);
assert.equal(a.sop.steps[0].time,'00:40');
assert.equal(a.sop.steps[0].keyMoments.length,1);
assert.equal(a.sop.steps[1].visual_markers.length,0);
assert.equal(a.sop.openQuestions.length,0);
const noTime={...base,userDescription:'Осмотреть кожух конвейера, закрыть замок'};
let t=q.stage29SopNormalize(valid(),noTime);
assert.equal(t.sop.steps[0].time,null);
assert(t.sop.openQuestions.some(x=>x.includes('длительность шага 1')));
let numbered=valid();
numbered.steps[0].keyMoments=['Давление 500 бар'];
assert.throws(()=>q.stage29SopNormalize(numbered,base),/неподтвержд|неполную/i);
let model=valid();model.steps[0].action='Проверить вал KF37';
assert.doesNotThrow(()=>q.stage29SopNormalize(model,{...base,
 userDescription:'Проверить вал KF37, закрыть замок. Время проверки 40 секунд.'}));
const source={
 operation:'Проверка конвейера',safety:'Не запускать до закрытия кожуха',
 steps:[
 {stepNumber:1,action:'Осмотреть кожух',keyPoints:['Проверить целостность'],
   reason:'Не допустить повреждения',successCriteria:'Кожух цел',
   decisionPoints:[]},
 {stepNumber:2,action:'Закрыть замок',keyPoints:[],
   reason:'',successCriteria:'Замок закрыт',decisionPoints:[]}
 ]
};
const plan=()=>({
 prepare:{purpose:'Проверка конвейера',known:'',prep:'Подготовить рабочее место',interest:''},
 present:{round1:'Объяснить принцип',round2:'Внимательно работать',round3:'Соблюдать качество'},
 tryOut:{perform:'Повторить',explain:'Назвать детали',check:'Проверить',correct:'Подсказать'},
 followUp:{help:'Наставник',control:'Проверять первые самостоятельные выполнения',
   observe:'Наблюдать',close:'Завершить'}
});
let good=q.stage29TwiNormalize(plan(),source);
assert(good.plan.present.round1.includes('1. Осмотреть кожух'));
assert(good.plan.present.round1.includes('2. Закрыть замок'));
assert(good.plan.present.round2.includes('Проверить целостность'));
assert(!good.plan.present.round2.includes('Внимательно работать'));
assert(good.plan.present.round3.includes('Не допустить повреждения'));
assert(good.plan.tryOut.check.includes('Замок закрыт'));
assert.equal(good.quality.steps,2);
const ungrounded=plan();ungrounded.followUp.control='Проверять каждую смену';
let safe=q.stage29TwiNormalize(ungrounded,source).plan;
assert(!safe.followUp.control.includes('каждую смену'));
const repeat=q.stage29TwiNormalize({...plan(),present:{round1:'Показ',
 round2:'Уточнённые Key Points',round3:'Объяснить'}},source,{repeat:true});
assert.equal(repeat.plan.present.round2,'Уточнённые Key Points');
const bad=plan();bad.followUp.control='Проверять через 3 дня';
assert.throws(()=>q.stage29TwiNormalize(bad,source),/неподтвержд|неполную/i);
const blankKP={...source,steps:[{...source.steps[0],keyPoints:[],reason:''}]};
let b=q.stage29TwiNormalize(plan(),blankKP);
assert(b.plan.present.round2.includes('не выделены'));
assert(b.plan.present.round3.includes('не указаны'));
assert.equal(q.stage29HasUnconfirmedNumber('Шаг 2','Шаг 1',4).length,0);
assert(q.stage29HasUnconfirmedNumber('через 3 дня','Шаг 1',4).includes('3'));
console.log('PASS Stage29: explicit time, unknown time, numeric facts, key points and TWI');
"""
        node_case("const CODE="+json.dumps(src)+";\n"+harness)

if __name__=="__main__":
    unittest.main()
