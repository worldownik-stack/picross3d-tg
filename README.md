# Кубоскульптор (Cube Sculptor)

Объёмный «японский кроссворд» для **Telegram Mini Apps** (порт [picross3d](https://github.com/worldownik-stack/picross3d) с Яндекс Игр): игрок высекает статуэтку из блока кубов,
ориентируясь на числовые подсказки. Запуск в Telegram — [`docs/TELEGRAM.md`](docs/TELEGRAM.md). Бриф проекта — [`docs/BRIEF.md`](docs/BRIEF.md) (исходный, под Яндекс Игры),
ход работ — [`PROGRESS.md`](PROGRESS.md), принятые решения — [`DECISIONS.md`](DECISIONS.md).

## Команды

| Команда                           | Что делает                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | dev-сервер Vite (`http://127.0.0.1:5173/?debug=1` — debug-панель)                                   |
| `npm run build`                   | проверка типов + prod-сборка в `dist/`                                                              |
| `npm run build:debug`             | сборка с debug-режимом в `dist-debug/`                                                              |
| `npm test`                        | Vitest: ядро, решатель, уровни, бот-прогон                                                          |
| `npm run test:coverage`           | то же с покрытием `src/core`                                                                        |
| `npm run e2e`                     | Playwright e2e на 390×844, 844×390, 1366×768                                                        |
| `npm run screens`                 | скриншоты всех экранов в `artifacts/screens/`                                                       |
| `npm run levels`                  | сборка уровней `content/` → `public/levels/*.json`                                                  |
| `npm run voxelize [-- id]`        | Meshy GLB → `content/voxels/<id>.json` (§6.2)                                                       |
| `npm run vox [-- id]`             | фигуры MagicaVoxel `content/vox/<id>.vox` → `content/voxels/<id>.json` ([docs/VOX.md](docs/VOX.md)) |
| `npm run thumbs [-- id]`          | миниатюры фигур с трёх ракурсов → `content/review/<id>.png` (§6.3)                                  |
| `npm run meshy:preview [-- id]`   | превью Meshy-модели (рендер GLB) → `content/meshy/raw/<id>.png`                                     |
| `npm run pack`                    | prod-сборка → `build.zip` + отчёт о размере и проверка бюджета                                      |
| `npm run release:preview`         | автономный HTML без сервера + архив `artifacts/release/cube-sculptor-preview.zip`                   |
| `npm run bot`                     | бот-запускалка Mini App (`TELEGRAM_BOT_TOKEN`, `WEBAPP_URL`; `-- --setup` — меню бота)              |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                                   |

## Стек

TypeScript (strict), Vite, three.js; UI — DOM/CSS поверх canvas. Ядро логики (`src/core`)
написано на чистом TS и не зависит от three.js, UI и платформы.

## Структура

```
src/
  core/       правила, решатель, формат уровней (чистый TS, 100% тестов)
  render/     three.js: кубы, атлас глифов, камера, эффекты
  game/       контроллер уровня: ввод, инструменты, срезы
  ui/         экраны и модальные окна (DOM/CSS)
  platform/   Platform: TelegramPlatform / MockPlatform
  i18n/       строки интерфейса ru/en
  app/        запуск, настройки, контекст приложения
  debug/      debug-панель и API (только dev/debug-сборка)
content/      исходники уровней и manifest
tools/        скрипты сборки контента, вокселизатор (tools/voxel), упаковка
tests/        Vitest
e2e/          Playwright
```

Шрифт — Nunito (SIL OFL 1.1), локальные woff2-подмножества latin + cyrillic.

Пайплайн ассетов Meshy — [`docs/MESHY.md`](docs/MESHY.md), фигуры из MagicaVoxel —
[`docs/VOX.md`](docs/VOX.md).
