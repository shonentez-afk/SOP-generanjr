# GitNexus 1.6.12 — реальная проверка на SOP-generanjr Stage39

**Дата:** 23.11.2026  
**Назначение:** личное некоммерческое исследование архитектуры (по сообщению пользователя).  
**Репозиторий:** `shonentez-afk/SOP-generanjr`.  
**Снимок:** `main@4cf1a467e912984cb98d6dc969ab10eb685f458b`.  
**GitNexus:** 1.6.12, Node.js 24.22.3 (Linux GitHub-hosted runner), npm 10.  
**Реальный GitHub Actions PASS:** https://github.com/shonentez-afk/SOP-generanjr/actions/runs/45148118012  
**Ветвь изолированного испытания:** `docs/gitnexus-personal-eval-20261123`, workflow `.github/workflows/gitnexus-personal-trial.yml`.  
**Отдельный архитектурный PR:** #37 в `docs/archify-stage39-architecture-20261123`.

## Подтверждённый итог

GitNexus действительно **запущен и проиндексировал** изолированную рабочую копию из **ровно 67 активных JavaScript-файлов** `src/app/stage39-parts.json`. Для статуса индекса также учитывается вспомогательный README (в выводе: 68 covered files). Исходная рабочая сборка не запускалась и не редактировалась; все операции индексации происходили в директории `$RUNNER_TEMP` внутри GitHub Actions.

| Метрика GitNexus | Результат |
| --- | ---: |
| Узлы знаний (symbols/другие сущности) | **2 123** |
| Рёбра графа знаний | **7 538** |
| Кластеры | **90** |
| Выделенные execution flows | **172** |
| Время индексирования после установки | **6,1 с** |
| Статус индекса | **up-to-date** |

Эти величины не следует сравнивать напрямую с нашим лексическим графом (**258 ребер между файлами / 995 упоминаний прямых вызовов**): GitNexus строит иной граф на более мелком уровне детализации.

## Проверка конкретных цепочек

Команда `gitnexus context <имя>` вернула `status: found` и `epistemic: exact` для всех шести проверенных функций:

| Функция | Определена | Подтверждённые прямые связи |
| --- | --- | --- |
| `aiAsk()` | `ai/stage26-transport.js:36-91` | входящие от `aiFillField`, спора с наставником, проверки соединения, аналога, вопросов, объяснений, генерации СОП/TWI/ФРВ и др. |
| `generateSOP()` | `ai/stage29-generate-sop.js:1-78` | `aiAsk`, `aiReadTaskObject`, `validateGeneratedSop`, `aiGuardCapture`, `aiGuardCanApply`, предварительный просмотр |
| `reviewEntireSOP()` | `ai/stage28-review-task.js:58-168` | входящие от `stage28ReviewLogic`, `stage28ReviewChanged`; выходящие к `aiAsk`, `aiGuard*`, проверкам и состоянию |
| `generateTwiPlan()` | `twi/stage29-from-sop.js:40-92` | `aiAsk`, `aiReadTwiPlan`, `stage29TwiNormalize`, `saveDraft`, guard |
| `frvStudyAnalyze()` | `frv/stage35-study-ai.js:123-176` | `aiAsk`, `frvAiNormalizeAnalysis`, диалог предложений, сохранение и проверка актуальности |
| `stage28ReviewLogic()` | `ai/stage28-review-task.js:194-209` | входящий `stage27Init` из UI; вызывает `reviewEntireSOP`, `stage28CurrentDiff`, `stage28SyncLogic` |

**Полезное дополнение к нашему сканеру:** GitNexus распознал вызов `aiAsk` из `aiFillField` и связал UI-инициализацию `stage27Init` с `stage28ReviewLogic`. Лексический граф не всегда видит обработчики через callback или отдельные области видимости.

**Важно о `stage27ReviewLogic`:** GitNexus видит её как возможного вызывающего `aiAsk`, поскольку функция действительно существует в коде. Но основная кнопка логической проверки в Stage39 использует `stage28ReviewLogic` и общий `review`. Найденная статическая связь не доказывает, что устаревшая ветка вызывается из UI.

## GitNexus impact aiAsk

Команда `gitnexus impact aiAsk` выполнена с кодом завершения 0:

- `target`: `Function:src/modules/ai/stage26-transport.js:aiAsk`;
- `epistemic`: `exact`;
- `direction`: `upstream`;
- `impactedCount`: **33**;
- `summary.direct`: **16**;
- `summary.modules_affected`: **6**;
- `summary.processes_affected`: **15**;
- оценка `risk`: `CRITICAL`, `riskSharedAxes`: `HIGH`.

**Толкование:** изменение общего транспорта ИИ может затронуть множество функций. Метка CRITICAL — **автоматическая оценка охвата изменений, не обнаруженный дефект** и не повод немедленно переписывать `aiAsk`.

## Найденные ограничения реального запуска

1. **FTS / BM25 search недоступен.** Плагин LadybugDB FTS не загрузился. Попытка установки вернула HTTP 404 по `https://extension.ladybugdb.com/v0.18.1/linux_amd64/fts/libfts.lbug_extension`. Команда `gitnexus query "aiAsk"` выполнилась (exit 0), но вернула пустые `definitions` / `processes` с предупреждением о деградации поиска. При этом точечные `context` и `impact` работают.
2. **Flows неполные из-за ограничений обхода:** из 290 потенциальных входных точек 90 не попали в ранжирование и 69 не были трассированы; 359 вызываемых функций пропущены по ограничению ветвления и 12 обходов остановлены по бюджету. Сам GitNexus предупреждает, что отсутствие потока **не означает отсутствие пути в коде**.
3. **Name-fallback resolution:** 1522 мест вызовов (596 пар «вызывающий файл/имя») сопоставлены по эвристике имён. Для решений о рефакторинге обязательно проверить исходный код и динамическое исполнение.
4. В графе GitNexus есть фрагменты вложенных обработчиков и возможные недостижимые функции; считать найденные связи статистическим результатом анализа, а не доказательством реального пользовательского сценария.

## Что делали в Actions и почему первый прогон не прошёл

Первый прогон https://github.com/shonentez-afk/SOP-generanjr/actions/runs/45147964734 завершился **FAIL** на этапе индексации: установленная версия 1.6.12 отвергла флаг `--skip-embeddings`, а npm 11 предупредил о блокировке установочных скриптов. Это несовпадение с документацией ветки GitNexus `main`.

Во втором прогоне установили npm 10 и GitNexus 1.6.12, использовали реально поддерживаемые команды. Итог **PASS**; данные извлечены из логов выполнения GitHub Actions и артефакта `personal-gitnexus-stage39-evaluation` (временный, retention 3 days).

## Воспроизведение локально

Требуется Node.js 22.18+ или 24.11+, npm 10 в проверенной конфигурации, доступ к npm. На **изолированной копии только 67 активных Stage39 файлов** в отдельной директории:

```bash
npm install -g npm@10
npm install -g gitnexus@1.6.12 --no-audit --no-fund
gitnexus analyze --index-only --workers 2
gitnexus status
gitnexus context aiAsk
gitnexus context generateSOP
gitnexus context generateTwiPlan
gitnexus context reviewEntireSOP
gitnexus impact aiAsk
```

Реальный workflow с ограниченным GitHub токеном, копированием 67 файлов и без добавления GitNexus в основную программу: [`.github/workflows/gitnexus-personal-trial.yml`](https://github.com/shonentez-afk/SOP-generanjr/blob/docs/gitnexus-personal-eval-20261123/.github/workflows/gitnexus-personal-trial.yml).

**Границы:** не выполнялся `gitnexus setup`, не подключался MCP к ChatGPT/IDE, не создавались persistent индексы в основном проекте, не менялись `src/`, `releases/`, `proxy/`, `main`.

## Лицензия

GitNexus 1.6.12 поставляется под **PolyForm Noncommercial 1.0.0**. Раздел `Personal Uses` допускает личное изучение, эксперименты и хобби-проекты **без предполагаемого коммерческого применения**. Основание проверки — пользователь сообщил, что использует инструмент в личных целях. Это не юридическое заключение и не разрешение на коммерческую производственную эксплуатацию.

## Решение для архитектурной карты

GitNexus **полезен как дополнительный, более детальный анализатор функций и влияния изменений**. Рекомендовано:
1. Оставить текущую единую HTML-карту для пользователя и LikeC4 для уровней архитектуры.
2. Добавить ссылку на эту проверку и отдельный слой `GitNexus function graph` в будущем при наличии устойчивого экспорта.
3. Не заменять эвристический граф простым сравнением чисел: 258 file-edges и 7 538 symbol-edges означают разное.
4. Приоритет для дальнейшего теста GitNexus — устранить FTS 404, снять ограничение путей на ключевых сценариях `ИИ → проверка → СОП/TWI/ФРВ` и собрать проверенный экспорт функций.
5. До отдельного решения пользователя **не включать постоянный MCP-сервер и не устанавливать GitNexus в продуктивную программу**.
