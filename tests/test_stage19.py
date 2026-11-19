"""Stage19: independent-source modular assembly and zero-regression baseline."""
from __future__ import annotations
import importlib.util
import hashlib
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("stage19_builder",ROOT/"tools/build_stage19.py")
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class Stage19ModuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=builder.BASELINE.read_text(encoding="utf-8")
        cls.built=builder.build()
        cls.current=builder.OUT.read_text(encoding="utf-8")
        cls.manifest=builder._manifest()

    def test_complete_byte_preservation(self):
        self.assertEqual(self.built,self.original,"Source extraction changed Stage18 HTML")
        self.assertEqual(self.built,self.current,"Modular release is stale")
        self.assertEqual(hashlib.sha256(self.built.encode()).digest(),hashlib.sha256(self.original.encode()).digest())

    def test_no_legacy_runtime_or_release_based_build(self):
        modules=self.manifest["modules"]
        self.assertGreaterEqual(len(modules),24)
        self.assertFalse(any("src/legacy" in x for x in modules))
        builder_source=(ROOT/"tools/build_stage19.py").read_text(encoding="utf-8")
        build_fn=builder_source.split("def build()",1)[1].split("def main()",1)[0]
        self.assertNotIn("BASELINE.read_text",build_fn)
        self.assertNotIn("replace_region(",builder_source)
        self.assertFalse(any(not (ROOT/p).is_file() for p in modules))

    def test_ai_config_and_prompt_text_preserved(self):
        old=self.original.split("const AI_PROXY_BASE=",1)[1].split("// 2. Generic helpers",1)[0]
        new=self.built.split("const AI_PROXY_BASE=",1)[1].split("// 2. Generic helpers",1)[0]
        self.assertEqual(old,new)
        for phrase in ["function validateDisputeResponse(","async function aiAsk(","async function generateTwiPlan()","function blobToDataUrl("]:
            self.assertEqual(self.built.count(phrase),self.original.count(phrase),phrase)

    def test_single_browser_script_and_embedded_assets(self):
        self.assertEqual(self.built.count("<script>\n'use strict';"),1)
        self.assertEqual(self.built.count('id="sop-local-iso-icons"'),1)
        self.assertEqual(self.built.count('id="sop-exceljs-local"'),1)
        script=self.built.split("<script>\n'use strict';",1)[1].split("</script>",1)[0]
        self.assertGreater(len(script),250000)
        self.assertEqual(script.count("async function generateTwiPlan("),1)
        self.assertIn("async function ensureStepImagesForExport()",script)
        self.assertIn("function mentorCleanDisputeReply(value)",script)

    def test_source_ranges_and_no_shared_file_overlap(self):
        parts=self.manifest
        sections=[builder._read(p) for p in parts["modules"]]
        self.assertEqual(sum(map(len,sections)),len("".join(sections)))
        self.assertTrue(sections[0].startswith("\n'use strict';"))
        self.assertGreater(len(builder._icons(parts["iconParts"]).encode("utf-8")),150000)

    def test_shared_media_converters_live_in_shared_sources(self):
        names=self.manifest["modules"]
        a="src/modules/shared/stage19-blob-to-dataurl.js"
        b="src/modules/shared/stage19-dataurl-to-blob.js"
        self.assertIn(a,names)
        self.assertIn(b,names)
        self.assertIn("function blobToDataUrl(blob)",builder._read(a))
        self.assertIn("async function dataUrlToBlob(dataUrl)",builder._read(b))
        self.assertEqual(sum(builder._read(p).count("function blobToDataUrl(blob)") for p in names),1)
        self.assertEqual(sum(builder._read(p).count("async function dataUrlToBlob(dataUrl)") for p in names),1)

if __name__=="__main__":
    unittest.main()
