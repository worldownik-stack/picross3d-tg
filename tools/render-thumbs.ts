/**
 * `npm run thumbs [-- id ...]`: миниатюры фигур игровым рендером с трёх ракурсов
 * → content/review/<id>.png (§6.3). Рядом — превью Meshy (content/meshy/raw/<id>.png),
 * если есть. По умолчанию — все Meshy- и MagicaVoxel-уровни, собранные в public/levels.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { ContentIndex } from '../src/app/content';
import type { Manifest, VoxelFile } from '../content/build';

const PORT = 5179;
const index = JSON.parse(readFileSync('public/levels/index.json', 'utf8')) as ContentIndex;
const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as Manifest;
const figureIds = new Set(
  manifest.packs.flatMap((p) =>
    p.levels.filter((l) => l.source.kind === 'meshy' || l.source.kind === 'vox').map((l) => l.id),
  ),
);
const only = new Set(process.argv.slice(2));
const targets = index.packs.flatMap((p) =>
  p.levels
    .filter((l) => (only.size ? only.has(l.id) : figureIds.has(l.id)))
    .map((l) => ({ pack: p.id, level: l })),
);
if (targets.length === 0) {
  console.log('нет уровней для миниатюр');
  process.exit(0);
}

// Vite напрямую через node: `npx` на Windows — это .cmd, spawn без shell его не находит.
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
);
const stop = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', stop);
// Ждём, пока dev-сервер начнёт отвечать.
for (let t = 0; ; t++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.ok) break;
  } catch {
    /* ещё не запустился */
  }
  if (t > 120) throw new Error('vite did not start');
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
await page.goto(`http://127.0.0.1:${PORT}/?debug=1&lang=ru`);
await page.waitForFunction(() => '__debug' in window);
mkdirSync('content/review', { recursive: true });
const sheet = await browser.newPage({ viewport: { width: 1600, height: 600 } });

for (const { pack, level } of targets) {
  const shots = (await page.evaluate(
    ([p, l]) =>
      (
        window as unknown as { __debug: { thumbnail(p: string, l: string): Promise<string[]> } }
      ).__debug.thumbnail(p!, l!),
    [pack, level.id],
  )) as string[];
  const vox = existsSync(`content/voxels/${level.id}.json`)
    ? (JSON.parse(readFileSync(`content/voxels/${level.id}.json`, 'utf8')) as VoxelFile)
    : null;
  const preview = existsSync(`content/meshy/raw/${level.id}.png`)
    ? `data:image/png;base64,${readFileSync(`content/meshy/raw/${level.id}.png`).toString('base64')}`
    : null;
  const swatches = (vox?.palette ?? []).map((c) => `<i style="background:${c}"></i>`).join('');
  await sheet.setContent(`<!doctype html><body style="margin:0;font:15px system-ui;color:#4b3323">
    <div id="card" style="display:inline-block;background:#efe6d6">
    <div style="padding:10px 14px;display:flex;gap:14px;align-items:baseline">
      <b style="font-size:20px">${level.id} · ${level.title.ru ?? ''} / ${level.title.en}</b>
      <span>${level.size.join('×')}</span><span>${vox?.stats?.filled ?? ''} кубов</span>
      <span class="sw">${swatches}</span>
    </div>
    <div style="display:flex;gap:8px;padding:0 10px 10px">
      ${preview ? `<img src="${preview}" style="width:300px;height:300px;object-fit:contain;background:#fff;border-radius:8px">` : ''}
      ${shots.map((s) => `<img src="${s}" style="width:300px;height:300px;background:#f7f1e6;border-radius:8px">`).join('')}
    </div>
    </div>
    <style>.sw i{display:inline-block;width:18px;height:18px;border-radius:4px;margin-right:3px;vertical-align:middle;box-shadow:0 0 0 1px #0002}</style>
  </body>`);
  const el = await sheet.$('#card');
  await el!.screenshot({ path: `content/review/${level.id}.png` });
  console.log(`content/review/${level.id}.png`);
}
await browser.close();
stop();
