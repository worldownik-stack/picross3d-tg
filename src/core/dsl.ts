import { Grid } from './grid';
import type { Axis, Size3 } from './types';

/**
 * Маленький DSL для фигур (§5.5): области (`box`, `sphere`, `cylinder`, …)
 * и скульптура с операциями `add`, `remove`, `paint`, `mirrorX`.
 * Центр ячейки (x, y, z) — точка с целыми координатами x, y, z.
 */
export type Region = (x: number, y: number, z: number) => boolean;
export type Vec3 = readonly [number, number, number];

/** Параллелепипед с включительными целыми границами. */
export function box(min: Vec3, max: Vec3): Region {
  return (x, y, z) =>
    x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
}

/** Шар: центр может быть дробным (например, 4.5 для чётной стороны). */
export function sphere(center: Vec3, r: number): Region {
  const r2 = r * r;
  return (x, y, z) => {
    const dx = x - center[0];
    const dy = y - center[1];
    const dz = z - center[2];
    return dx * dx + dy * dy + dz * dz <= r2 + 1e-9;
  };
}

/** Эллипсоид с полуосями `radii`. */
export function ellipsoid(center: Vec3, radii: Vec3): Region {
  return (x, y, z) => {
    const dx = (x - center[0]) / radii[0];
    const dy = (y - center[1]) / radii[1];
    const dz = (z - center[2]) / radii[2];
    return dx * dx + dy * dy + dz * dz <= 1 + 1e-9;
  };
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/**
 * Цилиндр вдоль оси `axis` от `from` до `to` (включительно).
 * `center` — координаты центра по двум другим осям в порядке x, y, z.
 */
export function cylinder(
  axis: Axis | 'x' | 'y' | 'z',
  center: readonly [number, number],
  r: number,
  from: number,
  to: number,
): Region {
  const a = typeof axis === 'string' ? AXIS_INDEX[axis] : axis;
  const r2 = r * r;
  return (x, y, z) => {
    const p = [x, y, z] as const;
    const t = p[a];
    if (t < from || t > to) return false;
    const u = a === 0 ? y : x;
    const v = a === 2 ? y : z;
    const du = u - center[0];
    const dv = v - center[1];
    return du * du + dv * dv <= r2 + 1e-9;
  };
}

export function union(...rs: Region[]): Region {
  return (x, y, z) => rs.some((r) => r(x, y, z));
}

export function intersect(...rs: Region[]): Region {
  return (x, y, z) => rs.every((r) => r(x, y, z));
}

export function subtract(a: Region, b: Region): Region {
  return (x, y, z) => a(x, y, z) && !b(x, y, z);
}

/** Одна ячейка. */
export function cell(x: number, y: number, z: number): Region {
  return (px, py, pz) => px === x && py === y && pz === z;
}

/** Фигура на сетке: индекс цвета палитры на ячейку, 0 — пусто. */
export class Sculpture {
  readonly grid: Grid;
  readonly data: Uint8Array;

  constructor(readonly size: Size3) {
    this.grid = new Grid(size);
    this.data = new Uint8Array(this.grid.cellCount);
  }

  private each(region: Region, fn: (i: number) => void): this {
    const { X, Y, Z } = this.grid;
    for (let z = 0; z < Z; z++) {
      for (let y = 0; y < Y; y++) {
        for (let x = 0; x < X; x++) if (region(x, y, z)) fn(this.grid.index(x, y, z));
      }
    }
    return this;
  }

  /** Заполнить область цветом. */
  add(region: Region, color = 1): this {
    return this.each(region, (i) => (this.data[i] = color));
  }

  /** Убрать кубы в области. */
  remove(region: Region): this {
    return this.each(region, (i) => (this.data[i] = 0));
  }

  /** Перекрасить уже существующие кубы в области. */
  paint(region: Region, color: number): this {
    return this.each(region, (i) => {
      if (this.data[i]) this.data[i] = color;
    });
  }

  /** Отразить левую половину (x < X/2) на правую. */
  mirrorX(): this {
    const { X, Y, Z } = this.grid;
    for (let z = 0; z < Z; z++) {
      for (let y = 0; y < Y; y++) {
        for (let x = 0; x < Math.floor(X / 2); x++) {
          this.data[this.grid.index(X - 1 - x, y, z)] = this.data[this.grid.index(x, y, z)]!;
        }
      }
    }
    return this;
  }

  get(x: number, y: number, z: number): number {
    return this.grid.contains(x, y, z) ? this.data[this.grid.index(x, y, z)]! : 0;
  }

  count(): number {
    let c = 0;
    for (const v of this.data) if (v) c++;
    return c;
  }

  cells(): Uint8Array {
    return this.data.slice();
  }
}

/**
 * Разбор фигуры из «слоёв» ASCII: `layers[y]` — строки по z (сверху — дальний
 * ряд z = Z-1), символы по x. `.` или пробел — пусто, иначе — цвет по `legend`.
 * Слои перечисляются снизу вверх (y = 0 первым).
 */
export function fromLayers(layers: string[][], legend: Record<string, number>): Sculpture {
  const Y = layers.length;
  const Z = layers[0]!.length;
  const X = layers[0]![0]!.length;
  const s = new Sculpture([X, Y, Z]);
  layers.forEach((rows, y) => {
    if (rows.length !== Z) throw new Error(`layer ${y}: expected ${Z} rows`);
    rows.forEach((row, r) => {
      if (row.length !== X) throw new Error(`layer ${y} row ${r}: expected ${X} chars`);
      const z = Z - 1 - r;
      for (let x = 0; x < X; x++) {
        const ch = row[x]!;
        if (ch === '.' || ch === ' ') continue;
        const color = legend[ch];
        if (color === undefined) throw new Error(`unknown symbol "${ch}"`);
        s.data[s.grid.index(x, y, z)] = color;
      }
    });
  });
  return s;
}
