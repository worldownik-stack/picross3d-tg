import { GAME_PALETTE, hexToRgb, Palette, reduceColors, rgbToHex } from '../voxel/palette';
import { finishFigure } from '../voxel/voxelize';
import type { VoxModel } from './format';

export interface VoxFigure {
  size: [number, number, number];
  /** Индекс цвета фигуры (1..k), 0 — пусто. */
  cells: Uint8Array;
  palette: string[];
  filled: number;
  /** Цвета модели, которых нет в палитре игры, и их замены. */
  remapped: Array<{ from: string; to: string }>;
}

/**
 * Модель MagicaVoxel → фигура игры. Оси: в MagicaVoxel Z — вверх, «перед» модели — сторона
 * Y = 0 (к камере по умолчанию); в игре Y — вверх, перед — +Z. Цвета приводятся к палитре
 * игры (ближайший в OKLab), не больше `maxColors`.
 */
export function voxToFigure(model: VoxModel, palette = new Palette(), maxColors = 6): VoxFigure {
  const [sx, sy, sz] = model.size;
  const size: [number, number, number] = [sx, sz, sy];
  const cells = new Uint8Array(sx * sz * sy);
  const remapped = new Map<string, string>();
  const colorOf = new Map<number, number>();
  for (const [x, y, z, ci] of model.voxels) {
    let pi = colorOf.get(ci);
    if (pi === undefined) {
      const [r, g, b] = model.palette[ci - 1]!;
      const hex = rgbToHex([r / 255, g / 255, b / 255]);
      pi = palette.nearest(hexToRgb(hex));
      if (palette.hex[pi] !== hex) remapped.set(hex, palette.hex[pi]!);
      colorOf.set(ci, pi);
    }
    cells[x + sx * (z + sz * (sy - 1 - y))] = pi + 1;
  }
  reduceColors(cells, palette, maxColors);
  const fig = finishFigure(cells, size, palette);
  return { ...fig, remapped: [...remapped].map(([from, to]) => ({ from, to })) };
}

/** Палитра .vox для новых фигур: цвета игры в индексах 1..33, дальше — серая шкала. */
export function gamePaletteVox(): VoxModel['palette'] {
  const out: VoxModel['palette'] = [];
  for (const hex of GAME_PALETTE) {
    const [r, g, b] = hexToRgb(hex);
    out.push([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]);
  }
  while (out.length < 256) {
    const v = Math.round(((out.length - GAME_PALETTE.length) / (256 - GAME_PALETTE.length)) * 255);
    out.push([v, v, v, 255]);
  }
  return out;
}
