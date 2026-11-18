#!/usr/bin/env python3
"""Rebuild single-file Stage 14 from Stage 13 and reviewed line edits.

No network, npm, or browser runtime required. All ExcelJS and Tailwind assets
are embedded in the resulting one-click HTML file.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / 'releases/stage13-layered-photo-editor.html'
MANIFEST = ROOT / 'src/patches/stage14-integrations.json'
RELEASE = ROOT / 'releases/stage14-desktop-ux-data-integrity.html'
CSS = ROOT / 'src/styles/tailwind-4.1.10-local.css'

def lines(text: str):
    # Unlike str.splitlines, this exactly follows the newline rule used when
    # generating the patch manifest: only LF separates source lines.
    return re.findall(r'[^\n]*\n|[^\n]+$', text)

def ai_section(text: str):
    start = text.index('const AI_PROXY_BASE=')
    end = text.index('// 2. Generic helpers', start)
    return text[start:end]

def embedded_exceljs(text: str):
    start = text.index('<script id="sop-exceljs-local"')
    end = text.index('</script>', start) + len('</script>')
    return text[start:end]

def build():
    base = BASELINE.read_text(encoding='utf-8')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if manifest.get('format') != 'sop-line-patches-v1':
        raise ValueError('Invalid Stage 14 patch manifest')
    original = lines(base)
    edits = manifest['edits']
    for patch in sorted(edits, key=lambda x: x['startLine'], reverse=True):
        start, size = patch['startLine'], patch['deleteLines']
        actual = ''.join(original[start:start + size])
        if actual != patch['expected']:
            raise ValueError(f'Stage 13 baseline changed at line {start + 1}')
        original[start:start + size] = [patch['insert']]
    release = ''.join(original)
    if ai_section(release) != ai_section(base):
        raise ValueError('AI proxy or AI settings changed')
    if embedded_exceljs(release) != embedded_exceljs(base):
        raise ValueError('Local ExcelJS vendor was changed')
    expected_css = CSS.read_text(encoding='utf-8').strip()
    if expected_css not in release:
        raise ValueError('Embedded Tailwind CSS does not match the source file')
    if 'https://cdn.tailwindcss.com' in release:
        raise ValueError('Legacy Tailwind CDN dependency remains')
    return release

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='dist/sop-constructor-stage14.html')
    parser.add_argument('--verify-release', action='store_true')
    args = parser.parse_args()
    result = build()
    if args.verify_release and result != RELEASE.read_text(encoding='utf-8'):
        print('FAIL: Stage14 differs from checked-in release', file=sys.stderr)
        return 1
    path = ROOT / args.out
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(result, encoding='utf-8')
    print(f'PASS: Stage14 {len(result.encode("utf-8"))} bytes SHA256={hashlib.sha256(result.encode("utf-8")).hexdigest()}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
