# Исходники актуального Конструктора СОП — Stage31

**Текущая принятая сборка:** `python tools/build_stage31.py` по `src/app/stage31-parts.json` → `releases/stage31-photo-precision-browser-candidate.html`. 58 функциональных JS-модулей, один автономный HTML для настольного Chrome/Edge через `file://`. Рядом не нужны JS/CSS, локальный сервер или ES imports. Stage30/29/28/27/26 остаются контрольными выпусками.

**Приёмка Stage31:** [PR #26](https://github.com/shonentez-afk/SOP-generanjr/pull/26), squash `b18575fd4383f7526bbaf3766c66f885c5f09c4a`. [GitHub Actions #44497012612](https://github.com/shonentez-afk/SOP-generanjr/actions/runs/44497012612) — полная Linux Chrome и Windows Chrome регрессия PASS. Пользователь подтвердил «работает». Исправления фотостудии перечислены в `docs/STAGE31_PHOTO_ANNOTATION_RU.md`.

**Архитектура:** `src/modules/core` (модель/снимки), `shared` (общие медиа и UI), `editor` (шаги), `photos` (хранилище/разметка), `frv` (измерения), `ai` (транспорт/протокол/помощник), `review` (проверки), `documents` (библиотека/сеть), `excel` (XLSX), `twi` (производный из СОП) и `app` (инициализация). Все модули входят в один JS-runtime; структура разделена для сопровождения, а не для браузерных imports.

**Регрессия:**
- `python tools/build_stage31.py --verify-release --verify-static`
- `python -m unittest discover -s tests -v`
- `python qa/stage31_browser_smoke.py` (Chrome `file://` + полный регресс Stage30)
- `.github/workflows/stage31.yml` (Linux и Windows).

**Границы проекта:** TWI автоматически формируется из СОП; ФРВ отдельная и необязательная, цепочку ФРВ→СОП→TWI не начинать без команды. Не менять Yandex-прокси и флаг `SOP_ENABLE_MODEL_ROUTING` (выключен). Не создавать миграции ради старых пользовательских установок и мобильный UI. Реальная корпоративная сетевая папка на двух физических ПК ещё не проверена.

Подробное состояние и правила передачи в следующий чат — `docs/START_NEW_CHAT_RU.md`. Старые файлы и сборщики служат эталонами регрессии, а не актуальной версией.
