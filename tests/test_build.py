"""First migration guard: source parts must reproduce the archived release exactly."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build import BASELINE, build


class ModularRoundtripTest(unittest.TestCase):
    def test_source_roundtrip_is_exact(self):
        self.assertEqual(build(), BASELINE.read_text(encoding="utf-8"))

    def test_single_html_has_expected_sections(self):
        html = build()
        for item in ("id=\"stepsContainer\"", "id=\"tab-frv\"", "id=\"tab-twi\"", "id=\"tab-documents\""):
            self.assertIn(item, html)


if __name__ == "__main__":
    unittest.main()
