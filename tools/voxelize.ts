/**
 * `npm run voxelize [-- id ...]`: Meshy-модели content/meshy/raw/<id>.glb →
 * content/voxels/<id>.json (§6.2). Без аргументов — все уровни manifest с готовым GLB.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { encodeRle } from '../src/core/codec';
import type { Manifest, VoxelFile } from '../content/build';
import { loadGlbSoup } from './voxel/mesh';
import { figurePalette } from './voxel/palette';
import { voxelize } from './voxel/voxelize';

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as Manifest;
const only = new Set(process.argv.slice(2));
let done = 0;
const failed: string[] = [];
for (const pack of manifest.packs) {
  for (const lvl of pack.levels) {
    const src = lvl.source;
    if (src.kind !== 'meshy') continue;
    if (only.size && !only.has(lvl.id)) continue;
    const glb = `content/meshy/raw/${lvl.id}.glb`;
    if (!existsSync(glb)) {
      if (only.size) console.warn(`${lvl.id}: нет ${glb}`);
      continue;
    }
    const t0 = performance.now();
    const soup = await loadGlbSoup(new Uint8Array(readFileSync(glb)));
    let r: ReturnType<typeof voxelize>;
    try {
      r = voxelize(soup, {
        maxSize: src.maxSize ?? pack.maxSize ?? 8,
        rotation: src.rotation ?? [0, 0, 0],
        threshold: src.threshold ?? 0.4,
        palette: src.palette ? figurePalette(src.palette) : undefined,
        shell: src.shell,
        edits: src.edits,
      });
    } catch (e) {
      // Одна неудачная фигура (например, полая при высоком пороге) не останавливает остальные.
      console.error(`${lvl.id}: ошибка — ${(e as Error).message}`);
      failed.push(lvl.id);
      continue;
    }
    const file: VoxelFile = {
      id: lvl.id,
      size: r.size,
      palette: r.palette,
      cells: encodeRle(r.cells),
      stats: {
        filled: r.stats.filled,
        fillRatio: Math.round((r.stats.filled / r.cells.length) * 1000) / 1000,
        colors: r.palette.length,
        triangles: soup.indices.length / 3,
        removedIsolated: r.stats.removedIsolated,
        filledHoles: r.stats.filledHoles,
      },
    };
    writeFileSync(`content/voxels/${lvl.id}.json`, `${JSON.stringify(file, null, 1)}\n`);
    done++;
    console.log(
      `${lvl.id}: ${r.size.join('×')}, кубов ${r.stats.filled}, цветов ${r.palette.length} (${r.palette.join(' ')}), ${Math.round(performance.now() - t0)} мс`,
    );
  }
}
console.log(`вокселизовано: ${done}`);
if (failed.length) {
  console.error(`с ошибкой: ${failed.join(', ')}`);
  process.exitCode = 1;
}
