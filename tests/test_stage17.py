"""Regression tests for malformed AI mentor JSON and non-destructive handling."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("build_stage17",ROOT/"tools/build_stage17.py")
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

class Stage17MentorTests(unittest.TestCase):
    def test_reproducible_release(self):
        self.assertEqual(build.build(),build.OUT.read_text(encoding="utf-8"))
    def test_ai_config_and_other_modules_unchanged(self):
        base=build.BASE.read_text(encoding="utf-8")
        new=build.OUT.read_text(encoding="utf-8")
        at=base.index(build.START)
        end=base.index(build.END,at)
        self.assertEqual(base[:at],new[:at])
        self.assertEqual(base[end:],new[new.index(build.END,at):])
    def test_parser_and_retry_in_node(self):
        module=build.PATCH.read_text(encoding="utf-8")
        parser=module.split("async function sendDispute(idx){",1)[0]
        # Minimal same-contract helpers, executed under actual Node JS semantics.
        harness=r"""
const assert=require('assert');
function extractJson(s){const i=String(s).indexOf('{');if(i<0)return String(s);return String(s).slice(i);}
function validateDisputeResponse(x){return {reply:String(x.reply||'').trim().slice(0,1200),verdict:x.verdict==='withdraw'?'withdraw':'keep',new_fix:x.new_fix==null?null:String(x.new_fix).trim()||null};}
let calls=0;
let outputs=[];
async function aiAsk(){calls++;const response=outputs.shift();if(response instanceof Error)throw response;return response;}
const AI_SYS={dispute:'UNCHANGED'};
const currentModel='test';
function setAIStatus(){}
(async()=>{
assert.equal(mentorParseDisputeResponse('{"reply":"Обоснование принято.","verdict":"withdraw","new_fix":null}').verdict,'withdraw');
assert.equal(mentorParseDisputeResponse('Текстовое пояснение, которое модель прислала вместо структурированного ответа наставника.').verdict,'keep');
for(const bad of ['0.','{"reply":','{}','[1,2]','', '{"reply":"","verdict":"withdraw"}']){
  assert.throws(()=>mentorParseDisputeResponse(bad));
}
outputs=['0.','{"reply":"Проверил аргумент.","verdict":"withdraw","new_fix":null}'];
calls=0;
const ok=await mentorRequestDisputeResponse('{}');
assert.equal(calls,2);assert.equal(ok.verdict,'withdraw');
outputs=['0.','0.'];calls=0;
await assert.rejects(()=>mentorRequestDisputeResponse('{}'),e=>e.code==='MENTOR_RESPONSE_FORMAT');
assert.equal(calls,2);
outputs=[new Error('429 Too Many Requests')];calls=0;
await assert.rejects(()=>mentorRequestDisputeResponse('{}'),/429/);assert.equal(calls,1);
console.log('PASS: valid, prose, incomplete JSON, retry and unchanged transport behavior');
})().catch(e=>{console.error(e);process.exit(1)});
"""
        proc=subprocess.run(["node","-e",parser+"\n"+harness],capture_output=True,text=True)
        self.assertEqual(proc.returncode,0,proc.stdout+"\n"+proc.stderr)

if __name__=="__main__":
    unittest.main()
