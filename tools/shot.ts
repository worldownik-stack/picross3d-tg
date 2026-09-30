/**
 * Скриншот уровня в dev-сервере (для самопроверки рендера).
 * tsx tools/shot.ts <pack> <level> <w> <h> <out.png> [mobile=0|1] [script.js]
 * Необязательный script выполняется в странице после загрузки уровня (есть window.__debug).
 */
import { chromium, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [
  pack = 'tut',
  level = 'tut_01',
  vw = '1366',
  vh = '768',
  out = 'artifacts/shot.png',
  mobile = '0',
  script,
  wait = '1500',
] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext(
  mobile === '1'
    ? { ...devices['Pixel 7'], viewport: { width: +vw, height: +vh }, deviceScaleFactor: 2 }
    : { viewport: { width: +vw, height: +vh } },
);
const page = await ctx.newPage();
const logs: string[] = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto('http://127.0.0.1:5173/?debug=1&lang=ru');
await page.waitForFunction(() => '__debug' in window);
await page.evaluate(
  ([p, l]) =>
    (
      window as unknown as { __debug: { go(id: string, params: object): Promise<void> } }
    ).__debug.go('game', { packId: p, levelId: l }),
  [pack, level],
);
await page.waitForTimeout(1200);
if (script) {
  await page.evaluate(readFileSync(script, 'utf8'));
  await page.waitForTimeout(Number(wait));
}
await page.screenshot({ path: out });
if (logs.length) console.log(logs.join('\n'));
await browser.close();
