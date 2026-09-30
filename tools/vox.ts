/**
 * `npm run vox [-- id ...]`: фигуры MagicaVoxel content/vox/<id>.vox → content/voxels/<id>.json
 * для уровней manifest с `source.kind = 'vox'`. Цвета приводятся к палитре игры.
 * `npm run vox -- palette`: палитра игры для MagicaVoxel → content/vox/cube-sculptor.png
 * (PNG 256×1: положить в папку palette MagicaVoxel).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { encodeRle } from '../src/core/codec';
import type { Manifest, VoxelFile } from '../content/build';
import { readVox } from './vox/format';
import { gamePaletteVox, voxToFigure } from './vox/import';

if (process.argv[2] === 'palette') {
  const png = new PNG({ width: 256, height: 1 });
  gamePaletteVox().forEach((c, k) => png.data.set(c, k * 4));
  writeFileSync('content/vox/cube-sculptor.png', PNG.sync.write(png));
  console.log('content/vox/cube-sculptor.png');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as Manifest;
const only = new Set(process.argv.slice(2));
let done = 0;
const failed: string[] = [];
for (const lvl of manifest.packs.flatMap((p) => p.levels)) {
  if (lvl.source.kind !== 'vox') continue;
  if (only.size && !only.has(lvl.id)) continue;
  const file = `content/vox/${lvl.id}.vox`;
  if (!existsSync(file)) {
    console.error(`${lvl.id}: нет ${file}`);
    failed.push(lvl.id);
    continue;
  }
  try {
    const fig = voxToFigure(readVox(new Uint8Array(readFileSync(file))));
    const out: VoxelFile = {
      id: lvl.id,
      size: fig.size,
      palette: fig.palette,
      cells: encodeRle(fig.cells),
      stats: {
        filled: fig.filled,
        fillRatio: Math.round((fig.filled / fig.cells.length) * 1000) / 1000,
        colors: fig.palette.length,
      },
    };
    writeFileSync(`content/voxels/${lvl.id}.json`, `${JSON.stringify(out, null, 1)}\n`);
    done++;
    console.log(
      `${lvl.id}: ${fig.size.join('×')}, кубов ${fig.filled}, цветов ${fig.palette.length} (${fig.palette.join(' ')})`,
    );
    for (const r of fig.remapped) console.log(`  цвет ${r.from} нет в палитре игры → ${r.to}`);
  } catch (e) {
    console.error(`${lvl.id}: ошибка — ${(e as Error).message}`);
    failed.push(lvl.id);
  }
}
console.log(`импортировано: ${done}`);
if (failed.length) process.exitCode = 1;
