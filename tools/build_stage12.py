#!/usr/bin/env python3
"""Rebuild Stage 12 standalone HTML: exactly two changes to Stage 11.

1. Replace the single ExcelJS CDN script tag by an inline ExcelJS MIT vendor bundle.
2. Replace only openIllustrationEditor() with the full Photo Studio module.

Application logic, AI proxy settings and drafts/storage formats are preserved.
"""
from pathlib import Path
import argparse
import hashlib
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / 'releases/stage11-photo-editor.html'
RELEASE = ROOT / 'releases/stage12-local-exceljs-photo-studio.html'
PHOTO = ROOT / 'src/modules/photos/illustration-studio.js'
VENDOR = ROOT / 'src/vendor/exceljs.min.js'
LICENSE = ROOT / 'src/vendor/ExcelJS_LICENSE.txt'
CDN_TAG = '<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>'
EDITOR_START = 'async function openIllustrationEditor(stepId)'
EDITOR_END = '// 7. FRV'
AI_START = 'const AI_PROXY_BASE='
AI_END = '// 2. Generic helpers'

def build():
    base = BASELINE.read_text(encoding='utf-8')
    photo = PHOTO.read_text(encoding='utf-8').rstrip() + '\n'
    bundle = VENDOR.read_text(encoding='utf-8').rstrip()
    license_text = LICENSE.read_text(encoding='utf-8').rstrip()
    if base.count(CDN_TAG) != 1 or base.count(EDITOR_START) != 1:
        raise ValueError('Stage 11 is not the expected baseline')
    if photo.count(EDITOR_START) != 1 or '*/' in license_text or '</script' in bundle.lower():
        raise ValueError('The photo editor or vendor payload is invalid')
    start = base.index(EDITOR_START)
    end = base.index(EDITOR_END, start)
    result = base[:start] + photo + '\n' + base[end:]
    script = '<script id="sop-exceljs-local" data-version="4.4.0">\n/*\n' + license_text + '\n*/\n' + bundle + '\n</script>'
    result = result.replace(CDN_TAG, script, 1)
    if result[result.index(AI_START):result.index(AI_END)] != base[base.index(AI_START):base.index(AI_END)]:
        raise ValueError('AI configuration or prompts changed unexpectedly')
    restored = result.replace(script, CDN_TAG, 1)
    restored = restored.replace(photo+'\n', base[start:end], 1)
    if restored != base:
        raise ValueError('Unexpected application code changed')
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='dist/sop-constructor.html')
    parser.add_argument('--verify-release', action='store_true')
    args = parser.parse_args()
    html = build()
    if args.verify_release and html != RELEASE.read_text(encoding='utf-8'):
        print('FAIL: Stage 12 differs from checked-in release', file=sys.stderr)
        return 1
    dest = ROOT / args.out
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding='utf-8')
    digest = hashlib.sha256(html.encode('utf-8')).hexdigest()
    print(f'PASS: Stage 12, bytes={len(html.encode("utf-8"))}, sha256={digest}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
