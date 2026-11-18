"""Stage 14 desktop regression invariants, no external Python packages."""
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_stage14 import build, BASELINE, RELEASE, ai_section, embedded_exceljs

class Stage14Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old = BASELINE.read_text(encoding='utf-8')
        cls.new = build()

    def test_reproducible_single_html(self):
        self.assertEqual(self.new, RELEASE.read_text(encoding='utf-8'))

    def test_ai_proxy_models_prompts_unchanged(self):
        self.assertEqual(ai_section(self.new), ai_section(self.old))
        self.assertEqual(embedded_exceljs(self.new), embedded_exceljs(self.old))

    def test_offline_css_and_hidden_banner(self):
        self.assertIn('id="sop-tailwind-local"', self.new)
        self.assertNotIn('src="https://cdn.tailwindcss.com"', self.new)
        self.assertIn('.document-lock-banner.hidden{display:none!important}', self.new)

    def test_import_photo_persistence(self):
        self.assertIn('const importedPhotoKeys=[]', self.new)
        self.assertIn('const record=await idbGetPhoto(item.id)', self.new)
        self.assertIn("item.hasPhoto=true", self.new)
        self.assertNotIn(";await idbClearAllPhotos();$('draftBanner').classList", self.new)

    def test_editor_hotkeys_and_document_actions(self):
        self.assertIn("e.target?.closest?.('input,textarea,select,", self.new)
        blocked = self.new[self.new.index('const blockedIds='):self.new.index('blockedIds.forEach')]
        for name in ('docNewBtn', 'docChooseFolderBtn', 'docSyncFolderBtn', 'docBackupsBtn'):
            self.assertNotIn(name, blocked)

    def test_portable_json_and_restoration(self):
        for item in ('docGatherPortablePhotos', 'docRestorePortablePhotos',
                     'docImportPortableBackup', 'photoAssets:',
                     'const manual=opts?.manual!==false;'):
            with self.subTest(item=item):
                self.assertIn(item, self.new)
        self.assertIn('id="docImportJsonBtn"', self.new)

    def test_accessibility_and_desktop_forms(self):
        for item in ('role="tablist"', 'initTabAccessibility', 'enhanceFormAccessibility',
                     "overlay.setAttribute('aria-modal','true')",
                     'role="textbox"', 'const hasData=Object.values(state.twi)'):
            with self.subTest(item=item):
                self.assertIn(item, self.new)

    def test_no_mobile_layout_changes(self):
        begin = 'function renderAgreed()'
        # Exactly the same controls/markup as Stage 13; no responsive changes.
        self.assertEqual(self.old[self.old.index(begin):],
                         self.new[self.new.index(begin):])

if __name__ == '__main__':
    unittest.main()
