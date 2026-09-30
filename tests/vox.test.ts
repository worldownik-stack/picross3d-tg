import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeRle } from '../src/core/codec';
import type { VoxelFile } from '../content/build';
import { readVox, writeVox, type VoxModel } from '../tools/vox/format';
import { gamePaletteVox, voxToFigure } from '../tools/vox/import';
import { GAME_PALETTE } from '../tools/voxel/palette';

const idx = (hex: string) => GAME_PALETTE.indexOf(hex) + 1;

describe('MagicaVoxel .vox', () => {
  it('запись и чтение модели без потерь', () => {
    const m: VoxModel = {
      size: [3, 2, 4],
      voxels: [
        [0, 0, 0, 1],
        [2, 1, 3, 7],
      ],
      palette: gamePaletteVox(),
    };
    const back = readVox(writeVox(m));
    expect(back).toEqual(m);
    expect(back.palette).toHaveLength(256);
  });

  it('оси: Z MagicaVoxel — вверх, сторона Y = 0 — перед (+Z игры)', () => {
    // Столбик 1×1×2 у передней стороны (y = 0), красный низ и синий верх; сзади — один куб.
    const m: VoxModel = {
      size: [1, 2, 2],
      voxels: [
        [0, 0, 0, idx('#c8373b')],
        [0, 0, 1, idx('#4f86c6')],
        [0, 1, 0, idx('#c8373b')],
      ],
      palette: gamePaletteVox(),
    };
    const f = voxToFigure(m);
    expect(f.size).toEqual([1, 2, 2]); // X, высота, глубина
    const at = (y: number, z: number) => f.palette[f.cells[y + 2 * z]! - 1];
    expect(at(0, 1)).toBe('#c8373b'); // перед, низ
    expect(at(1, 1)).toBe('#4f86c6'); // перед, верх
    expect(at(0, 0)).toBe('#c8373b'); // зад
    expect(f.cells[1]).toBe(0); // сзади сверху пусто
    expect(f.remapped).toEqual([]);
  });

  it('чужие цвета приводятся к палитре игры, не больше 6', () => {
    const palette = gamePaletteVox();
    palette[0] = [200, 60, 60, 255]; // почти #c8373b
    const voxels: VoxModel['voxels'] = [[0, 0, 0, 1]];
    for (let k = 0; k < 8; k++) voxels.push([k + 1, 0, 0, idx(GAME_PALETTE[k * 4]!)]);
    const f = voxToFigure({ size: [9, 1, 1], voxels, palette });
    expect(f.remapped).toEqual([{ from: '#c83c3c', to: '#c8373b' }]);
    expect(f.palette.length).toBeLessThanOrEqual(6);
    expect(f.filled).toBe(9);
  });

  it('ошибки: не .vox, несколько моделей, нет палитры', () => {
    expect(() => readVox(new Uint8Array(16))).toThrow();
    const one = writeVox({ size: [1, 1, 1], voxels: [[0, 0, 0, 1]], palette: gamePaletteVox() });
    // Две модели: дублируем SIZE+XYZI внутри MAIN.
    const main = 8;
    const body = one.slice(main + 12, main + 12 + 24 + 20); // SIZE (24) + XYZI с одним вокселем (20)
    const two = new Uint8Array(one.length + body.length);
    two.set(one.slice(0, main + 12));
    two.set(body, main + 12);
    two.set(one.slice(main + 12), main + 12 + body.length);
    new DataView(two.buffer).setInt32(main + 8, one.length - main - 12 + body.length, true);
    expect(() => readVox(two)).toThrow(/2 моделей/);
    // Без RGBA: обрезаем последний чанк.
    const noPal = one.slice(0, one.length - (12 + 1024));
    new DataView(noPal.buffer).setInt32(main + 8, noPal.length - main - 12, true);
    expect(() => readVox(noPal)).toThrow(/палитры/);
  });

  it('домик home_09 импортирован из content/vox', () => {
    const m = readVox(new Uint8Array(readFileSync('content/vox/home_09.vox')));
    const f = voxToFigure(m);
    const v = JSON.parse(readFileSync('content/voxels/home_09.json', 'utf8')) as VoxelFile;
    expect(v.size).toEqual(f.size);
    expect(v.palette).toEqual(f.palette);
    expect(decodeRle(v.cells, f.cells.length)).toEqual(f.cells);
  });
});
