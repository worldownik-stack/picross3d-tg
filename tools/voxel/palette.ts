import type { Rgb } from './types';

/**
 * Общая палитра игры (≈32 гармоничных цвета, §6.2): тёплые, умеренно насыщенные,
 * в стиле мастерской. Цвета фигур приводятся к ней, не больше 6 на фигуру.
 */
export const GAME_PALETTE: readonly string[] = [
  // красные и розовые
  '#c8373b',
  '#e0604a',
  '#9e2a2b',
  '#ef8fb3',
  '#f6c1d3',
  '#d0587e',
  // оранжевые и жёлтые
  '#f08a3c',
  '#f5b04a',
  '#d9772f',
  '#f6d155',
  '#f3e39a',
  '#c9a227',
  // зелёные
  '#7fbf4d',
  '#4f9a3e',
  '#2f6b3a',
  '#b5d67a',
  '#3aa38f',
  // синие и фиолетовые
  '#4f86c6',
  '#2f5f9e',
  '#8fc3e8',
  '#2aa9c9',
  '#8a5bbf',
  '#c28fd6',
  '#5a3f8a',
  // коричневые и бежевые
  '#8b5a2b',
  '#b98252',
  '#5e3a22',
  '#dcb98c',
  // нейтральные
  '#f7f3ea',
  '#c9c4bb',
  '#8d8a85',
  '#4a4745',
  '#262424',
];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0..1) → OKLab: перцептивно равномерное пространство для сравнения цветов. */
export function rgbToOklab([r, g, b]: Rgb): Rgb {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabDist(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export class Palette {
  readonly lab: Rgb[];
  constructor(readonly hex: readonly string[] = GAME_PALETTE) {
    this.lab = hex.map((h) => rgbToOklab(hexToRgb(h)));
  }

  /** Индекс ближайшего цвета палитры. */
  nearest(rgb: Rgb, allowed?: ReadonlySet<number>): number {
    const lab = rgbToOklab(rgb);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.lab.length; i++) {
      if (allowed && !allowed.has(i)) continue;
      const d = oklabDist(lab, this.lab[i]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}

/** Палитра фигуры из подмножества палитры игры (`source.palette` в manifest). */
export function figurePalette(hex: readonly string[]): Palette {
  const bad = hex.filter((h) => !GAME_PALETTE.includes(h));
  if (bad.length) throw new Error(`not in the game palette: ${bad.join(' ')}`);
  if (hex.length === 0) throw new Error('empty figure palette');
  return new Palette(hex);
}

/**
 * Не больше `maxColors` цветов: самый редкий цвет по очереди сливается с ближайшим
 * (в OKLab) из оставшихся. `cells` — индекс палитры + 1 на ячейку (0 — пусто), изменяется на месте.
 */
export function reduceColors(cells: Uint8Array, palette: Palette, maxColors: number): void {
  for (;;) {
    const counts = new Map<number, number>();
    for (const c of cells) if (c) counts.set(c - 1, (counts.get(c - 1) ?? 0) + 1);
    if (counts.size <= maxColors) return;
    let rare = -1;
    let rareN = Infinity;
    for (const [c, n] of counts) {
      if (n < rareN || (n === rareN && c > rare)) {
        rare = c;
        rareN = n;
      }
    }
    let to = -1;
    let toD = Infinity;
    for (const c of counts.keys()) {
      if (c === rare) continue;
      const d = oklabDist(palette.lab[rare]!, palette.lab[c]!);
      if (d < toD) {
        toD = d;
        to = c;
      }
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === rare + 1) cells[i] = to + 1;
  }
}
