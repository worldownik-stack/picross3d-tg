/**
 * Сводный лист скриншотов: artifacts/screens/<проект>/*.png → docs/progress/<name>.jpg.
 * Использование: tsx tools/contact-sheet.ts phase-0
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2] ?? 'sheet';
const root = 'artifacts/screens';
const projects = ['phone-portrait', 'phone-landscape', 'desktop'].filter((p) =>
  existsSync(join(root, p)),
);

const sections = projects
  .map((p) => {
    const imgs = readdirSync(join(root, p))
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => {
        const b64 = readFileSync(join(root, p, f)).toString('base64');
        return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`;
      })
      .join('');
    return `<h2>${p}</h2><div class="row ${p}">${imgs}</div>`;
  })
  .join('');

const html = `<!doctype html><html><head><style>
body{margin:0;padding:16px;background:#2b2520;color:#f3e9d8;font:14px system-ui}
h2{margin:8px 0;font-size:16px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;margin-bottom:12px}
figure{margin:0}
figcaption{font-size:12px;opacity:.8;margin-top:2px}
.phone-portrait img{height:420px}
.phone-landscape img{height:200px}
.desktop img{height:260px}
img{border-radius:6px;display:block}
</style></head><body>${sections}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
await page.setContent(html);
mkdirSync('docs/progress', { recursive: true });
await page.screenshot({
  path: `docs/progress/${name}.jpg`,
  fullPage: true,
  type: 'jpeg',
  quality: 72,
});
await browser.close();
console.log(`docs/progress/${name}.jpg`);
