/**
 * Автономная сборка для просмотра без сервера: один HTML со встроенными JS,
 * CSS, шрифтами и уровнями (открывается двойным кликом, работает офлайн).
 * Плюс архив для просмотра: artifacts/release/cube-sculptor-preview.zip
 * (HTML + README + build.zip для Telegram Mini App, если он собран).
 */
import { build } from 'vite';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const OUT = 'dist-standalone';
const REL = 'artifacts/release';

await build({ mode: 'standalone', logLevel: 'warn', build: { outDir: OUT, emptyOutDir: true } });

let html = readFileSync(join(OUT, 'index.html'), 'utf8');
const escapeScript = (s: string) =>
  s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

// JS: единственный модуль (динамические импорты встроены).
html = html.replace(
  /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/,
  (_m, src: string) => {
    const js = readFileSync(join(OUT, src), 'utf8');
    return `<script type="module">${escapeScript(js)}</script>`;
  },
);
// CSS со встроенными шрифтами (data: URI).
html = html.replace(
  /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/,
  (_m, href: string) => {
    const css = readFileSync(join(OUT, href), 'utf8');
    return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
  },
);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('не все ресурсы встроены');

// Уровни.
const levelsDir = 'public/levels';
const packs: Record<string, unknown> = {};
for (const f of readdirSync(levelsDir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  packs[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(levelsDir, f), 'utf8'));
}
const index = JSON.parse(readFileSync(join(levelsDir, 'index.json'), 'utf8'));
const data = JSON.stringify({ index, packs }).replace(/</g, '\\u003c');
html = html.replace(
  '</head>',
  `<script id="embedded-levels" type="application/json">${data}</script>\n</head>`,
);

mkdirSync(REL, { recursive: true });
const htmlPath = join(REL, 'cube-sculptor.html');
writeFileSync(htmlPath, html);

const readme = `Кубоскульптор — сборка для просмотра (фазы 0–2)
================================================

КАК ОТКРЫТЬ
  Откройте cube-sculptor.html двойным кликом — подойдёт Chrome, Edge, Яндекс Браузер,
  Firefox или Safari. Сервер и интернет не нужны: весь код, шрифты и уровни внутри файла.
  Чтобы посмотреть на телефоне, перешлите файл себе и откройте его в браузере.

ЧТО ВНУТРИ
  • Обучение — 5 уровней: ступенька, «Т», стул, стол, домик.
  • Тест 10×10×10 — 5 больших уровней: шар, пирамида, кружка, бублик, гриб.
    Этот набор отладочный и в релизе будет скрыт.
  Остальные наборы пока пустые: контент появится в фазах 3–4.

УПРАВЛЕНИЕ
  Мышь:   ЛКМ — текущий инструмент, ПКМ — кисть. Протяжка по линии — действие
          на всю линию. Перетаскивание по пустому месту или средней кнопкой —
          вращение, колесо — зум.
  Клавиши: 1 / 2 — молоток / кисть; удерживать Пробел — временно кисть;
          WASD или стрелки — вращение; R — сменить ось среза, Q / E — вернуть / срезать слой;
          Esc — пауза.
  Телефон: тап — текущий инструмент; протяжка по кубам — действие по линии;
          протяжка по пустому месту — вращение; двумя пальцами — вращение и зум.
          Внизу переключатель «Молоток / Кисть» и кнопка «держите — кисть».
  Срезы:  круглые ручки X / Y / Z у рёбер блока; кнопки «ось / − / +» слева внизу.

ПРАВИЛА КОРОТКО
  Число на грани — сколько кубов фигуры в линии, уходящей вглубь от этой грани.
  Обычное число — кубы идут одной группой, число в кружке — двумя группами,
  в квадрате — тремя и больше. Ломайте лишние кубы; помечайте кистью те, что точно
  остаются. 5 промахов — поражение.

ОТЛАДКА
  Допишите к адресу ?debug=1 (например ...cube-sculptor.html?debug=1). Появится панель:
  FPS, выбор любого уровня, «шаг» и «решить» (ходит бот), «решение» — подсветка ответа.

ЧЕГО ПОКА НЕТ (по плану брифа)
  Сохранения прогресса и открытие наборов по очереди, коллекция, подсказки обучения
  с указателем-рукой, звук, настройки, которые запоминаются. Это фазы 5–6.
  Реклама — заглушка: «Продолжить за рекламу» срабатывает сразу, без ролика.

build.zip — та же игра для Telegram Mini App (index.html в корне архива): её нужно
разместить на любом HTTPS-хостинге (см. docs/TELEGRAM.md). Локально она открывается
только через веб-сервер: например, npx serve или python -m http.server.
`;

const files: Record<string, Uint8Array> = {
  'cube-sculptor/cube-sculptor.html': readFileSync(htmlPath),
  'cube-sculptor/README.txt': strToU8(readme),
};
if (existsSync('build.zip')) files['cube-sculptor/build.zip'] = readFileSync('build.zip');
const zip = zipSync(files, { level: 9 });
const zipPath = join(REL, 'cube-sculptor-preview.zip');
writeFileSync(zipPath, zip);
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} МБ`;
console.log(`${htmlPath}: ${mb(Buffer.byteLength(html))}`);
console.log(`${zipPath}: ${mb(zip.length)}`);
