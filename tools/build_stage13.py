#!/usr/bin/env python3
"""Assemble Stage 13 from Stage 12, its photo module and integration edits."""
from pathlib import Path
import argparse
import hashlib
import json
import sys

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'releases/stage12-local-exceljs-photo-studio.html'
RELEASE=ROOT/'releases/stage13-layered-photo-editor.html'
MODULE=ROOT/'src/modules/photos/stage13-photo-section.js'
EDITS=ROOT/'src/patches/stage13-integrations.json'
BEGIN='// ============================================================\n// 6. Photos / IndexedDB'
END='// 7. FRV'
MARKER='@@@PHOTO_SECTION@@@'
AI_START='const AI_PROXY_BASE='
AI_END='// 2. Generic helpers'

def build():
    base=BASE.read_text(encoding='utf-8')
    module=MODULE.read_text(encoding='utf-8')
    edits=json.loads(EDITS.read_text(encoding='utf-8'))['edits']
    start=base.index(BEGIN)
    end=base.index(END,start)
    html=base[:start]+MARKER+base[end:]
    for index,change in enumerate(edits):
        before,after=change['before'],change['after']
        matches=html.count(before)
        if matches!=1:
            raise ValueError(f'Integration edit {index} matches {matches} times')
        html=html.replace(before,after,1)
    if html.count(MARKER)!=1:
        raise ValueError('Photo module marker not found')
    html=html.replace(MARKER,module,1)
    old_ai=base[base.index(AI_START):base.index(AI_END)]
    new_ai=html[html.index(AI_START):html.index(AI_END)]
    if old_ai!=new_ai:
        raise ValueError('AI proxy/models/prompts have changed')
    if '<script id="sop-exceljs-local" data-version="4.4.0">' not in html:
        raise ValueError('Offline ExcelJS is missing')
    return html

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default='dist/sop-constructor-stage13.html')
    parser.add_argument('--verify-release',action='store_true')
    args=parser.parse_args()
    html=build()
    if args.verify_release and html!=RELEASE.read_text(encoding='utf-8'):
        print('Stage 13 release does not match source modules',file=sys.stderr)
        return 1
    dest=ROOT/args.out
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(html,encoding='utf-8')
    print('PASS',dest,hashlib.sha256(html.encode('utf-8')).hexdigest())
    return 0

if __name__=='__main__':
    raise SystemExit(main())
