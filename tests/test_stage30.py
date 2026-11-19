"""Stage30: safe photo editing undo/redo, unchanged Stage29 and standalone output."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage30 as stage30

def node_case(js):
    p=subprocess.run(["node","-e",js],text=True,capture_output=True)
    if p.returncode:
        raise AssertionError(p.stdout+"\n"+p.stderr)

class Stage30PhotoEditorTests(unittest.TestCase):
    def test_frozen_base_and_source_modules(self):
        stage30.verify_static()
        spec=json.loads(stage30.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),58)
        self.assertEqual(len(set(spec["modules"])),58)
        self.assertIn("src/modules/photos/stage30-history.js",spec["modules"])
        self.assertIn("src/modules/photos/stage30-illustration-editor.js",spec["modules"])
        self.assertNotIn("src/modules/photos/stage19-illustration-editor.js",spec["modules"])
        self.assertLess(spec["modules"].index("src/modules/photos/stage30-history.js"),
                        spec["modules"].index("src/modules/photos/stage30-illustration-editor.js"))
        html=stage30.build()
        self.assertEqual(html.count("async function openIllustrationEditor("),1)
        self.assertEqual(html.count("async function generateSOP()"),1)
        self.assertEqual(html.count("async function generateTwiPlan()"),1)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)
        self.assertEqual(html.count("<script>\n'use strict';"),1)
        for p in ("src/modules/ai/stage29-quality-core.js",
                  "src/modules/ai/stage29-generate-sop.js",
                  "src/modules/twi/stage29-from-sop.js",
                  "src/modules/ai/stage26-transport.js",
                  "src/modules/excel/stage20-export.js",
                  "src/modules/photos/stage19-repository.js",
                  "src/modules/photos/stage19-idb.js",
                  "src/modules/frv/stage26-study-ai.js"):
            self.assertIn(p,spec["modules"])
            self.assertIn((ROOT/p).read_text(encoding="utf-8"),html)

    def test_photo_contracts_and_history(self):
        src=(ROOT/"src/modules/photos/stage30-history.js").read_text(encoding="utf-8")
        script=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
const context={};vm.createContext(context);vm.runInContext(CODE,context);
const create=context.stage30CreatePhotoHistory;
const initial=[{type:'rect',x:10,y:20,w:40,h:20}];
const h=create(initial);
assert.equal(h.canUndo(),false);
assert.equal(h.canRedo(),false);
assert.equal(h.dirty(initial),false);
const a=[...initial,{type:'badge',x:30,y:30,n:1}];
const b=[...a,{type:'label',x:40,y:40,text:'Проверить'}];
const moved=[{...initial[0],x:22},...b.slice(1)];
assert.equal(h.record(a),true);
assert.equal(h.record(b),true);
assert.equal(h.record(moved),true);
assert.equal(h.record(moved),false);
assert(h.canUndo()&&!h.canRedo());
const undone=h.undo();
assert.equal(undone[0].x,10);
assert.equal(undone.length,3);
assert(h.canRedo());
assert.equal(h.redo()[0].x,22);
assert(h.dirty(moved));
assert.equal(h.undo().length,3);
assert.equal(h.undo().length,2);
assert.equal(h.undo().length,1);
assert.equal(h.dirty(initial),false);
assert.equal(h.canUndo(),false);
assert.equal(h.canRedo(),true);
const replacement=[...initial,{type:'arrow',x1:1,y1:2,x2:3,y2:4}];
assert.equal(h.record(replacement),true);
assert.equal(h.canRedo(),false);
assert.equal(h.length(),2);
const last=h.current();
last[0].x=999;
assert.equal(h.current()[0].x,10);
const bounded=create([],10);
for(let i=0;i<100;i++)bounded.record([{type:'badge',n:i}]);
assert.equal(bounded.length(),10);
assert(bounded.canUndo());
console.log('PASS Stage30: add/move/delete snapshots, undo/redo, dirty rollback, bounded history');
"""
        node_case("const CODE="+json.dumps(src)+";\n"+script)

    def test_editors_protect_input_and_source(self):
        src=(ROOT/"src/modules/photos/stage30-illustration-editor.js").read_text(encoding="utf-8")
        for flag in ("stage30CreatePhotoHistory(photoSnapshot())",
                     "commitIllustrationEdit()", "restoreIllustrationSnapshot",
                     "illZoomIn","illZoomOut","illZoomFit",
                     "canvas.style.maxWidth='none'",
                     "keydown", "input,textarea,select,[contenteditable]",
                     "Разметка изменена, но не сохранена",
                     "pointercancel", "close(true)",
                     "idbPutPhoto(step.id,baseBlob",
                     "renderedBlob:blob", "sanitizeIllustrationAnnotations"):
            self.assertIn(flag,src)
        self.assertNotIn("↶ Убрать последний объект",src)
        self.assertEqual(src.count('id="illUndo"'),1)
        self.assertEqual(src.count('id="illRedo"'),1)

if __name__=="__main__":
    unittest.main()
