"""Stage26 contracts: AI transport/fallback, FRV advisory edits, review warnings, offline build."""
from __future__ import annotations
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("stage26_builder",ROOT/"tools/build_stage26.py")
stage26=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage26)

def node_case(sources:str,harness:str) -> None:
    p=subprocess.run(["node","-e",sources+"\n"+harness],text=True,capture_output=True)
    if p.returncode:
        raise AssertionError(p.stdout+"\n"+p.stderr)

class Stage26Contracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=stage26.build()
        cls.reference=stage26.BASELINE.read_text(encoding="utf-8")
        cls.manifest=json.loads(stage26.MANIFEST.read_text(encoding="utf-8"))

    def test_release_reproduces_from_modules(self):
        self.assertEqual(self.html,stage26.OUT.read_text(encoding="utf-8"))
        stage26.verify_static()
        self.assertEqual(len(self.manifest["modules"]),50)
        self.assertEqual(len(set(self.manifest["modules"])),50)
        for name in ("async function aiAsk(","async function frvStudyAnalyze(",
                     "async function frvStudySuggestRow(","function runDeterministicChecks(",
                     "function frvAiRowDialog(","function aiFrvAppendPreview("):
            self.assertEqual(self.html.count(name),1,name)
        self.assertEqual(self.html.count("<script>\n'use strict';"),1)

    def test_unrelated_modules_and_proxy_configuration_are_unchanged(self):
        for path in (
            "src/modules/ai/stage19-prompts.js",
            "src/modules/core/stage19-config.js",
            "src/modules/ai/stage24-task-response.js",
            "src/modules/ai/stage25-preview.js",
            "src/modules/ai/stage25-generate-sop.js",
            "src/modules/twi/stage24-from-sop.js",
            "src/modules/twi/stage24-merge.js",
            "src/modules/frv/stage19-study-model.js",
            "src/modules/documents/stage21-draft.js",
            "src/modules/documents/stage19-network-sync.js",
            "src/modules/excel/stage20-export.js",
            "src/modules/photos/stage20-photo-read.js"
        ):
            self.assertIn(path,self.manifest["modules"])
            content=(ROOT/path).read_text(encoding="utf-8")
            self.assertIn(content,self.reference)
            self.assertIn(content,self.html)
        self.assertEqual(self.html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(self.html.count("const AI_TIMEOUT_MS="),1)

    def test_transport_no_fallback_on_limits_or_generic_http(self):
        source=[
            (ROOT/"src/modules/ai/stage26-errors.js").read_text(encoding="utf-8"),
            (ROOT/"src/modules/ai/stage26-transport.js").read_text(encoding="utf-8")
        ]
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const requestLog=[],toasts=[];
const mock={
  console,AbortController,setTimeout,clearTimeout,
  YANDEX_MODELS:[{id:'custom'},{id:'default'}],
  AI_DEFAULT_MODEL:'default',currentModel:'custom',
  AI_TIMEOUT_MS:22,AI_PROXY_BASE:'https://proxy.example/working',
  $:()=>null,toast:(m)=>toasts.push(m),
  fetch:null
};
const ctx=vm.createContext(mock);
vm.runInContext(CODES.join('\n'),ctx);
const response=(status,body,header=null)=>({
  ok:status>=200&&status<300,status,
  headers:{get:()=>header},
  text:async()=>body
});
const msg=content=>JSON.stringify({choices:[{message:{content}}]});
async function run(handlers){
  requestLog.length=0;
  let i=0;
  mock.fetch=async(uri,options)=>{
    assert.equal(uri,'https://proxy.example/working');
    requestLog.push(JSON.parse(options.body));
    return await handlers[Math.min(i++,handlers.length-1)](options);
  };
  return ctx.aiAsk('PROMPT','USER',{
    model:'custom',task:'review',temperature:.7,maxTokens:321
  });
}
async function rejected(status,body,kind){
  await assert.rejects(()=>run([()=>response(status,body)]),e=>e.status===status);
  assert.equal(requestLog.length,1,'fallback on '+status);
  assert.equal(ctx.aiErrorClassify(
    Object.assign(new Error(status+' '+body),{status})).kind,kind);
}
(async()=>{
  let x=await run([()=>response(200,msg('OK'))]);
  assert.equal(x,'OK');
  assert.equal(requestLog.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(requestLog[0])),{
    model:'custom',
    messages:[{role:'system',content:'PROMPT'},{role:'user',content:'USER'}],
    temperature:.7,max_tokens:321,task:'review'
  });
  await rejected(401,'invalid token','access');
  await rejected(403,'model unavailable but forbidden','access');
  await rejected(404,'Cloud Function route not found','not_found');
  await rejected(429,'quota exceeded','rate_limit');
  await rejected(503,'model temporarily unavailable','server');
  await rejected(502,'bad gateway','server');
  await rejected(400,'bad request','http');
  x=await run([
    ()=>response(400,'model custom is unavailable'),
    ()=>response(200,msg('DEFAULT'))
  ]);
  assert.equal(x,'DEFAULT');
  assert.equal(requestLog.length,2);
  assert.equal(requestLog[1].model,'default');
  await assert.rejects(
    ()=>run([()=>response(200,'<html>maintenance</html>')]),
    e=>e.code==='AI_PROXY_INVALID_JSON');
  assert.equal(ctx.aiErrorClassify(Object.assign(new Error('format'),
    {code:'AI_PROXY_INVALID_JSON'})).kind,'proxy_json');
  await assert.rejects(
    ()=>run([()=>response(200,JSON.stringify({choices:[]}))]),
    e=>e.code==='AI_EMPTY_RESPONSE');
  await assert.rejects(
    ()=>run([()=>response(200,'',String(3000000))]),
    e=>e.code==='AI_RESPONSE_TOO_LARGE');
  mock.fetch=async()=>{throw new TypeError('Failed to fetch')};
  await assert.rejects(()=>ctx.aiAsk('A','B'),TypeError);
  assert.equal(ctx.aiErrorClassify(new TypeError('Failed to fetch')).kind,'network');
  requestLog.length=0;
  mock.fetch=async(uri,opt)=>({
    status:200,ok:true,headers:{get:()=>null},
    text:()=>new Promise((resolve,reject)=>{
      opt.signal.addEventListener('abort',()=>{
        const e=new Error('The operation was aborted');e.name='AbortError';reject(e);
      },{once:true});
    })
  });
  await assert.rejects(()=>ctx.aiAsk('A','B'),e=>e.name==='AbortError');
  assert.equal(ctx.aiErrorClassify(
    Object.assign(new Error('aborted'),{name:'AbortError'})).kind,'timeout');
  console.log('PASS Stage26 HTTP, model-selective fallback, JSON, body timeout and errors');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
        node_case("const CODES="+json.dumps(source,ensure_ascii=False)+";\n",harness)

    def test_frv_row_and_analysis_never_change_measured_facts(self):
        source=(ROOT/"src/modules/frv/stage26-proposals.js").read_text(encoding="utf-8")
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const ctx=vm.createContext({
  console,
  FRV_VALUE_TYPES:['VA','NVA_Necessary','NVA_Waste','WAIT','BREAK','OTHER'],
  FRV_ACTIVITY_MODES:['Manual','Auto','Walk','Wait','Setup','Other'],
  FRV_LOSSES:['waiting','search_tool'],
  aiTaskSchemaError:(task,kind)=>Object.assign(new Error(task),{code:kind}),
  escapeHtml:s=>String(s)
});
vm.runInContext(SRC,ctx);
const raw={
  id:'obs1',actionRaw:'Исходная запись инженера',durationSec:43,
  evidenceId:'photo-1',comment:'Замер при испытании',
  actionNormalized:'Ручной осмотр',reason:'Ручное объяснение',
  valueType:'OTHER',activityMode:'Manual',keyMoment:'',
  qualityKey:'',safetyKey:'',standardCandidate:false
};
const p=ctx.frvAiRowProposal({
  actionNormalized:'Визуально проверить защиту',
  valueType:'VA',activityMode:'Walk',reason:'Новое обоснование',
  qualityKey:'Проверить поверхность',standardCandidate:true,
  actionRaw:'Подменить наблюдателя',durationSec:999,evidenceId:'fake',
  lossCode:'nonsense'
});
assert.equal(Object.prototype.hasOwnProperty.call(p,'durationSec'),false);
assert.equal(Object.prototype.hasOwnProperty.call(p,'actionRaw'),false);
assert.equal(Object.prototype.hasOwnProperty.call(p,'lossCode'),false);
assert.ok(ctx.frvAiRowChanges(raw,p).length>=3);
let copy={...raw};
let n=ctx.frvAiApplyRow(copy,p,'fill');
assert.ok(n>=3);
assert.equal(copy.actionNormalized,raw.actionNormalized);
assert.equal(copy.reason,raw.reason);
assert.equal(copy.qualityKey,'Проверить поверхность');
assert.equal(copy.valueType,'VA');
assert.equal(copy.actionRaw,raw.actionRaw);
assert.equal(copy.durationSec,43);
assert.equal(copy.evidenceId,raw.evidenceId);
n=ctx.frvAiApplyRow(copy,{...p,actionRaw:'X',durationSec:1000},'replace');
assert.ok(n>=2);
assert.equal(copy.actionNormalized,'Визуально проверить защиту');
assert.equal(copy.reason,'Новое обоснование');
assert.equal(copy.actionRaw,raw.actionRaw);
assert.equal(copy.durationSec,43);
assert.equal(copy.evidenceId,raw.evidenceId);
assert.throws(()=>ctx.frvAiRowProposal({actionNormalized:'null'}));
const analysis=ctx.frvAiNormalizeAnalysis({
  summary:'Анализ завершён',
  standardCandidates:[
    {observationId:'obs1',action:'Точная операция',keyMoment:'Проверить фиксацию',
      reason:'Новое пояснение',standardTimeSec:600,tool:'Ключ'},
    {observationId:'nonexistent',action:'Вымышленный шаг'}
  ],
  losses:[{observationId:'obs1',cause:'Ожидание',lossCode:'waiting',
    expectedReductionSec:null},{observationId:'foreign',lossCode:'waiting'}],
  risks:['Нужен повторный замер']
},[raw]);
assert.equal(analysis.standardCandidates.length,1);
assert.equal(analysis.standardCandidates[0].standardTimeSec,null);
assert.equal(analysis.losses.length,1);
const d={cycles:[{observations:[{...raw}]}]};
ctx.frvAiApplyAnalysisRows(d,analysis,'fill');
assert.equal(d.cycles[0].observations[0].actionRaw,raw.actionRaw);
assert.equal(d.cycles[0].observations[0].durationSec,43);
assert.equal(d.cycles[0].observations[0].reason,raw.reason);
assert.equal(d.cycles[0].observations[0].keyMoment,'Проверить фиксацию');
ctx.frvAiApplyAnalysisRows(d,analysis,'replace');
assert.equal(d.cycles[0].observations[0].actionNormalized,'Точная операция');
assert.equal(d.cycles[0].observations[0].tool,'Ключ');
assert.equal(d.cycles[0].observations[0].durationSec,43);
assert.throws(()=>ctx.frvAiNormalizeAnalysis({summary:''},[raw]));
console.log('PASS Stage26 FRV proposals: no facts/time/evidence overwritten');
"""
        node_case("const SRC="+json.dumps(source,ensure_ascii=False)+";\n",harness)

    def test_deterministic_review_respects_optional_km_and_photo(self):
        source=(ROOT/"src/modules/review/stage26-deterministic.js").read_text(encoding="utf-8")
        harness=r"""
const assert=require('node:assert/strict'),vm=require('node:vm');
const state={
  meta:{safety:'Обеспечить безопасный доступ к оборудованию'},
  steps:[{
    action:'Осмотреть ограждение',reason:'',keyMoments:[],
    durationSeconds:55,successCriteria:'Ограждение целое',
    hasPhoto:false,imageData:null,imageBuffer:null,
    photoHint:'',visualMarkers:[]
  }]
};
const ctx=vm.createContext({state,normText:s=>String(s||'').toLowerCase().trim(),console});
vm.runInContext(SRC,ctx);
let issues=ctx.runDeterministicChecks();
assert.equal(issues.filter(x=>x.field==='keyMoments').length,0);
assert.equal(issues.filter(x=>x.field==='photo').length,0);
assert.equal(issues.filter(x=>x.field==='reason').length,0);
assert.equal(issues.filter(x=>x.field==='safety'&&x.severity==='warning').length,0);
state.steps[0].visualMarkers=['Общий план'];
issues=ctx.runDeterministicChecks();
assert.equal(issues.filter(x=>x.field==='photo').length,1);
state.steps[0].imageBuffer=new Uint8Array([1,2,3]);
issues=ctx.runDeterministicChecks();
assert.equal(issues.filter(x=>x.field==='photo').length,0);
state.steps[0].keyMoments=['Не касаться шестерён'];
issues=ctx.runDeterministicChecks();
assert.ok(issues.some(x=>x.field==='reason'&&x.severity==='warning'));
console.log('PASS Stage26 review: no mandatory invented KMs/photo/PPE');
"""
        node_case("const SRC="+json.dumps(source,ensure_ascii=False)+";\n",harness)

if __name__=="__main__":
    unittest.main()
