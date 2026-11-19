"""Stage 18 regression: model metadata must not leak into mentor dialogue."""
import importlib.util
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("stage18_builder",ROOT/"tools/build_stage18.py")
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class MentorPresentationTests(unittest.TestCase):
    def test_deterministic_release(self):
        self.assertEqual(builder.build(),builder.OUT.read_text(encoding="utf-8"))

    def test_original_ai_config_and_other_modules_unchanged(self):
        original=builder.BASE.read_text(encoding="utf-8")
        updated=builder.OUT.read_text(encoding="utf-8")
        marker="const AI_PROXY_BASE="
        end="// 2. Generic helpers"
        self.assertEqual(
            original.split(marker,1)[1].split(end,1)[0],
            updated.split(marker,1)[1].split(end,1)[0])
        for needle in ["async function ensureStepImagesForExport()","function isoIconUrl(id)","function extractJson(text)","async function mentorRequestDisputeResponse(ctx)"]:
            self.assertEqual(original.count(needle),updated.count(needle))
        self.assertIn("m.role==='system'?'⚠️ Система'",updated)
        self.assertIn("mentorCleanDisputeReply(m.text)",updated)
        self.assertNotIn(chr(36)+"{escapeHtml(m.text)}",updated)

    def test_actual_js_parser_with_screenshot_shape(self):
        source=builder.PATCH.read_text(encoding="utf-8")
        harness=r"""
const assert=require('assert').strict;
function mentorResponseFormatError(){const e=new Error('bad response');e.code='MENTOR_RESPONSE_FORMAT';return e;}
function extractJson(text){const s=String(text).trim();const i=s.indexOf('{');return i<0?s:s.slice(i);}
function validateDisputeResponse(x){return {reply:String(x.reply||'').trim().slice(0,1200),verdict:x.verdict==='withdraw'?'withdraw':'keep',new_fix:x.new_fix==null?null:String(x.new_fix).trim()||null};}
const raw="1. Замечание было сделано, потому что отсутствует фото. 2. Это может затруднить обучение. 3. Аргумент не доказывает необходимость снятия замечания. 4. Вердикт: keep 5. Новый текст исправления: null";
const want="1. Замечание было сделано, потому что отсутствует фото. 2. Это может затруднить обучение. 3. Аргумент не доказывает необходимость снятия замечания.";
assert.equal(mentorCleanDisputeReply(raw),want);
const prose=mentorParseDisputeResponse(raw);
assert.equal(prose.reply,want);
assert.equal(prose.verdict,'keep');
assert.equal(prose.new_fix,null);
assert.equal(mentorCleanDisputeReply("Ответ наставника.\n4) Verdict: withdraw\n5) new_fix: none"),"Ответ наставника.");
assert.equal(mentorCleanDisputeReply("Для шага лучше сфотографировать рабочую зону и положение инструмента."),"Для шага лучше сфотографировать рабочую зону и положение инструмента.");
const valid=mentorParseDisputeResponse(JSON.stringify({
    reply:"Указанный аргумент принят. 4. Вердикт: keep 5. Новый текст исправления: null",
    verdict:"withdraw",
    new_fix:"Предлагаемый безопасный текст"
}));
assert.equal(valid.reply,"Указанный аргумент принят.");
assert.equal(valid.verdict,'withdraw');
assert.equal(valid.new_fix,"Предлагаемый безопасный текст");
assert.equal(mentorParseDisputeResponse("Полный текстовый ответ наставника с решением: Вердикт: withdraw 5. Новый текст исправления: null").verdict,'keep');
for(const bad of ['0.','{"reply":','{}','[1,2]','', '{"reply":"","verdict":"withdraw"}']){
 assert.throws(()=>mentorParseDisputeResponse(bad));
}
console.log("PASS: stage18 parsed JSON, prose metadata, preserved verdict and errors");
"""
        result=subprocess.run(["node","-e",source+"\n"+harness],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
