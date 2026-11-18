"""Stage 12 regression boundary checks (require no network or extra libraries)."""
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_stage12 import build, BASELINE, RELEASE, CDN_TAG

class Stage12Test(unittest.TestCase):
    def test_exact_release_rebuild(self):
        self.assertEqual(build(), RELEASE.read_text(encoding='utf-8'))

    def test_offline_exceljs(self):
        result = build()
        self.assertIn('id="sop-exceljs-local"', result)
        self.assertIn('The MIT License (MIT)', result)
        self.assertIn('ExcelJS 19-10-2023', result)
        self.assertNotIn(CDN_TAG, result)

    def test_extended_photo_tools(self):
        result = build()
        for tool in ('select', 'rect', 'arrow', 'badge', 'label', 'callout'):
            self.assertIn('data-ill-mode="'+tool+'"', result)
        for icon in ('check', 'warning', 'stop', 'info', 'click', 'search'):
            self.assertIn('data-ill-icon="'+icon+'"', result)

    def test_proxy_untouched(self):
        base = BASELINE.read_text(encoding='utf-8')
        changed = build()
        start = 'const AI_PROXY_BASE='
        end = '// 2. Generic helpers'
        self.assertEqual(base[base.index(start):base.index(end)], changed[changed.index(start):changed.index(end)])
        self.assertIn("const AI_PROXY_BASE='https://functions.yandexcloud.net/d4ehdpoue3sve6s0f92b'", changed)

if __name__ == '__main__':
    unittest.main()
