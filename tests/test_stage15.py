"""Stage 15: deterministic icon embedding, integrity and source-of-truth tests."""
import importlib.util
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_stage15", ROOT / "tools/build_stage15.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class LocalSafetyIconsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = builder.BASE.read_text(encoding="utf-8")
        cls.html = builder.build()
        cls.release = builder.OUTPUT.read_text(encoding="utf-8")

    def test_release_is_reproducible(self):
        self.assertEqual(self.release, self.html)

    def test_every_original_catalog_icon_is_embedded(self):
        match = re.search(r'<script type="application/json" id="sop-local-iso-icons">([^<]+)</script>', self.html)
        self.assertIsNotNone(match)
        icons = json.loads(match.group(1))
        self.assertEqual(len(icons), 60)
        section = self.base.split("const ICON_LIB=[", 1)[1].split("].map(([id,type,label])", 1)[0]
        catalog = re.findall(r"\['([MWP]\d{3})',", section)
        self.assertEqual(set(icons), set(catalog))
        for icon_id, svg in icons.items():
            with self.subTest(icon_id=icon_id):
                self.assertIn("<svg", svg)
                self.assertIn("</svg>", svg)
                self.assertNotRegex(svg.lower(), r"<script|<foreignobject|onload\s*=|onerror\s*=")

    def test_no_external_icon_network_and_immediate_load(self):
        app = self.html.split("<script>\n'use strict';", 1)[1]
        for marker in ["https://wsrv.nl/", "https://images.weserv.nl/", "https://commons.wikimedia.org/wiki/Special:FilePath/", "ISO_ICON_MAX_PARALLEL", "isoIconCacheGet", "isoIconCachePut"]:
            self.assertNotIn(marker, app)
        self.assertIn("img.src=isoIconUrl(img.dataset.isoIcon)", app)
        self.assertIn('src="${isoIconUrl(it.id)}" data-iso-icon="${it.id}"', app)

    def test_xlsx_icon_rasterizer_is_fully_local(self):
        app = self.html.split("<script>\n'use strict';", 1)[1]
        self.assertIn("async function svgToPngDataUrl(id,sizePx)", app)
        self.assertIn("img.src=isoIconUrl(id)", app)
        self.assertIn("canvas.toDataURL('image/png')", app)
        self.assertIn("async function buildIconStripPng(ids,iconPx)", app)

    def test_ai_exceljs_and_business_logic_guards(self):
        start = "const AI_PROXY_BASE="
        end = "// 2. Generic helpers"
        self.assertEqual(self.base.split(start,1)[1].split(end,1)[0],self.html.split(start,1)[1].split(end,1)[0])
        self.assertIn("const AI_PROXY_BASE=", self.html)
        self.assertEqual(self.base.split("<script>\n'use strict';",1)[0],self.html.split('<script type="application/json" id="sop-local-iso-icons">')[0])
        self.assertIn("stage14", str(builder.BASE))
        self.assertEqual(self.base.count('class="tab-btn'), self.html.count('class="tab-btn'))

if __name__ == "__main__":
    unittest.main()
