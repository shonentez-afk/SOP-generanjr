"""Stage24 tests: typed AI and user-owned TWI fields, not historical migrations."""
from __future__ import annotations
import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("stage24_builder",ROOT/"tools/build_stage24.py")
stage24=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage24)

class Stage24TwiSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage24.build()
        cls.original=stage24.BASELINE.read_text(encoding="utf-8")
        cls.manifest=__import__('json').loads(stage24.MANIFEST.read_text(encoding="utf-8"))

    def test_reproducible_html_and_fixed_shell(self):
        self.assertEqual(self.html,stage24.OUT.read_text(encoding="utf-8"))
        stage24.verify_static()
        self.assertNotEqual(self.html,self.original)
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)
        self.assertEqual(self.html.count("async function generateTwiPlan("),1)
        self.assertEqual(self.html.count("function twiShowPreview("),1)
        self.assertEqual(len(self.manifest["modules"]),47)

    def test_current_twi_form_has_matching_textareas(self):
        html=(ROOT/"src/app/stage24-between-vendor-icons.html").read_text(encoding="utf-8")
        twi=html.split('id="tab-twi"',1)[1].split('id="tab-documents"',1)[0]
        self.assertEqual(twi.count("<textarea"),15)
        self.assertEqual(twi.count("</textarea>"),15)
        for field in ("twi-help","twi-frequency","twi-observe","twi-close"):
            self.assertIn('id="'+field+'"',twi)

    def test_protected_source_code_unchanged(self):
        for path in (
            "src/modules/ai/stage19-transport.js",
            "src/modules/ai/stage19-prompts.js",
            "src/modules/ai/stage23-protocol.js",
            "src/modules/ai/stage22-context-guard.js",
            "src/modules/documents/stage21-draft.js",
            "src/modules/documents/stage21-db.js",
            "src/modules/photos/stage20-photo-read.js",
            "src/modules/excel/stage20-export.js",
            "src/modules/frv/stage22-study-ai.js",
        ):
            self.assertIn(path,self.manifest["modules"])
            module=(ROOT/path).read_text(encoding="utf-8")
            self.assertIn(module,self.original)
            self.assertIn(module,self.html)
        self.assertEqual(self.html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(self.html.count("async function aiAsk("),1)

    def test_typed_ai_tasks_and_twi_manual_merge_using_node(self):
        files=[
            (ROOT/"src/modules/ai/stage23-protocol.js").read_text(encoding="utf-8"),
            (ROOT/"src/modules/ai/stage24-task-response.js").read_text(encoding="utf-8"),
            (ROOT/"src/modules/twi/stage24-merge.js").read_text(encoding="utf-8"),
        ]
        harness=r"""
const v1={
 prepare:{purpose:'Цель: освоить безопасный запуск',known:'Оценить опыт',prep:'Подготовить место',interest:'Показать пользу'},
 present:{round1:'Показать операцию',round2:'Показать ключевые моменты',round3:'Объяснить причины'},
 tryOut:{perform:'Работник повторяет',explain:'Объясняет причины',check:'Проверить последовательность',correct:'Исправить ошибки'},
 followUp:{help:'Наставник рядом',frequency:'Контроль раз в смену',observe:'Наблюдать',close:'Подвести итог'}
};
const ticks=String.fromCharCode(96).repeat(3);
const wrapped='Заметки:\n'+ticks+'json\n'+JSON.stringify(v1)+'\n'+ticks+'\nконец';
const parsed=aiReadTwiPlan(wrapped);
assert.equal(parsed.followUp.control,'Контроль раз в смену');
assert.equal(parsed.prepare.purpose,v1.prepare.purpose);
assert.equal(aiReadTaskObject('{"issues":[]}','review').issues.length,0);
assert.equal(aiReadTaskObject('{"steps":[{"action":"Проверить"}]}','generate_sop').steps.length,1);
for(const input of ['','не JSON','null','[]','{"prepare":','{}']){
  assert.throws(()=>aiReadTwiPlan(input));
}
const partial={...v1,followUp:{}};
assert.throws(()=>aiReadTwiPlan(JSON.stringify(partial)),e=>e.code==='AI_TASK_INCOMPLETE');
const fieldMissing={...v1,tryOut:{check:'null'}};
assert.throws(()=>aiReadTwiPlan(JSON.stringify(fieldMissing)),e=>e.code==='AI_TASK_INCOMPLETE');
assert.equal(twiHasGeneratedContent({trainer:'Мастер'}),false);
const current={enabled:false,trainer:'Мастер Мария',trainee:'Сотрудник Иван'};
const first=twiCommitProposal(current,parsed,new Set(TWI_GENERATED_FIELDS.map(twiFieldId)));
assert.equal(first.prepare.purpose,v1.prepare.purpose);
assert.equal(first.trainer,'Мастер Мария');
assert.equal(first.trainee,'Сотрудник Иван');
assert.equal(first.generatedBaseline.prepare.purpose,v1.prepare.purpose);
assert.equal(twiManualCount(first),0);
const before=twiSourceSignature();
first.prepare.purpose='Ручная формулировка мастера';
first.tryOut.check='Ручной критерий проверки';
assert.equal(twiManualCount(first),2);
const v2=aiReadTwiPlan(JSON.stringify({
 ...v1,
 prepare:{...v1.prepare,purpose:'Новая формулировка',known:'Новые данные об опыте'},
 present:{...v1.present,round2:'Новый порядок ключевых моментов'},
 tryOut:{...v1.tryOut,check:'Новый критерий'},
 followUp:{help:'',observe:'Наблюдать'}
}));
const diff=twiProposalDiff(first,v2);
const find=id=>diff.find(x=>x.id===id);
assert.equal(find('prepare.purpose').manual,true);
assert.equal(find('prepare.purpose').checked,false);
assert.equal(find('tryOut.check').checked,false);
assert.equal(find('prepare.known').checked,true);
assert.equal(find('present.round2').checked,true);
assert.equal(find('followUp.help').clearing,true);
assert.equal(find('followUp.help').checked,false);
const selected=new Set(diff.filter(x=>x.checked).map(x=>x.id));
const merged=twiCommitProposal(first,v2,selected);
assert.equal(merged.prepare.purpose,'Ручная формулировка мастера');
assert.equal(merged.tryOut.check,'Ручной критерий проверки');
assert.equal(merged.prepare.known,'Новые данные об опыте');
assert.equal(merged.present.round2,'Новый порядок ключевых моментов');
assert.equal(merged.followUp.help,'Наставник рядом');
assert.equal(merged.trainer,'Мастер Мария');
assert.equal(merged.trainee,'Сотрудник Иван');
assert.equal(merged.generatedBaseline.prepare.purpose,'Новая формулировка');
assert.ok(twiManualCount(merged)>=2);
const forced=new Set(['prepare.purpose']);
const manualAccepted=twiCommitProposal(merged,v2,forced);
assert.equal(manualAccepted.prepare.purpose,'Новая формулировка');
assert.equal(twiProposalDiff({prepare:{purpose:'Чужая ручная запись'}},v2).find(x=>x.id==='prepare.purpose').checked,false);
state.steps[0].reason='Новый шаг СОП';
assert.notEqual(twiSourceSignature(),before);
console.log('PASS typed JSON, 4 JI stages, manual provenance, selective merge and SOP source review');
"""
        code=("const assert=require('node:assert/strict');\n"
              "const state={meta:{operation:'Проверка'},steps:[{action:'Осмотреть',keyMoments:['Опора'],reason:'Безопасность',decisionPoints:[]} ]};\n"
              "const reviewNormalizeFixValue=v=>typeof v==='string'&&v.trim().toLowerCase()!=='null'?v:null;\n"
              +"\n".join(files)+"\n"+harness)
        proc=subprocess.run(["node","-e",code],text=True,capture_output=True)
        self.assertEqual(proc.returncode,0,proc.stdout+"\n"+proc.stderr)

if __name__=="__main__":
    unittest.main()
