# Исходники — начало безопасной модульной миграции

## Текущие исходники Stage19
Актуальная сборка: tools/build_stage19.py и src/app/stage19-parts.json; 39 файлов src/modules/**/stage19-*.js, локальные исходники src/vendor/exceljs.min.js и src/assets/safety/iso7010-part01..07.json, фрагменты HTML в src/app/stage19-*.html.
Команды: python tools/build_stage19.py --verify-baseline и --verify-release. Выход — releases/stage19-modular-runtime.html, один автономный HTML для Chrome/Edge file://.
src/legacy/inline-script-*.html и tools/build.py сохранены для исторической Stage11. Новая сборка Stage19 их не использует. Границы A1 пока только физические; общая JS-область сохраняется, нужны A2–A5. Карта модулей: src/modules/STAGE19_MAP_RU.md.


`src/app/template.html` содержит каркас HTML и маркеры сборки.
`src/styles/inline-*.html` содержат существующие встроенные стили.
`src/legacy/inline-script-*.html` содержат существующие script-блоки; основной код пока **единый**, не разобран по бизнес-модулям.
`src/app/parts.json` задаёт порядок соединения.

Сейчас физическая сборка должна возвращать **в точности** `releases/stage11-photo-editor.html`.
Команда: `python tools/build.py --verify-baseline`.
Проверки: `python -m unittest discover -s tests`.

Далее допускается постепенное выделение `src/modules/core`, `src/modules/photos`, `src/modules/frv`, `src/modules/documents`, `src/modules/excel` и других **при наличии совместимых контрактов и тестов**. Не называть эти модули уже завершёнными: пока это архитектурные цели.
