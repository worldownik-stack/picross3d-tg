import type { Grid } from './grid';
import type { Axis } from './types';

export interface PickHit {
  cell: number;
  /** Ось нормали грани, через которую луч вошёл в ячейку. */
  axis: Axis;
  /** Направление нормали (+1/−1). */
  sign: 1 | -1;
  /** Параметр луча в точке входа. */
  t: number;
}

/**
 * Пикинг обходом сетки (Amanatides–Woo, §7). Луч задан в пространстве сетки:
 * блок занимает [0, X]×[0, Y]×[0, Z], ячейка (x, y, z) — единичный куб с углом
 * в (x, y, z). `solid(i)` — куб есть и не скрыт срезом.
 * Функция не аллоцирует, кроме результата.
 */
export function pickVoxel(
  grid: Grid,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  solid: (i: number) => boolean,
): PickHit | null {
  const size = grid.size;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  // Пересечение с коробкой (метод плит).
  let tMin = 0;
  let tMax = Infinity;
  let entryAxis: Axis = 0;
  let entrySign: 1 | -1 = 1;
  for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
    const oa = o[a]!;
    const da = d[a]!;
    if (Math.abs(da) < 1e-12) {
      if (oa < 0 || oa > size[a]) return null;
      continue;
    }
    let t0 = (0 - oa) / da;
    let t1 = (size[a] - oa) / da;
    let sign: 1 | -1 = -1; // вход через грань с минимальной координатой → нормаль −A
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      sign = 1;
    }
    if (t0 > tMin) {
      tMin = t0;
      entryAxis = a;
      entrySign = sign;
    }
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  const inside = tMin === 0;
  // Стартовая ячейка.
  const cell = [0, 0, 0];
  const step = [0, 0, 0];
  const tNext = [Infinity, Infinity, Infinity];
  const tDelta = [Infinity, Infinity, Infinity];
  for (let a = 0; a < 3; a++) {
    const p = o[a]! + d[a]! * tMin;
    let c = Math.floor(p);
    if (!inside && a === entryAxis) c = entrySign > 0 ? size[a]! - 1 : 0;
    cell[a] = Math.min(size[a]! - 1, Math.max(0, c));
    const da = d[a]!;
    if (da > 0) {
      step[a] = 1;
      tNext[a] = (cell[a]! + 1 - o[a]!) / da;
      tDelta[a] = 1 / da;
    } else if (da < 0) {
      step[a] = -1;
      tNext[a] = (cell[a]! - o[a]!) / da;
      tDelta[a] = -1 / da;
    }
  }
  let axis: Axis = entryAxis;
  let sign: 1 | -1 = entrySign;
  let t = tMin;
  for (let guard = 0; guard < size[0]! + size[1]! + size[2]! + 3; guard++) {
    const i = grid.index(cell[0]!, cell[1]!, cell[2]!);
    if (solid(i)) return { cell: i, axis, sign, t };
    // Следующая граница.
    let a: Axis = 0;
    if (tNext[1]! < tNext[a]!) a = 1;
    if (tNext[2]! < tNext[a]!) a = 2;
    t = tNext[a]!;
    if (t > tMax + 1e-9) return null;
    cell[a]! += step[a]!;
    if (cell[a]! < 0 || cell[a]! >= size[a]!) return null;
    tNext[a]! += tDelta[a]!;
    axis = a;
    sign = step[a]! > 0 ? -1 : 1;
  }
  return null;
}
