"""Regression checks: Stage 13 must preserve AI configuration and Stage 12 Excel."""
import unittest
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_stage13 import build,BASE,RELEASE

class Stage13ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old=BASE.read_text(encoding='utf-8')
        cls.new=build()

    def test_exact_rebuild(self):
        self.assertEqual(self.new,RELEASE.read_text(encoding='utf-8'))

    def test_ai_unchanged(self):
        start='const AI_PROXY_BASE='
        end='// 2. Generic helpers'
        self.assertEqual(
            self.old[self.old.index(start):self.old.index(end)],
            self.new[self.new.index(start):self.new.index(end)]
        )

    def test_photo_layers(self):
        for name in ('photoAnnotations','renderedBlob','restoreStepPhotos',
                     'photoSaveDocumentCopies','photoCloneDocumentRecords',
                     'photoDocumentRecordKey','sanitizeIllustrationShape'):
            with self.subTest(name=name):
                self.assertIn(name,self.new)

    def test_exceljs_remains_embedded(self):
        self.assertIn('<script id="sop-exceljs-local" data-version="4.4.0">',self.new)
        self.assertNotIn('src="https://cdn.jsdelivr.net/npm/exceljs',self.new)

if __name__=='__main__':
    unittest.main()
