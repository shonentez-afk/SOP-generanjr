# Исходники актуального Конструктора СОП — Stage 26

**Единственная текущая сборка:** `tools/build_stage26.py` по `src/app/stage26-parts.json` → `releases/stage26-final-browser-candidate.html`. 50 функциональных JS-модулей, один автономный HTML для Chrome/Edge ПК через `file://`. Рядом с HTML не нужны папки, файлы, сервер или ES imports.

Границы исходников: `src/modules/core` (состояние и снимки), `shared` (медиа/общие функции), `editor` (шаги), `photos` (хранилище/разметка), `frv` (замеры и безопасные AI-предложения), `ai` (транспорт/протокол/диалоги), `review` (наставник/детерминированные замечания), `documents` (библиотека и сетевая папка), `excel` (локальная XLSX-сборка), `twi` (только из СОП), `app` (сборка и bootstrap).

Синхронное объединение в одну общую JS-область имён, а не runtime ES Modules, — сознательная архитектура автономного `file://` файла. Нельзя вручную удалять общие функции при редактировании других блоков: сборка и CI сравнивают обязательные контракты.

Проверки:
`python tools/build_stage26.py --verify-release --verify-static`
`python -m unittest discover -s tests -v`
`python qa/stage26_browser_smoke.py` (Linux Chrome)
`python qa/stage26_windows_smoke.py` (Windows Chrome).

**PR #20 принят:** 68 unit, Linux полный Chrome регресс, Windows Chrome и внутренние проверки библиотеки 10/10 — PASS. Подробно: `docs/RELEASE_STAGE26_RU.md`, `docs/ARCHITECTURE_AUDIT_STAGE26_RU.md`.

`src/app/stage19-parts.json` и более старые сборщики остаются контрольными точками регрессии для разработчиков. **Не реализовать миграции или поддержку старых пользовательских инсталляций:** проект ещё разрабатывается. TWI автоматически создаётся из текущего СОП; ФРВ необязательна.

Живой Yandex Cloud и доступ к сетевому диску нужно проверить на ПК пользователя по `docs/BROWSER_ACCEPTANCE_STAGE26_RU.md`. До неё новых этапов разработки не начинать.
