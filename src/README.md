# Исходники — начало безопасной модульной миграции

`src/app/template.html` содержит каркас HTML и маркеры сборки.
`src/styles/inline-*.html` содержат существующие встроенные стили.
`src/legacy/inline-script-*.html` содержат существующие script-блоки; основной код пока **единый**, не разобран по бизнес-модулям.
`src/app/parts.json` задаёт порядок соединения.

Сейчас физическая сборка должна возвращать **в точности** `releases/stage11-photo-editor.html`.
Команда: `python tools/build.py --verify-baseline`.
Проверки: `python -m unittest discover -s tests`.

Далее допускается постепенное выделение `src/modules/core`, `src/modules/photos`, `src/modules/frv`, `src/modules/documents`, `src/modules/excel` и других **при наличии совместимых контрактов и тестов**. Не называть эти модули уже завершёнными: пока это архитектурные цели.
