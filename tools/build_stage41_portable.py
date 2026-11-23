#!/usr/bin/env python3
"""Build a fully local Stage41 architecture + constructor archive.

Inputs are two checkout directories: accepted Stage41 and current diagram documentation.
The packer NEVER rewrites the accepted application checkout, only copies into a temporary
portable directory. All links in archived diagrams must resolve inside that directory.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import sys
import zipfile
from urllib.parse import unquote, urlsplit

ARCHIVE_ROOT_NAME = "SOP-Stage41"
PACKAGE_NAME = "SOP-Stage41-Full-Offline.zip"
APP_RELEASE = "releases/stage41-ai-quality-20261123.html"
DISPLAY_NAME = "Конструктор СОП — Stage41"
ACTIVE_MANIFEST = "src/app/stage41-parts.json"
SOURCES = ("src", "tools", "proxy", "tests", "qa")
VIEW_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".mjs", ".py", ".json", ".html", ".css", ".c4",
    ".md", ".txt", ".yml", ".yaml", ".sh", ".ps1", ".bat", ".cmd", ".svg", ".xml"
}
SOURCE_URL_PREFIX = "../viewer/"
LOCAL_APP = "../constructor/Stage41.html"
TOOL_JSON = [
    "stage41-codeflow-graph.json", "stage41-ast-evidence.json"
]
DIAGRAM_JSON = [
    "sop-stage41.architecture.json", "sop-stage41-ai.dataflow.json"
]
BRAND_PATTERN = re.compile("github", re.IGNORECASE)

def ensure_count(text: str, needle: str, context: str, count: int = 1) -> None:
    actual = text.count(needle)
    if actual != count:
        raise AssertionError(f"{context}: expected {count} occurrences of {needle!r}, got {actual}")

def scrub_external_brand(text: str) -> str:
    # The only permitted editing of copied source files is neutralization of
    # brand references; algorithms, whitespace and line numbers remain untouched.
    return BRAND_PATTERN.sub("offline", text)

def store_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, "utf-8")

def file_copy_sanitized(src: Path, dst: Path, log: list[str]) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix.lower() not in VIEW_EXTENSIONS:
        shutil.copyfile(src, dst)
        return
    try:
        payload = src.read_text("utf-8")
    except UnicodeDecodeError:
        shutil.copyfile(src, dst)
        return
    clean = scrub_external_brand(payload)
    if clean != payload:
        log.append(dst.as_posix())
    store_text(dst, clean)

def localize_overview(source: str) -> str:
    text = source
    # Go directly to a line-addressable HTML viewer inside the archive.
    before = "'https://github.com/shonentez-afk/SOP-generanjr/blob/'+M.revision+'/'+s.path+line"
    after = "'../viewer/'+encodeURI(s.path)+'.html'+line"
    ensure_count(text, before, "overview source link")
    text = text.replace(before, after)
    before = "const line=s.line?('#L'+s.line+(s.end_line?'-L'+s.end_line:'')):'',url="
    after = "const line=s.line?('#L'+s.line):'',url="
    ensure_count(text, before, "overview line anchor")
    text = text.replace(before, after)
    text = re.sub(
        r'<footer>Основа:.*?</footer>',
        '<footer>Локальная схема принятой Stage41 · '
        '<a href="../constructor/Stage41.html" target="_blank">Открыть конструктор</a> · '
        '<a href="../index.html">К началу архива</a> · '
        '<a href="../viewer/diagrams/archify/sop-stage41.architecture.json.html">'
        'JSON архитектуры</a></footer>',
        text, count=1, flags=re.DOTALL,
    )
    text = text.replace('href="sop-stage41-ai-interactive.html"', 'href="stage41-ai.html"')
    # Do not embed any remote references, not even in advisory copy.
    return scrub_external_brand(text)

def localize_ai(source: str) -> str:
    text = source
    before = "const url='https://github.com/shonentez-afk/SOP-generanjr/blob/'+M.revision+'/'+s.path+'#'+s.range;"
    after = "const url='../viewer/'+encodeURI(s.path)+'.html#'+(s.range.match(/L\\d+/)||['L1'])[0];"
    ensure_count(text, before, "AI source links")
    text = text.replace(before, after)
    text = re.sub(
        r'<div>Ревизия:.*?</div>',
        '<div>Принятая Stage41 · '
        '<a href="../constructor/Stage41.html" target="_blank">Открыть конструктор</a> · '
        '<a href="../index.html">К началу архива</a></div>',
        text, count=1, flags=re.DOTALL
    )
    text = scrub_external_brand(text)
    return text

def localize_unified(source: str) -> str:
    text = source
    tag = '<script type="application/json" id="model">'
    start = text.index(tag) + len(tag)
    end = text.index('</script>', start)
    payload = json.loads(text[start:end])
    # Preserve iframe srcdoc so overview drilldown works under file://: and
    # avoid cross-origin isolation between sibling local HTML files.
    # All source links inside the embedded pages are converted to local viewers.
    payload["overview"] = localize_overview(payload["overview"])
    payload["ai"] = localize_ai(payload["ai"])
    text = text[:start] + json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") + text[end:]

    begin = 'const BASE="https://github.com/shonentez-afk/SOP-generanjr/blob/"+M.revision+"/";'
    ensure_count(text, begin, "unified BASE")
    text = text.replace(begin, 'const BASE="../viewer/";')
    before = 'const url=(p,line)=>BASE+encodeURI(p)+(line?"#L"+line:"");'
    after = 'const url=(p,line)=>BASE+encodeURI(p)+".html"+(line?"#L"+line:"");'
    ensure_count(text, before, "unified url()")
    text = text.replace(before, after)
    ensure_count(text, 'fr.srcdoc=which==="overview"?M.overview:M.ai;', "unified frame load")
    text = text.replace('href.includes("stage41-ai-interactive.html")','href.includes("stage41-ai.html")')
    text = text.replace('href.includes("stage41-interactive.html")','href.includes("stage41-overview.html")')

    # Local navigation to the actual ready-to-run application.
    ensure_count(text, "</nav>", "unified nav")
    text = text.replace("</nav>",
        '<a href="../constructor/Stage41.html" target="_blank" '
        'style="display:inline-flex;align-items:center;color:#d7fbed;'
        'border:1px solid #70dbc2;border-radius:9px;padding:7px 14px;'
        'text-decoration:none;background:#1d514a;font-weight:700">'
        'Открыть конструктор СОП Stage41</a></nav>', 1)
    text = text.replace("Исходник GitHub", "Открыть исходник")
    text = re.sub(r'<div class="note"><strong>Официальный LikeC4.*?</div>',
        '<div class="note"><strong>LikeC4: схемы в составе архива.</strong> '
        'Восьмиуровневая структура интегрирована в эту карту; '
        'редактируемые файлы model.c4 и views.c4 лежат в разделе диаграмм.</div>',
        text, count=1, flags=re.DOTALL)
    text = re.sub(r'<div class="note"><a target="_blank".*?</div>',
        '<div class="note">'
        '<a href="../diagrams/likec4/model.c4">Модель LikeC4</a> · '
        '<a href="../diagrams/likec4/views.c4">8 представлений</a> · '
        '<a href="../diagrams/data/stage41-ast-evidence.json">AST-анализ</a> · '
        '<a href="../index.html">Главная архива</a></div>',
        text, count=1, flags=re.DOTALL)
    text = re.sub(r'<footer>.*?</footer>',
        '<footer>Принятая Stage41 · Все исходники, карта и конструктор находятся '
        'в одном архиве. <a href="../index.html">На главную</a>. '
        'ИИ-запросы в схемах — примеры структуры, а не реальные данные производства.</footer>',
        text, count=1, flags=re.DOTALL)
    # Make structured model/data links readable in a browser instead of downloading unknown extensions.
    for raw in (
        "likec4/model.c4", "likec4/views.c4",
        "data/stage41-ast-evidence.json", "data/stage41-codeflow-graph.json",
    ):
        text = text.replace(
            'href="../diagrams/' + raw + '"',
            'href="../viewer/diagrams/' + raw + '.html"',
        )
    text = scrub_external_brand(text)
    if not re.search(r'href="\.\./constructor/Stage41\.html"', text):
        raise AssertionError("missing offline application link")
    return text

def source_html(path: str, content: str, raw_link: str, return_link: str) -> str:
    # A static file:// source viewer with real #L<line> anchors, no fetch(),
    # server, frameworks, or external CSS/JS. Raw source also remains adjacent.
    lines = content.splitlines()
    spans = []
    for i, line in enumerate(lines, start=1):
        spans.append(
            f'<div class="line" id="L{i}"><a class="num" href="#L{i}">{i:>4}</a>'
            f'<span class="code">{html.escape(line, quote=True)}</span></div>'
        )
    body = "\n".join(spans)
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Исходник: {html.escape(path)}</title>
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}
body{{margin:0;background:#081522;color:#dceafd;font:13px/1.58 Consolas,monospace}}
header{{position:sticky;top:0;z-index:5;padding:12px 22px;background:#10283df5;border-bottom:1px solid #32546e;display:flex;gap:17px;flex-wrap:wrap;align-items:center}}
header b{{overflow-wrap:anywhere}}a{{color:#8fd8ff;text-decoration:none}}a:hover{{text-decoration:underline}}
main{{overflow:auto;padding:20px 0 35px}}.line{{display:flex;padding:0 15px;min-height:20px;width:max-content;min-width:100%;scroll-margin-top:80px}}
.line:hover{{background:#133349}}.line:target{{background:#235046;outline:1px solid #6ed3b0}}
.num{{min-width:57px;padding-right:16px;text-align:right;user-select:none;color:#7e9ab3;border-right:1px solid #31516b;margin-right:16px}}
.code{{white-space:pre;tab-size:2}}
</style></head><body><header>
<a href="{html.escape(return_link,quote=True)}">← Архитектура</a>
<b>{html.escape(path)}</b>
<a href="{html.escape(raw_link,quote=True)}">Открыть исходный файл</a>
</header><main>{body}</main></body></html>"""

def write_viewers(root: Path) -> dict[str, int]:
    numbers = {"files": 0, "lines": 0}
    for src in (root / "source").rglob("*"):
        if not src.is_file() or src.suffix.lower() not in VIEW_EXTENSIONS:
            continue
        try:
            text = src.read_text("utf-8")
        except UnicodeDecodeError:
            continue
        relative = src.relative_to(root / "source").as_posix()
        dest = root / "viewer" / (relative + ".html")
        raw_rel = os.path.relpath(src, dest.parent).replace(os.sep, "/")
        map_rel = os.path.relpath(root / "maps" / "stage41-unified.html", dest.parent).replace(os.sep, "/")
        store_text(dest, source_html(relative, text, raw_rel, map_rel))
        numbers["files"] += 1
        numbers["lines"] += len(text.splitlines())
    # Browser-friendly, line-addressable viewers for editable architecture files too.
    for src in (root / "diagrams").rglob("*"):
        if not src.is_file() or src.suffix.lower() not in VIEW_EXTENSIONS:
            continue
        try:
            contents = src.read_text("utf-8")
        except UnicodeDecodeError:
            continue
        relative = src.relative_to(root).as_posix()
        dest = root / "viewer" / (relative + ".html")
        raw_link = os.path.relpath(src, dest.parent).replace(os.sep, "/")
        map_link = os.path.relpath(root / "maps" / "stage41-unified.html", dest.parent).replace(os.sep, "/")
        store_text(dest, source_html(relative, contents, raw_link, map_link))
        numbers["files"] += 1
        numbers["lines"] += len(contents.splitlines())
    return numbers

def home_html(manifest: list[str]) -> str:
    from collections import Counter
    cat = Counter(x.split("/")[2] for x in manifest if x.startswith("src/modules/"))
    pills = " · ".join(f"{html.escape(key)}: {num}" for key, num in sorted(cat.items()))
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{DISPLAY_NAME} · Полный переносимый архив</title><style>
:root{{color-scheme:dark;--bg:#081521;--panel:#10293c;--line:#38556e;--text:#e8f5ff;--muted:#b5c9dd}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 30% -5%,#24536b,var(--bg) 65%);color:var(--text);font:15px/1.6 system-ui,Segoe UI,Arial,sans-serif}}
header,main,footer{{max-width:1120px;margin:auto;padding:28px 24px}}header{{padding-top:60px}}
small{{color:#78e0c2;text-transform:uppercase;letter-spacing:.12em;font-weight:700}}
h1{{font-size:clamp(28px,4vw,48px);line-height:1.16;letter-spacing:-.03em;margin:8px 0 12px}}
p{{color:var(--muted);max-width:850px}}h2{{font-size:19px}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}}
.card{{background:var(--panel);border:1px solid var(--line);padding:20px;border-radius:16px;display:flex;flex-direction:column;gap:11px}}
.card p{{margin:0;flex:1}}.action{{background:#1d574c;color:#ddfff7;border:1px solid #72dabc;border-radius:10px;padding:11px 15px;display:inline-block;text-decoration:none;font-weight:700}}
.action:hover{{background:#287565}}.help{{max-width:1000px;background:#123349;border-left:3px solid #72dabc;padding:12px 17px;border-radius:9px;color:#dcf2ff}}.secondary{{background:#123f60;border-color:#5f9cc9}}.fine{{font-size:13px;color:#b8cadb}}
a{{color:#8dd3ff}}li{{margin-bottom:8px}}
.badge{{display:inline-block;padding:4px 10px;border:1px solid #416c82;border-radius:99px;margin:3px;color:#cbe3f1;font-size:12px}}
hr{{border:0;border-top:1px solid var(--line);margin:30px 0}}
</style></head><body>
<header><small>Полный автономный комплект · Stage41</small><h1>Конструктор СОП, исходники и карты — вместе</h1>
<p>Этот комплект работает с локальными файлами. Из него можно открыть принятую сборку конструктора, изучить взаимосвязи функций, перейти из схемы к конкретной строке исходного кода и получить исходники для дальнейшей разработки.</p><p class="help"><strong>Важно:</strong> сначала полностью распакуйте ZIP. Открывайте <b>SOP-Stage41/index.html</b> из папки рядом с каталогами <b>maps</b>, <b>constructor</b>, <b>viewer</b> и <b>source</b>. Если открыть только этот HTML из предпросмотра архива или отдельно скопировать файл, кнопки не найдут соседние страницы.</p></header><main>
<div class="cards">
<div class="card"><h2>Интерактивная архитектура</h2><p>73 активных модуля · 367 межфайловых связей · подробные схемы СОП, TWI, ФРВ и ИИ · доказательства вызовов в AST.</p>
<a class="action" href="maps/stage41-unified.html">Открыть карту программы</a></div>
<div class="card"><h2>Конструктор СОП Stage41</h2><p>Принятая версия приложения в одном HTML. Локальная сборка, редактор фотографий, СОП, TWI, ФРВ, печатные XLSX и библиотека документов.</p>
<a class="action" href="constructor/Stage41.html">Запустить конструктор</a></div>
<div class="card"><h2>Исходные файлы</h2><p>Каталог исходников, сборочные скрипты, настройки прокси, тесты. HTML-просмотрщики с номерами строк и прямыми переходами из карты.</p>
<a class="action secondary" href="viewer/src/app/stage41-parts.json.html">Посмотреть манифест Stage41</a></div>
<div class="card"><h2>Исходники блок-схем</h2><p>LikeC4 .c4, Archify JSON, граф CodeFlow и синтаксическое подтверждение связей. Можно анализировать без сетевого подключения.</p>
<a class="action secondary" href="viewer/diagrams/likec4/model.c4.html">Открыть модель LikeC4</a></div>
</div>
<hr><h2>Как работать с комплектом</h2>
<ol><li>Распакуйте ZIP полностью в одну папку: не переносите карту отдельно от каталога viewer и source.</li>
<li>Откройте файл <strong>index.html</strong> двойным щелчком в Chrome или Edge.</li>
<li>В карте выберите подсистему или модуль, нажмите на имя функции: откроется локальная копия исходного файла с подсветкой нужной строки.</li>
<li>Для рабочего приложения нажмите <strong>Запустить конструктор</strong> на этой странице или ссылку из карты.</li>
</ol>
<p class="fine">Для ИИ-функций конструктора требуется действующая настройка облачного прокси и сетевое соединение; просмотр схем и исходников сети не требует. Исходные файлы приложения скопированы из принятой Stage41, а интерфейс архивных карт не отправляет запросов вовне.</p>
<div><span class="badge">Stage41</span><span class="badge">{len(manifest)} активных JS-модуля</span><span class="badge">Офлайн-карта</span><span class="badge">Исходники внутри ZIP</span></div>
<p class="fine">{html.escape(pills)}</p></main>
<footer class="fine">Единый переносимый комплект. Схемы статические по отношению к принятой версии приложения; они не анализируют изменения исходников в реальном времени.</footer>
</body></html>"""

def scan_links(root: Path, manifest: list[str]) -> dict[str,int]:
    import posixpath
    maps = root / "maps"
    pages = [root / "index.html", *(maps.glob("*.html"))]
    link_pattern = re.compile(r"\bhref\s*=\s*['\"]([^'\"<>]+)['\"]", re.IGNORECASE)
    counter = {"pages":len(pages),"relative_links":0,"external_links":0}
    missed = []
    for page in pages:
        text = page.read_text("utf-8")
        for match in link_pattern.finditer(text):
            raw = html.unescape(match.group(1))
            if raw.startswith(("#", "javascript:", "mailto:")):
                continue
            if raw.startswith(("https://", "http://")):
                counter["external_links"] += 1
                missed.append(f"{page.relative_to(root)}: {raw[:120]}")
                continue
            dest = (page.parent / unquote(urlsplit(raw).path)).resolve()
            if not dest.is_relative_to(root.resolve()) or not dest.exists():
                missed.append(f"{page.relative_to(root)}: missing {raw}")
            else:
                counter["relative_links"] += 1
    # Check dynamic source-link paths from the bundle, not just literal anchors.
    for module in manifest:
        if not (root / "source" / module).is_file():
            missed.append("missing active source " + module)
        if not (root / "viewer" / (module + ".html")).is_file():
            missed.append("missing active viewer " + module)
    for extra in ("proxy/index.py","tools/build_stage41.py","docs/START_NEW_CHAT_RU.md"):
        if not (root / "viewer" / (extra + ".html")).is_file():
            missed.append("missing reference viewer " + extra)
    if missed:
        raise AssertionError("Invalid links:\n" + "\n".join(missed[:25]))
    return counter

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", type=Path, required=True, help="Pinned accepted Stage41 checkout")
    ap.add_argument("--diagrams", type=Path, required=True, help="Stage41 documentation directory")
    ap.add_argument("--output", type=Path, required=True, help="Output for the final ZIP")
    ap.add_argument("--workspace", type=Path, required=True)
    ns = ap.parse_args()
    app,docs = ns.app.resolve(),ns.diagrams.resolve()
    manifest = json.loads((app / ACTIVE_MANIFEST).read_text("utf-8"))["modules"]
    if len(manifest)!=73 or len(set(manifest))!=73:
        raise AssertionError("Expected exactly 73 unique Stage41 JS modules")
    bundle = ns.workspace.resolve() / ARCHIVE_ROOT_NAME
    if bundle.exists():
        shutil.rmtree(bundle)
    bundle.mkdir(parents=True)
    substitutions = []
    for dirname in SOURCES:
        for p in (app / dirname).rglob("*"):
            if p.is_file():
                file_copy_sanitized(p,bundle / "source" / p.relative_to(app), substitutions)
    # One referenced architectural document from the application checkout.
    file_copy_sanitized(app / "docs" / "START_NEW_CHAT_RU.md",
        bundle / "source" / "docs" / "START_NEW_CHAT_RU.md", substitutions)
    # One current working copy of the executable, no historical releases.
    original = (app / APP_RELEASE).read_text("utf-8")
    constructor = scrub_external_brand(original)
    store_text(bundle/"constructor"/"Stage41.html",constructor)
    if len(constructor)<900_000:
        raise AssertionError("Stand-alone Stage41 seems incomplete")
    # The architecture shell and two task-oriented maps are all local files.
    store_text(bundle/"maps"/"stage41-unified.html",localize_unified((docs/"sop-stage41-unified.html").read_text("utf-8")))
    store_text(bundle/"maps"/"stage41-overview.html",localize_overview((docs/"sop-stage41-interactive.html").read_text("utf-8")))
    store_text(bundle/"maps"/"stage41-ai.html",localize_ai((docs/"sop-stage41-ai-interactive.html").read_text("utf-8")))
    for filename in TOOL_JSON:
        obj = json.loads((docs / filename).read_text("utf-8"))
        obj.pop("ci_url",None)
        obj.pop("run",None)
        store_text(bundle / "diagrams" / "data" / filename, json.dumps(obj,ensure_ascii=False,indent=2))
    for filename in DIAGRAM_JSON:
        obj = json.loads((docs / filename).read_text("utf-8"))
        if isinstance(obj.get("meta"),dict):
            obj["meta"].pop("repository",None)
        store_text(bundle/"diagrams"/"archify"/filename,json.dumps(obj,ensure_ascii=False,indent=2))
    for filename in ("model.c4","views.c4"):
        store_text(bundle/"diagrams"/"likec4"/filename,scrub_external_brand((docs/"likec4-stage41"/filename).read_text("utf-8")))

    viewer_count = write_viewers(bundle)
    store_text(bundle/"index.html",home_html(manifest))
    store_text(bundle/"README_OFFLINE.txt",
        "SOP-generanjr Stage41 / portable offline archive\n\n"
        "1. Unzip the whole package (do not preview index.html inside ZIP).\n2. Open index.html in Chrome/Edge from the extracted SOP-Stage41 folder.\n"
        "3. Open the architecture explorer or standalone constructor from the home page.\n"
        "4. Source links open local HTML viewers with numbered lines; raw source files are adjacent under source/.\n"
        "5. Network access is required only when using the constructor's remote AI proxy.\n"
        "6. LikeC4 and Archify editable source definitions are in diagrams/.\n"
    )
    checks = scan_links(bundle,manifest)
    forbidden = []
    for path in bundle.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in VIEW_EXTENSIONS:
            continue
        try:
            text = path.read_text("utf-8")
        except UnicodeDecodeError:
            continue
        if BRAND_PATTERN.search(text):
            forbidden.append(path.relative_to(bundle).as_posix())
    if forbidden:
        raise AssertionError("External platform references remain: " + repr(forbidden[:20]))
    checks["viewer_files"] = viewer_count["files"]
    checks["viewer_lines"] = viewer_count["lines"]
    checks["sanitized_source_files"] = len(substitutions)
    checks["original_application_sha256"] = hashlib.sha256(original.encode("utf-8")).hexdigest()
    checks["archive_application_sha256"] = hashlib.sha256(constructor.encode("utf-8")).hexdigest()
    checks["application_same_bytes"] = (original==constructor)
    checks["active_modules"] = len(manifest)
    checks["archive_root"] = ARCHIVE_ROOT_NAME
    store_text(bundle/"package-checks.json",json.dumps(checks,ensure_ascii=False,indent=2))
    digest_lines=[]
    for path in sorted(bundle.rglob("*")):
        if path.is_file():
            digest_lines.append(hashlib.sha256(path.read_bytes()).hexdigest() + "  " + path.relative_to(bundle).as_posix())
    store_text(bundle/"SHA256SUMS.txt","\n".join(digest_lines)+"\n")

    ns.output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(ns.output,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in sorted(bundle.rglob("*")):
            if path.is_file():
                z.write(path,arcname=f"{ARCHIVE_ROOT_NAME}/{path.relative_to(bundle).as_posix()}")
    with zipfile.ZipFile(ns.output) as z:
        corrupt=z.testzip()
        if corrupt: raise AssertionError(f"Bad ZIP member: {corrupt}")
        names=set(z.namelist())
        if f"{ARCHIVE_ROOT_NAME}/index.html" not in names or f"{ARCHIVE_ROOT_NAME}/constructor/Stage41.html" not in names:
            raise AssertionError("ZIP incomplete")
    checks["zip_bytes"]=ns.output.stat().st_size
    checks["zip_files"]=len(names)
    print("PORTABLE_PACKAGE_PASS="+json.dumps(checks,ensure_ascii=False,sort_keys=True))
    print("PORTABLE_ARCHIVE="+str(ns.output))
    print("PACKAGE_SHA256="+hashlib.sha256(ns.output.read_bytes()).hexdigest())

if __name__=="__main__":
    main()
