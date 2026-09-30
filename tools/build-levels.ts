/**
 * `npm run levels`: content/manifest.json → public/levels/<pack>.json + index.json.
 * Печатает отчёт по метрикам сложности. Сборка детерминированная.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  buildContent,
  stringifyIndex,
  stringifyPack,
  type Manifest,
  type VoxelFile,
} from '../content/build';

const OUT = 'public/levels';
const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as Manifest;
const t0 = performance.now();
const voxels: Record<string, VoxelFile> = {};
if (existsSync('content/voxels')) {
  for (const f of readdirSync('content/voxels')) {
    if (!f.endsWith('.json')) continue;
    const v = JSON.parse(readFileSync(`content/voxels/${f}`, 'utf8')) as VoxelFile;
    voxels[v.id] = v;
  }
}
const content = buildContent(manifest, { voxels });

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(`${OUT}/${f}`);
for (const p of content.packs) {
  if (p.levels.length) writeFileSync(`${OUT}/${p.pack}.json`, stringifyPack(p));
}
writeFileSync(`${OUT}/index.json`, stringifyIndex(content.index));

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  'id'.padEnd(10) +
    pad('size', 9) +
    pad('fill', 6) +
    pad('hid%', 6) +
    pad('rnd', 5) +
    pad('one', 5) +
    pad('○%', 5) +
    pad('□%', 5) +
    pad('score', 7) +
    pad('diff', 5) +
    pad('time', 6),
);
for (const b of content.levels) {
  const m = b.metrics;
  console.log(
    b.level.id.padEnd(10) +
      pad(b.level.size.join('×'), 9) +
      pad(m.filled, 6) +
      pad(Math.round(m.hiddenRatio * 100), 6) +
      pad(m.rounds, 5) +
      pad(m.singleLineRounds, 5) +
      pad(Math.round(m.circleRatio * 100), 5) +
      pad(Math.round(m.squareRatio * 100), 5) +
      pad(b.score.toFixed(1), 7) +
      pad(b.level.difficulty, 5) +
      pad(b.level.targetTime, 6) +
      (b.remainingFirst ? `  ! видимых ранних типов: ${b.remainingFirst}` : ''),
  );
}
if (content.skipped.length) {
  console.log(
    `\nбез вокселей (ещё не сгенерированы): ${content.skipped.length} — ${content.skipped.slice(0, 12).join(', ')}${content.skipped.length > 12 ? '…' : ''}`,
  );
}
console.log(
  `\n${content.levels.length} уровней, ${content.packs.filter((p) => p.levels.length).length} файлов, ${Math.round(performance.now() - t0)} мс`,
);
