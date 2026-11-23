"""Restore explanatory text from verified Stage41 interactive diagrams.

The input is the pinned documentation checkout, never an LLM-generated summary.
Explanatory cards remain inside the new single-map UI, no separate pages.
"""
from __future__ import annotations

import json
from pathlib import Path
import re

# Explicit reconciliation of Archify component IDs to current LikeC4 elements.
# This is not a generic fuzzy name match.
OVERVIEW_TO_C4 = {
    "operator": "worker",
    "runtime": "app",
    "sop": "app.editor",
    "ai": "app.ai",
    "proxy": "proxy",
    "yandex": "yandex",
    "review": "app.review",
    "frv": "app.frv",
    "photos": "app.photos",
    "photoDb": "app.storage.media",
    "twi": "app.twi",
    "library": "app.library",
    "docDb": "app.storage.docs",
    "network": "network",
    "sopXlsx": "app.excel",
    "twiXlsx": "app.twi.print",
    "assets": "app.assets",
}

# Map narrative AI tasks to the corresponding logical subsystems. Actual
# source-file associations are populated separately from task.sources.
AI_ASSOCIATIONS = {
    "app.ai": "*",
    "app.ai.generator": ["generate_sop"],
    "app.ai.field": ["edit_field", "photo_hint"],
    "app.ai.reviewtask": ["review"],
    "app.ai.mentoring": ["dispute", "stage27_questions", "stage27_proposals", "stage27_explain", "stage27_mentor"],
    "app.ai.analog": ["stage27_analog"],
    "app.ai.twitask": ["twi_generate"],
    "app.ai.frvtask": [
        "frv_study_build", "frv_study_row_suggest", "frv_study_analyze", "frv_study_classify"
    ],
    "app.ai.transport": ["healthcheck"],
    "app.ai.reason391": ["edit_field"],
    "app.ai.prompt41": ["generate_sop", "review", "twi_generate"],
    "app.ai.dedup41": ["review"],
    "app.review": ["review", "stage27_questions", "stage27_proposals"],
    "app.review.inline": ["review"],
    "app.review.grounded": ["review"],
    "app.twi": ["twi_generate"],
    "app.twi.generator": ["twi_generate"],
    "app.frv": [
        "frv_study_build", "frv_study_row_suggest", "frv_study_analyze", "frv_study_classify"
    ],
    "app.frv.suggestion": ["frv_study_analyze", "frv_study_classify"],
    "app.editor": ["generate_sop", "edit_field"],
}

def embedded_json(file: Path, element: str) -> dict:
    page = file.read_text("utf-8")
    tag = '<script type="application/json" id="' + element + '">'
    if page.count(tag) != 1:
        raise AssertionError("Expected one documentation JSON payload: " + str(file))
    start = page.index(tag) + len(tag)
    end = page.index("</script>", start)
    return json.loads(page[start:end])

def eligible_source(entry: dict, bundle: Path) -> dict | None:
    path = entry.get("path", "")
    if not path or path == "proxy/index.py":
        return None
    if not isinstance(path, str) or not (bundle / "source" / path).is_file():
        return None
    # Older AI documentation uses "L14-L25"; overview uses integer line.
    at = entry.get("line") or 0
    if not at and isinstance(entry.get("range"), str):
        found = re.search(r"L(\d+)", entry["range"])
        at = int(found.group(1)) if found else 0
    return {"path": path, "line": at if isinstance(at, int) else 0}

def unique_sources(entries: list, bundle: Path) -> list:
    result, seen = [], set()
    for entry in entries or []:
        item = eligible_source(entry, bundle)
        if not item:
            continue
        key = (item["path"], item["line"])
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result

def restore_explanations(docs: Path, bundle: Path, architecture: dict, active_files: set[str]) -> dict:
    overview = embedded_json(docs / "sop-stage41-interactive.html", "model")
    ai = embedded_json(docs / "sop-stage41-ai-interactive.html", "taskdata")
    if len(overview.get("components", [])) != 17 or len(ai.get("tasks", [])) != 16:
        raise AssertionError("Incomplete Stage41 archived explanations")

    by_id = {n["id"]: n for n in architecture["nodes"]}
    if not set(OVERVIEW_TO_C4.values()) <= set(by_id):
        raise AssertionError("Overview explanation mapping lost a LikeC4 component")

    for row in overview["components"]:
        component = by_id[OVERVIEW_TO_C4[row["id"]]]
        component["explanation"] = row.get("explanation") or ""
        component["sublabel"] = row.get("sublabel") or ""
        component["sources"] = unique_sources(row.get("sources", []), bundle)

    tasks = []
    tasks_by_source: dict[str, list[str]] = {}
    for row in ai["tasks"]:
        source_refs = unique_sources(row.get("sources", []), bundle)
        task = {
            "id": row["id"],
            "title": row["title"],
            "category": row.get("category", ""),
            "task": row.get("task", ""),
            "entry": row.get("entry", ""),
            "params": row.get("params", {}),
            "input": row.get("input", ""),
            "output": row.get("output", ""),
            "check": row.get("check", ""),
            "apply": row.get("apply", ""),
            "notice": row.get("notice", ""),
            "status": row.get("status", ""),
            "request": row.get("request", {}),
            "response": row.get("response", {}),
            "sources": source_refs,
        }
        tasks.append(task)
        for source in source_refs:
            path = source["path"]
            if path in active_files:
                tasks_by_source.setdefault(path, [])
                if task["id"] not in tasks_by_source[path]:
                    tasks_by_source[path].append(task["id"])

    ids = {t["id"] for t in tasks}
    for path, task_ids in AI_ASSOCIATIONS.items():
        if path not in by_id or (task_ids != "*" and not set(task_ids) <= ids):
            raise AssertionError("Missing AI documentation association " + path)
    overview_links = []
    for relation in overview.get("connections", []):
        if relation["from"] not in OVERVIEW_TO_C4 or relation["to"] not in OVERVIEW_TO_C4:
            raise AssertionError("Unknown architecture link in archived explanation")
        overview_links.append({
            "from": OVERVIEW_TO_C4[relation["from"]],
            "to": OVERVIEW_TO_C4[relation["to"]],
            "label": relation.get("label", ""),
        })
    if len(overview_links) < 20:
        raise AssertionError("Overview lost explanatory connection labels")

    return {
        "tasks": tasks,
        "taskAssociations": AI_ASSOCIATIONS,
        "tasksBySource": tasks_by_source,
        "connections": overview_links,
        "overview": "Принятая Stage41 — один локальный HTML. TWI создаётся из СОП, а ФРВ остаётся самостоятельным исследованием. Статические связи не доказывают фактическое исполнение.",
        "notes": {
            "source": "Содержательные пояснения восстановлены из прежней Stage41 Archify и карты ИИ.",
            "ai": "Схемы данных и правила запросов — описание кода, а не реальные ответы модели. В переносимой копии адрес владельческого прокси удалён."
        }
    }
