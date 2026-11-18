"""Stage 16: keep Excel photographs and protect photo markup UI contracts."""
from __future__ import annotations
import importlib.util
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("sop_stage16_builder",ROOT/"tools/build_stage16.py")
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class Stage16PhotoRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base=builder.BASE.read_text(encoding="utf-8")
        cls.html=builder.build()
        cls.release=builder.OUT.read_text(encoding="utf-8")

    def test_reproducible_standalone_release(self):
        self.assertEqual(self.html,self.release)

    def test_in_memory_photos_survive_excel_normalization(self):
        self.assertIn("state.steps=state.steps.map(normalizeExcelStepKeepingPhoto)",self.html)
        self.assertNotIn("state.steps=state.steps.map(normalizeStepShape);\n  recalcTotalTime();\n  await ensureStepImagesForExport();",self.html)
        self.assertIn("step.imageBuffer=source.imageBuffer||null",self.html)
        self.assertEqual(self.html.count("function blobToDataUrl(blob){"),1)
        self.assertNotIn("function blobToDataUrl(blob){",self.base)
        self.assertIn("step.imageData=typeof source.imageData==='string'?source.imageData:null",self.html)

    def test_excel_requires_every_photo(self):
        self.assertIn("const expectedStepPhotos=await ensureStepImagesForExport()",self.html)
        self.assertIn("Excel не создан: отсутствуют/повреждены фото шагов",self.html)
        self.assertIn("embeddedStepPhotos!==expectedStepPhotos",self.html)
        self.assertIn("base64:s._excelPhoto.base64,extension:s._excelPhoto.extension",self.html)
        self.assertNotIn("wb.addImage({buffer:s.imageBuffer",self.html)
        self.assertNotIn("catch(e){console.warn('image',e,s.id)}",self.html)

    def test_excel_image_anchors_are_standards_compliant(self):
        self.assertIn("function sopExcelImageRange(ws,tl,widthPx,heightPx)",self.html)
        self.assertIn("ws.addImage(id,sopExcelImageRange(ws,{col:c1-1+0.05,row:r-1+0.05},150,95))",self.html)
        self.assertIn("ws.addImage(logoId,sopExcelImageRange",self.html)
        self.assertIn("ws.addImage(icId,sopExcelImageRange",self.html)
        self.assertNotIn("ws.addImage(id,{tl:{col:c1-1+0.05,row:r-1+0.05},ext:",self.html)

    def test_photo_editor_upload_zone_does_not_steal_clicks(self):
        self.assertIn("if(e.target.closest('button,input'))return;inp.click()",self.html)
        self.assertIn("e.preventDefault();e.stopPropagation();",self.html)
        self.assertIn("await openIllustrationEditor(Number(b.dataset.editPhoto))",self.html)
        self.assertIn("Не удалось открыть разметку:",self.html)
        self.assertIn("Для разметки фото создайте новую версию СОП",self.html)

    def test_ai_and_safety_icons_not_modified(self):
        start="const AI_PROXY_BASE="
        end="// 2. Generic helpers"
        self.assertEqual(
            self.base[self.base.index(start):self.base.index(end)],
            self.html[self.html.index(start):self.html.index(end)])
        marker='<script type="application/json" id="sop-local-iso-icons">'
        self.assertEqual(self.base.split(marker,1)[1].split("</script>",1)[0],self.html.split(marker,1)[1].split("</script>",1)[0])
        self.assertIn("function isoIconUrl(id)",self.html)
        self.assertIn("const ICON_LIB=[",self.html)
        self.assertEqual(self.base.count("async function generateExcel"),self.html.count("async function generateExcel"))

if __name__=="__main__":
    unittest.main()
