/**
 * Раскадровка видео для самопроверки: N кадров через равные промежутки → одна JPEG.
 * tsx tools/video-frames.ts <video.webm> <out.jpg> [кадров=12] [ширина кадра=320]
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [src, out = 'artifacts/frames.jpg', nArg = '12', wArg = '320'] = process.argv.slice(2);
if (!src) throw new Error('usage: video-frames <video> <out>');
const n = Number(nArg);
const fw = Number(wArg);
const b64 = readFileSync(src).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.setContent(
  `<body style="margin:0;background:#222"><video id="v" muted src="data:video/webm;base64,${b64}"></video><canvas id="c"></canvas></body>`,
);
const frames: string[] = await page.evaluate(
  async ([n, fw]) => {
    const v = document.getElementById('v') as HTMLVideoElement;
    await new Promise((r) =>
      v.readyState >= 1
        ? r(null)
        : v.addEventListener('loadedmetadata', () => r(null), { once: true }),
    );
    // У webm из Playwright длительность может быть Infinity до полного прохода.
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e6;
      await new Promise((r) => v.addEventListener('seeked', () => r(null), { once: true }));
    }
    const dur = v.duration;
    const c = document.getElementById('c') as HTMLCanvasElement;
    const scale = fw / v.videoWidth;
    c.width = fw;
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext('2d')!;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      v.currentTime = Math.min(dur - 0.05, (dur * (i + 0.5)) / n);
      await new Promise((r) => v.addEventListener('seeked', () => r(null), { once: true }));
      ctx.drawImage(v, 0, 0, c.width, c.height);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(0, 0, 70, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '14px monospace';
      ctx.fillText(v.currentTime.toFixed(1) + 's', 6, 16);
      out.push(c.toDataURL('image/jpeg', 0.8));
    }
    return out;
  },
  [n, fw] as const,
);
await page.setContent(
  `<body style="margin:0;padding:8px;background:#222;display:flex;flex-wrap:wrap;gap:6px;width:${fw * 4 + 40}px">${frames
    .map((f) => `<img src="${f}">`)
    .join('')}</body>`,
);
await page.setViewportSize({ width: fw * 4 + 40, height: 400 });
await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 80 });
await browser.close();
console.log(out);
