"""Stage 14 integration smoke, optional Playwright dependency.

Usage (mocked storage):
  pip install playwright
  playwright install chromium
  python qa/stage14_browser_smoke.py --mock

For REAL Windows Chrome/Edge file:// persistence tests omit --mock.
The app itself still starts from one HTML by double-click, without Python.
"""
import argparse
import base64
import io
from pathlib import Path
import struct
import tempfile
import zlib

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=ROOT/'releases/stage14-desktop-ux-data-integrity.html'
MOCK=ROOT/'qa/mock_storage.js'

def small_png():
    w,h=320,200
    raw=b''.join(b'\0'+bytes([110,170,215])*w for _ in range(h))
    def chunk(tag,body):
        return struct.pack('!I',len(body))+tag+body+struct.pack('!I',zlib.crc32(tag+body)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--mock',action='store_true',help='Use memory-only mock IDB; NOT a real persistence test')
    args=p.parse_args()
    checks=[]
    def check(name,ok):
        print(('PASS' if ok else 'FAIL')+' '+name)
        checks.append((name,bool(ok)))
    with sync_playwright() as kit:
        browser=kit.chromium.launch(headless=True)
        page=browser.new_page(viewport={'width':1366,'height':850},accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('dialog',lambda dlg:dlg.accept())
        if args.mock:
            page.evaluate(MOCK.read_text(encoding='utf-8'))
            page.set_content(HTML.read_text(encoding='utf-8'),wait_until='domcontentloaded')
        else:
            page.goto(HTML.resolve().as_uri(),wait_until='domcontentloaded')
        page.wait_for_timeout(300)
        check('Embedded offline styles',page.locator('#sop-tailwind-local').count()==1)
        check('Seven tabs',page.locator('[role="tab"]').count()==7)
        check('Draft lock banner hidden',page.locator('#documentLockBanner').evaluate('e=>getComputedStyle(e).display')=='none')
        for name in ['editor','frv','preview','checklist','frvstudy','twi','documents']:
            page.locator(f'[data-tab="{name}"]').click()
            check('Tab '+name,page.locator('#tab-'+name).is_visible())
        page.locator('[data-tab="editor"]').click()
        page.locator('#addStepBtn').click()
        page.locator('[data-step-field="action"]').fill('Проверить оборудование')
        with tempfile.TemporaryDirectory() as d:
            photo=Path(d)/'qa.png';photo.write_bytes(small_png())
            page.locator('[data-input]').first.set_input_files(str(photo))
            page.wait_for_timeout(200)
            check('Uploaded photo IDB',page.evaluate('async()=>!!(await idbGetPhoto(state.steps[0].id))?.blob'))
            page.locator('[data-edit-photo]').first.click()
            box=page.locator('#illCanvas').bounding_box()
            page.locator('#illTextInput').fill('Подпись')
            page.locator('[data-ill-mode="label"]').click()
            page.mouse.click(box['x']+80,box['y']+70)
            page.locator('#illTextInput').focus()
            page.keyboard.press('Backspace')
            check('Backspace text focus',page.locator('#illTextInput').input_value()=='Подпис')
            page.locator('#illSave').click()
            page.locator('[data-edit-photo]').first.click()
            check('Annotation re-open',page.evaluate('state.steps[0].photoAnnotations.length')==1)
            page.locator('#illCancel').click()
            with page.expect_download(timeout=25000) as download:
                page.locator('#generateBtn').click()
            output=Path(d)/'qa.xlsx';download.value.save_as(str(output))
            check('XLSX export',output.stat().st_size>4000)
            page.evaluate('async()=>{await idbClearAllPhotos();state.steps=[];stateChanged()}')
            page.locator('#importSopInput').set_input_files(str(output))
            page.wait_for_timeout(600)
            check('XLSX import persists image',page.evaluate('async()=>!!(await idbGetPhoto(state.steps[0].id))?.blob'))
            check('Draft restoration includes photo',page.evaluate(
                'async()=>{saveDraft();await applyDraft(JSON.parse(localStorage.getItem(DRAFT_KEY)));return !!state.steps[0].imageData}'))
            pack=page.evaluate("async()=>await docBuildPortableJson({id:'QA',status:'Черновик',snapshot:docSnapshot()},{preferActive:true})")
            check('Portable JSON includes source image',len(pack['photoAssets'])==1)
            check('Portable JSON restore',page.evaluate(
                "async pack=>{await docRestorePortablePhotos('BACKUP',pack.constructor,pack.photoAssets);return !!(await idbGetPhoto(photoDocumentRecordKey('BACKUP',state.steps[0].id)))?.blob}",pack))
        check('No page JS errors',not errors)
        browser.close()
    print(f'Browser QA {sum(ok for _,ok in checks)}/{len(checks)}')
    return 0 if all(ok for _,ok in checks) else 1

if __name__=='__main__':
    raise SystemExit(main())
