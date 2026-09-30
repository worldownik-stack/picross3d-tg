/**
 * `npm run icon`: рисует иконку для Telegram (изометрический блок кубов с выбитым углом,
 * палитра игры) и сохраняет assets/telegram/icon.svg, icon-512.png (Mini App)
 * и icon-640.png (аватар бота). PNG рендерится Chromium из Playwright.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = 'assets/telegram';
const SIZE = 512;
const INK = '#4b3323';

/** Блок 3×3×3; выбитые кубы образуют «ступеньку» у переднего угла, бирюзовые — открытая фигура. */
const N = 3;
const REMOVED = new Set(['2,2,2', '2,1,2', '1,2,2', '2,2,1']);
const TEAL = new Set(['2,1,1', '1,2,1', '2,2,0', '1,1,2']);

const S = 62; // ребро куба
const W = S * Math.cos(Math.PI / 6);
const H = S / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;

type P = [number, number, number];
const proj = ([x, y, z]: P): string =>
  `${(CX + (x - y) * W).toFixed(1)},${(CY + (x + y) * H - z * S).toFixed(1)}`;
const poly = (pts: P[], fill: string) =>
  `<polygon points="${pts.map(proj).join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;

const cubes: string[] = [];
const order: P[] = [];
for (let x = 0; x < N; x++)
  for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) order.push([x, y, z]);
order.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));

for (const [x, y, z] of order) {
  const key = `${x},${y},${z}`;
  if (REMOVED.has(key)) continue;
  const teal = TEAL.has(key);
  const [top, left, right] = teal
    ? ['#5cc9bc', '#2aa99b', '#1c7f74']
    : ['#fff3e0', '#e6d5b8', '#cbb48f'];
  cubes.push(
    poly(
      [
        [x, y, z + 1],
        [x + 1, y, z + 1],
        [x + 1, y + 1, z + 1],
        [x, y + 1, z + 1],
      ],
      top,
    ),
    poly(
      [
        [x, y + 1, z],
        [x + 1, y + 1, z],
        [x + 1, y + 1, z + 1],
        [x, y + 1, z + 1],
      ],
      left,
    ),
    poly(
      [
        [x + 1, y, z],
        [x + 1, y + 1, z],
        [x + 1, y + 1, z + 1],
        [x + 1, y, z + 1],
      ],
      right,
    ),
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="#fbf4e8"/>
      <stop offset="0.6" stop-color="#f3e9d8"/>
      <stop offset="1" stop-color="#e6d3b3"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  ${cubes.join('\n  ')}
</svg>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/icon.svg`, svg);

const browser = await chromium.launch();
try {
  for (const px of [512, 640]) {
    const page = await browser.newPage({ viewport: { width: px, height: px } });
    await page.setContent(
      `<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${px}" height="${px}"></body>`,
    );
    await page.screenshot({ path: `${OUT}/icon-${px}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Иконки сохранены в ${OUT}/`);
