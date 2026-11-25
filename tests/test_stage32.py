"""Stage32: exact merged-cell photo anchors, frozen Stage31 semantics."""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import build_stage32 as stage32

class Stage32ExcelPhotoTests(unittest.TestCase):
    def test_unchanged_shell_and_protected_modules(self):
        stage32.verify_static()
        spec=json.loads(stage32.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(spec["modules"]),58)
        self.assertEqual(len(set(spec["modules"])),58)
        self.assertIn("src/modules/excel/stage32-export.js",spec["modules"])
        self.assertNotIn("src/modules/excel/stage20-export.js",spec["modules"])
        for original in (
            "src/modules/photos/stage31-illustration-editor.js",
            "src/modules/photos/stage30-history.js",
            "src/modules/excel/stage19-import.js",
            "src/modules/photos/stage20-photo-read.js",
            "src/modules/core/stage20-export-snapshot.js",
            "src/modules/ai/stage26-transport.js",
            "src/modules/ai/stage29-generate-sop.js",
            "src/modules/twi/stage29-from-sop.js",
            "src/modules/frv/stage26-study-ai.js"
        ):
            self.assertIn(original,spec["modules"])
        html=stage32.build()
        self.assertEqual(html.count("async function generateExcel()"),1)
        self.assertEqual(html.count("async function generateSOP()"),1)
        self.assertEqual(html.count("async function generateTwiPlan()"),1)
        self.assertEqual(html.count("const AI_PROXY_BASE="),1)

    def test_exact_merged_ranges_and_exceptions_in_node(self):
        src=(ROOT/"src/modules/excel/stage32-export.js").read_text(encoding="utf-8")
        self.assertIn("sopExcelPhotoVisibleExtent(ws,c1,c2,r)",src)
        self.assertIn("ФОТО_STAGE32_2.xlsx",src)
        self.assertIn("async function sopExcelPhotoBackground(",src)
        self.assertIn("sopExcelPhotoForeground(ws,s._excelPhoto,frame)",src)
        self.assertIn("sopXlsxFixPictureAnchors(rawBuffer,embeddedStepPhotos*2)",src)
        self.assertNotIn("sopExcelImageRange(ws,{col:c1-1+0.05,row:r-1+0.05},150,95)",src)
        self.assertIn("ws.addImage(logoId,sopExcelImageRange",src)
        self.assertIn("ws.addImage(icId,sopExcelImageRange",src)
        self.assertEqual(src.count("function sopExcelPhotoCellRange("),1)
        js=r"""
const vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={};vm.createContext(sandbox);vm.runInContext(EXPORTER,sandbox);
const range=sandbox.sopExcelPhotoCellRange;
const visible=sandbox.sopExcelPhotoVisibleExtent;
const foreground=sandbox.sopExcelPhotoForeground;
assert.equal(typeof range,'function');
const cols=[1.75,5.5,19.1,18.5,8.9,17.6,4.9,13.1,9,13.9,23.1,9.1,1.6];
const ws={getColumn(i){return {width:cols[i-1]};},
  getRow(i){return {height:i===15||i===19?120:30};}};
const colWidthEmu=i=>Math.round((cols[i-1]*7+5)*9525);
for(const [first,last,row] of [[3,5,15],[6,9,15],[10,12,15],[3,5,19]]){
  const x=range(ws,first,last,row);
  assert.equal(x.tl.nativeCol,first-1);assert.equal(x.br.nativeCol,last-1);
  assert.equal(x.tl.nativeRow,row-1);assert.equal(x.br.nativeRow,row-1);
  assert.equal(x.tl.nativeColOff,4*9525);assert.equal(x.tl.nativeRowOff,4*9525);
  const w=cols.slice(first-1,last).reduce((a,_,i)=>a+colWidthEmu(first+i),0);
  const occupied=cols.slice(first-1,last-1).reduce((a,_,i)=>a+colWidthEmu(first+i),0)
      +x.br.nativeColOff-x.tl.nativeColOff;
  assert.equal(occupied,w-8*9525);
  assert(occupied/w>.94 && occupied/w<1);
  assert.equal(x.br.nativeRowOff-x.tl.nativeRowOff,120*12700-8*9525);
  assert.equal(x.editAs,'twoCell');
  const img=visible(ws,first,last,row);
  assert.equal(img.tl.nativeCol,first-1);
  assert.equal(img.tl.nativeRow,row-1);
  const expectedWidth=Math.floor(cols.slice(first-1,last).reduce((sum,w)=>sum+w*7,0)-12);
  assert.equal(img.ext.width,expectedWidth);
  assert.equal(img.ext.height,148);
  assert.equal(img.tl.nativeColOff,6*9525);
  assert.equal(img.tl.nativeRowOff,6*9525);
  const variants=[{width:800,height:300},{width:200,height:700},{width:400,height:400}];
  for(const photo of variants){
    const fit=foreground(ws,photo,img);
    assert(fit.ext.width<=img.ext.width&&fit.ext.height<=img.ext.height);
    assert(Math.abs(fit.ext.width/fit.ext.height-photo.width/photo.height)<.02);
    assert(fit.tl.nativeCol>=first-1&&fit.tl.nativeCol<=last-1);
  }
  assert(!('br' in img));
  assert(!('editAs' in img));
}
assert.throws(()=>range(ws,8,6,15),err=>err?.name==='RangeError');
assert.throws(()=>range(ws,3,5,0),err=>err?.name==='RangeError');
console.log('PASS Stage32.2: conservative Excel column widths, native image aspect and picture containment');
"""
        script="const EXPORTER="+json.dumps(src)+";\n"+js
        cmd=subprocess.run(["node","-"],input=script,text=True,capture_output=True)
        self.assertEqual(cmd.returncode,0,cmd.stderr+"\n"+cmd.stdout)
        check=subprocess.run(["node","--check","-"],input=src,text=True,capture_output=True)
        self.assertEqual(check.returncode,0,check.stderr)

if __name__=="__main__": unittest.main()
