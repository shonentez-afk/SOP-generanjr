"""Stage35 FRV UX/data integrity audit: accepted Stage34.1 is protected."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage35 as stage35

REPLACED={
  "src/modules/frv/stage34-study-model.js":"src/modules/frv/stage35-study-model.js",
  "src/modules/frv/stage34-study-ai.js":"src/modules/frv/stage35-study-ai.js",
  "src/modules/frv/stage34-study.js":"src/modules/frv/stage35-study.js",
  "src/modules/frv/stage34-library.js":"src/modules/frv/stage35-library.js",
  "src/modules/frv/stage34-analytics.js":"src/modules/frv/stage35-analytics.js",
}

class Stage35Contracts(unittest.TestCase):
    def test_isolated_accepted_baseline_and_protected_vendor(self):
        stage35.verify_static()
        spec=json.loads(stage35.MANIFEST.read_text(encoding="utf-8"))
        accepted=json.loads((ROOT/"src/app/stage34-parts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),62)
        self.assertEqual(len(set(spec["modules"])),62)
        self.assertEqual(set(accepted["modules"])-set(spec["modules"]),set(REPLACED))
        self.assertEqual(set(spec["modules"])-set(accepted["modules"]),set(REPLACED.values()))
        self.assertEqual(spec["static"]["betweenVendorIcons"],
                         "src/app/stage35-between-vendor-icons.html")
        html=stage35.build()
        for name in ["function frv35RestoreActiveStudy(","function frv35RememberActive(",
                     "function frv35AiEvidenceKey(","function frv35ClassificationCurrent(",
                     "function frvStudySendSop(","function renderFrv(",
                     "async function generateExcel(","async function generateTwiPlan(",
                     'id="frvStudyLibrarySearch"','id="frvStudyShowArchived"']:
            self.assertEqual(html.count(name),1,name)
        self.assertIn("sopExcelPhotoForeground(ws,s._excelPhoto,frame)",html)
        self.assertIn("_ФРВ_ПРОВЕРИТЬ",html)
        # That routing feature flag is an environment/server setting, not
        # required to occur verbatim inside the standalone HTML. Source
        # isolation above protects the existing model/proxy modules.
        self.assertIn("AI_PROXY_BASE",html)

    def test_new_javascript_syntax(self):
        for f in REPLACED.values():
            src=(ROOT/f).read_text(encoding="utf-8")
            r=subprocess.run(["node","--check","-"],input=src,
               text=True,capture_output=True)
            self.assertEqual(r.returncode,0,f+": "+r.stderr)

    def test_stale_ai_suggestions_and_frvs_provenance(self):
        src="\n".join((ROOT/x).read_text(encoding="utf-8") for x in (
          "src/modules/frv/stage35-study-model.js",
          "src/modules/frv/stage35-study-ai.js",
          "src/modules/frv/stage35-analytics.js",
          "src/modules/frv/stage35-study.js"))
        script=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
const scope={state:{frvStudy:null,steps:[]},$:(id)=>null,escapeHtml:String,
  saveDraft:()=>{},saveDraftDebounced:()=>{},frvStudyQueuePersist:()=>{},
  frvStudyHasBackup:()=>false,toast:()=>{},
  localStorage:{getItem:()=>null},
  frvStudyInternalId:d=>(d.libraryId||(d.libraryId='study-35-test')),
  createEmptyStep:()=>({id:42,
    action:'',frv:{},keyMoments:[''],durationSeconds:0})};
vm.createContext(scope);vm.runInContext(SOURCE,scope);
const d=scope.ensureFrvStudy();
const o=d.cycles[0].observations[0];
o.actionRaw='Осмотреть узел';o.durationSec=12.5;o.valueType='OTHER';
const id=o.id;
let evidence=scope.frv35AiEvidenceKey(o);
let x={observationId:id,valueType:'VA',action:o.actionRaw,
  sourceEvidenceKey:evidence,confidence:'medium'};
assert(scope.frv35ClassificationCurrent(d,x));
o.durationSec=13;
assert.equal(scope.frv35ClassificationCurrent(d,x),false,
 'A change in actual seconds makes the AI proposal stale');
o.durationSec=12.5;o.actionRaw='Другой узел';
assert.equal(scope.frv35ClassificationCurrent(d,x),false,
 'A change in source action makes the AI proposal stale');
o.actionRaw='Осмотреть узел';o.comment='Новый комментарий';
assert.equal(scope.frv35ClassificationCurrent(d,x),false,
 'A change in engineering context makes the AI proposal stale');
o.comment='';assert(scope.frv35ClassificationCurrent(d,x));
const transfer=scope.frvStudySourceStep({
 action:'Осмотреть узел',plannedTimeSec:11.2,observedTimeSec:12.5,
 sourceObservationId:id,sourceObservationIds:[id],sourceCycleNo:1,
 sourceCycleNos:[1],valueType:'VA',keyMoment:'Проверить корпус',
 evidenceId:'e-1'},d);
assert.equal(transfer.durationSeconds,11);
assert.equal(transfer.frvSource.observedTimeSec,12.5);
assert.equal(transfer.frvSource.observationIds[0],id);
assert.ok(transfer.frvSource.libraryId);
assert.equal(o.durationSec,12.5);
console.log('PASS Stage35: stale AI blocked, factual seconds unchanged, independent source library ID');
"""
        result=subprocess.run(["node","-"],input="const SOURCE="+json.dumps(src)+";\n"+script,
          capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
