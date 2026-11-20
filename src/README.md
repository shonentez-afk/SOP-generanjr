# Конструктор СОП — актуальная версия Stage32.2

**Принятая сборка:** `python tools/build_stage32.py` по `src/app/stage32-parts.json` → `releases/stage32-excel-photo-fill-browser-candidate.html`, автономный HTML для настольных Chrome/Edge через `file://`, 58 JavaScript-модулей. Дополнительный сервер и внешние JS/CSS рядом не нужны. Stage31 и более ранние релизы сохранены как эталоны регрессии. Не считать слово `candidate` в имени принятого файла признаком незавершённости.

**Приёмка Stage32.2 (20.11.2026):** [PR #27](https://github.com/shonentez-afk/SOP-generanjr/pull/27) объединён с `main`, squash `3b8fd63495133fb7c6f851643c6d6510acb4649d`. [Actions #44668205709](https://github.com/shonentez-afk/SOP-generanjr/actions/runs/44668205709): 86/86 unit PASS, сквозная Chrome Linux и Windows PASS, реальный XLSX и обратный импорт оригиналов PASS. Пользователь подтвердил реальное исправление в Microsoft Excel: «все заработало». Отчёт `docs/STAGE32_XLSX_PHOTO_CELL_FIT_RU.md`.

**XLSX-фотографии:** `src/modules/excel/stage32-export.js` добавляет в каждую фотообласть два слоя: мягкий фон и оригинальную фотографию с сохранением пропорций, без обрезки, с точным размещением в объединённой ячейке. При импорте восстанавливается оригинал. Файлы экспорта маркируются `_ФОТО_STAGE32_2.xlsx`. Предыдущие Stage32 и Stage32.1 не приняты из-за маленьких/растянутых фото.

**Архитектура:** `src/modules/core` (модель/снимки), `shared` (общие медиа и UI), `editor` (шаги), `photos` (хранилище/разметка), `frv` (измерения), `ai` (транспорт/протокол/помощник), `review` (проверки), `documents` (библиотека/сеть), `excel` (XLSX), `twi` (из СОП) и `app` (инициализация). Модули входят в один JS-runtime.

**Регрессия:**
- `python tools/build_stage31.py --verify-release --verify-static`
- `python tools/build_stage32.py --verify-release --verify-static`
- `python -m unittest discover -s tests -v`
- `python qa/stage32_excel_photo_cell_fit.py` (Chrome `file://`, Stage31 регресс и XLSX фото)
- `.github/workflows/stage32.yml` (Linux и Windows).

**Ограничения:** TWI автоматически формируется из СОП, ФРВ отдельно и необязательно, цепочку ФРВ→СОП→TWI не начинать без команды. Не менять Yandex-прокси и `SOP_ENABLE_MODEL_ROUTING` (выключен). Не заниматься мобильным интерфейсом и миграциями старых пользовательских установок. Обмен через корпоративную сетевую папку на двух физических ПК ещё не принят.

Передача статуса в новый чат — `docs/START_NEW_CHAT_RU.md`. Старые файлы и сборщики сохранять как контрольные версии.
