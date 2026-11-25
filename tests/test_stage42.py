"""Stage42: accepted Stage41 is byte-exact, wizard isolated, no proxy changes."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage42

class Stage42Contracts(unittest.TestCase):
    def test_byte_exact_stage41_plus_three_modules(self):
        text=build_stage42.build()
        build_stage42.verify_static(text)
        prior=json.loads(build_stage42.PREVIOUS.read_text(encoding="utf-8"))
        current=json.loads(build_stage42.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(prior["modules"]),73)
        self.assertEqual(len(current["modules"]),76)
        self.assertEqual(len(set(current["modules"])),76)
        self.assertEqual(current["modules"][-5:],
          ["src/modules/ai/stage41-quality.js",
           "src/modules/excel/stage42-parse.js",
           "src/modules/excel/stage42-apply.js",
           "src/modules/excel/stage42-wizard.js",
           "src/modules/app/stage28-ui.js"])
    def test_node_syntax_all_new_modules(self):
        for path in build_stage42.ADDITIONS:
            code=build_stage42.read(path)
            process=subprocess.run(["node","--check","-"],input=code,
                text=True,encoding="utf-8",capture_output=True)
            self.assertEqual(process.returncode,0,path+" "+process.stderr)
    def test_parser_isolation_and_existing_import_kept(self):
        code=build_stage42.read("src/modules/excel/stage42-parse.js")
        self.assertIn("async function stage42ParseFile",code)
        self.assertNotIn("aiAsk(",code)
        for not_allowed in ("state.steps=", "idbPutPhoto(", "docDbPut(",
                            "saveDraft(", "localStorage.", "setVal("):
            self.assertNotIn(not_allowed,code)
        accepted=build_stage42.read("src/modules/excel/stage19-import.js")
        self.assertIn("async function importSopFromXlsx(file)",accepted)
        self.assertIn("await idbPutPhoto(",accepted)
        new=build_stage42.read("src/modules/excel/stage42-apply.js")
        for expected in ("stage42DocumentSignature","stage42CheckProposal",
                         "stage42DuplicateDocuments","idbPutPhoto(","idbGetPhoto(",
                         "idbDeletePhoto(","stateToHtml()","saveDraft()"):
            self.assertIn(expected,new)
    def test_wizard_uses_existing_constructor_fields_and_confirmation(self):
        code=build_stage42.read("src/modules/excel/stage42-wizard.js")
        for expected in ("importSopBtn","stage42Open","stage42UseCell",
                         "stage42RenderGrid","stage42RenderPhotos","stage42ConfirmApply",
                         "stage42ApplyProposal","stage42OmitMedia","Загрузить в Конструктор СОП"):
            self.assertIn(expected,code)
        self.assertIn("event.stopImmediatePropagation()",code)
        self.assertNotIn("aiAsk(",code)
        self.assertNotIn("AI_PROXY_BASE",code)

    def test_all_numbered_key_moments_are_preserved_in_stage42(self):
        parser=build_stage42.read("src/modules/excel/stage42-parse.js")
        wizard=build_stage42.read("src/modules/excel/stage42-wizard.js")
        apply=build_stage42.read("src/modules/excel/stage42-apply.js")
        self.assertIn("function stage42SplitKeyMoments",parser)
        self.assertIn("const moments=stage42SplitKeyMoments(km.text)",parser)
        self.assertNotIn("km.text.split(/\\n+/u)",parser)
        self.assertIn("stage42RenderMomentFields",wizard)
        self.assertIn("data-stage42-moment",wizard)
        self.assertIn("stage42EnableFullKeyMomentLists",wizard)
        self.assertIn("normalizeStepShape=function stage42NormalizeFullKMs",wizard)
        self.assertIn("normalizeExcelStepKeepingPhoto=function stage42ExcelFullKeyMoments",wizard)
        self.assertIn("stage42SplitKeyMoments(cell.text)",wizard)
        self.assertNotIn("filter(Boolean).slice(0,3)",apply)
        self.assertNotIn("kms.length>3",apply)

    def test_sheet_choice_and_main_app_visual_language(self):
        parser=build_stage42.read("src/modules/excel/stage42-parse.js")
        wizard=build_stage42.read("src/modules/excel/stage42-wizard.js")
        for name in ("stage42SheetEvidence","stage42BestSheet",
                     "stage42ParseSelectedSheet","stage42Reader"):
            self.assertIn(name,parser)
        for name in ("stage42ChooseSopSheet","stage42ShowStep",
                     "stage42EmptyGuide","stage42SheetAdvice","stage42EmptyPick",
                     "stage42RescanSheet","stage42-needs-mapping"):
            self.assertIn(name,wizard)
        for token in ("--tn-red","--tn-ink","--tn-bg","Inter,system-ui",
                      "Загрузить в Конструктор СОП","source.match"):
            self.assertIn(token,wizard)
        self.assertIn("stage42Apply').disabled=!p.steps.length",wizard)
        self.assertIn("stage42Reader(ws).text(cell.row,cell.col)",wizard)

if __name__=="__main__":
    unittest.main()
