# TWI Job Instruction — изолированный проект

Проект TWI Audit RC1. Ветка `project/twi-audit-20261118` в репозитории SOP-generanjr. Файлы SOP конструктора в основной ветке НЕ менять.

## Размещение

- `START_NEW_CHAT_RU.md` и `CURRENT_STATUS_RU.md` в корне этой ветки — точки входа для продолжения.
- `twi/docs/ARCHITECTURE_RU.md` — архитектура и инварианты.
- `twi/docs/CHANGELOG_RU.md` — история и правила версий.
- `twi/docs/PILOT_RESULTS_RU.md` — результаты пилота, без персональных данных.
- `twi/release/RC1/` — место для исходников пилотного HTML и Cloud Function при загрузке.

**Статус загрузки сборки:** все четыре исходных файла RC1 загружены в `twi/release/RC1/` и сверены с оригинальным локальным пакетом по Git blob SHA.

**Конфиденциальность:** реальный `twi_data.json`, резервные копии, результаты аудитов с ФИО, Yandex credentials, URL с секретами не загружать.
