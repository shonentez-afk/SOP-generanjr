# Stage19: карта исходных модулей и границы A1

Порядок выполнения равен Stage18. Все части собираются в одном JS script, поэтому это физическая, ещё не независимая, модульность.

| № | Исходник |
|---:|---|
| 1 | src/modules/core/stage19-config.js |
| 2 | src/modules/shared/stage19-ui-helpers.js |
| 3 | src/modules/safety/stage19-icons-logo.js |
| 4 | src/modules/ai/stage19-prompts.js |
| 5 | src/modules/ai/stage19-transport.js |
| 6 | src/modules/ai/stage19-protocol.js |
| 7 | src/modules/editor/stage19-steps.js |
| 8 | src/modules/ai/stage19-field-editor.js |
| 9 | src/modules/photos/stage19-idb.js |
| 10 | src/modules/shared/stage19-dataurl-to-blob.js |
| 11 | src/modules/photos/stage19-repository.js |
| 12 | src/modules/photos/stage19-illustration-editor.js |
| 13 | src/modules/frv/stage19-measurements.js |
| 14 | src/modules/preview/stage19-preview.js |
| 15 | src/modules/review/stage19-checklist.js |
| 16 | src/modules/review/stage19-deterministic.js |
| 17 | src/modules/review/stage19-render.js |
| 18 | src/modules/ai/stage19-dispute.js |
| 19 | src/modules/ai/stage19-review-task.js |
| 20 | src/modules/frv/stage19-study-model.js |
| 21 | src/modules/frv/stage19-study-io.js |
| 22 | src/modules/frv/stage19-study-ai.js |
| 23 | src/modules/frv/stage19-study.js |
| 24 | src/modules/ai/stage19-generate-sop.js |
| 25 | src/modules/core/stage19-step-shape.js |
| 26 | src/modules/twi/stage19-from-sop.js |
| 27 | src/modules/documents/stage19-draft.js |
| 28 | src/modules/documents/stage19-db.js |
| 29 | src/modules/documents/stage19-network-io.js |
| 30 | src/modules/documents/stage19-library-audit.js |
| 31 | src/modules/documents/stage19-portable-photos.js |
| 32 | src/modules/documents/stage19-network-sync.js |
| 33 | src/modules/documents/stage19-library.js |
| 34 | src/modules/demo/stage19-demo.js |
| 35 | src/modules/excel/stage19-export-setup.js |
| 36 | src/modules/shared/stage19-blob-to-dataurl.js |
| 37 | src/modules/excel/stage19-export.js |
| 38 | src/modules/excel/stage19-import.js |
| 39 | src/modules/app/stage19-bootstrap.js |

Следующий этап A2 закрепляет интерфейсы core/state, shared/media, photos, Excel, documents; A3 — AI transport/protocol/tasks; A4 — контроль версий и защита правок. СОП — главный документ, TWI автоматически из СОП, ручная правка необязательна.

Проверки: tools/build_stage19.py --verify-baseline; tests/test_stage19.py; qa/stage19_browser_smoke.py. Старые исходники Stage11 сохранены только для архива.
