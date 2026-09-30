# Пайплайн Meshy: регламент

Meshy используется **только при подготовке контента** (§1, п. 1.23 требований) — игра его
никогда не вызывает. Этот документ — пошаговый порядок работы для пилота (фаза 3) и массовой
генерации (фаза 4, только после «ок» владельца).

## Шаги для одного объекта `<id>`

1. **Промты** — из `content/manifest.json` (`source.object`, `source.colors`) по шаблонам
   Приложения А (`content/meshy.ts`: `previewPrompt`, `texturePrompt`, не длиннее 800 символов).
2. **Preview** — `meshy_text_to_3d`: `ai_model: "latest"`, `topology: "triangle"`,
   `target_polycount: 8000`, `should_remesh: true`, `target_formats: ["glb"]` (`PREVIEW_PARAMS`).
   Сразу записать задачу: `npx tsx tools/meshy-record.ts <id> preview <taskId> in_progress`.
3. **Refine** — `meshy_text_to_3d_refine`: `enable_pbr: false`, `texture_prompt`,
   `remove_lighting: true` (если модель поддерживает; `REFINE_PARAMS`).
   Записать: `npx tsx tools/meshy-record.ts <id> refine <taskId> in_progress`.
4. **Скачать** GLB refine (`meshy_download_model`, `save_to`) в `content/meshy/raw/<id>.glb`.
   Инструмент кладёт рядом `<id>_base_color.png` — удалить, текстура уже внутри GLB.
   Превью: `npm run meshy:preview -- <id>` → `content/meshy/raw/<id>.png` (MCP не отдаёт
   миниатюру Meshy, рендерим GLB сами). Отметить успех и кредиты:
   `... <id> preview <taskId> succeeded <кредиты> '<params json>'` (так же для refine).
5. `npm run voxelize -- <id>` → `content/voxels/<id>.json`.
6. `npm run levels` → уровень попадает в `public/levels/<pack>.json`, если решается логикой.
7. `npm run thumbs -- <id>` → `content/review/<id>.png`: превью Meshy + три ракурса вокселей.
8. **Ревью глазами.** Если фигура не узнаётся: поправить в manifest `source.rotation`,
   `source.threshold`, `source.maxSize`, `source.palette` (подмножество палитры игры, если
   затенение раскалывает заливку на соседние цвета), `source.shell` (полые и тонкостенные
   предметы: абажур, зонт, посуда) или `source.edits` в координатах итоговой сетки:
   `remove` → `add` (за пределами сетки расширяет её — так возвращаются тонкие детали:
   черешок, уши, киль) → `paint` (перекрасить только заполненные кубы). Повторить с шага 5. Перегенерация — не больше двух раз
   (`meshy.regenerations`), дальше замена из `reserve` с `replacedBecause`.

Пайплайн возобновляемый: объект со статусом `succeeded` и готовым GLB повторно не
генерируется. Сводка по кредитам: `npx tsx tools/meshy-record.ts summary`.

Объект можно и нарисовать вручную в MagicaVoxel, без кредитов — `docs/VOX.md`.

## Пилот (фаза 3)

`food_01` (яблоко), `pet_01` (кот), `tr_05` (самолёт) — три разных типа объектов.
Итог — отчёт владельцу ⛔: миниатюры `content/review/*.png`, скриншоты уровней в игре,
расход кредитов. Массовая генерация — только после «ок».

**Пилот выполнен** (отчёт — `PROGRESS.md`, фаза 3): 90 кредитов, 0 перегенераций, все три
фигуры узнаются после ручных правок в manifest (D-038, D-039).
