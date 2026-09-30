import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/core/grid';
import { pickVoxel } from '../../src/core/pick';
import { mulberry32 } from '../../src/core/rng';

const grid = new Grid([4, 3, 5]);
const all = () => true;

/** Эталон: мелкий шаг вдоль луча. */
function march(o: number[], d: number[], solid: (i: number) => boolean): number | null {
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  for (let t = 0; t < 40; t += 0.0005) {
    const p = [o[0]! + (d[0]! * t) / len, o[1]! + (d[1]! * t) / len, o[2]! + (d[2]! * t) / len];
    const c = p.map(Math.floor);
    if (grid.contains(c[0]!, c[1]!, c[2]!)) {
      const i = grid.index(c[0]!, c[1]!, c[2]!);
      if (solid(i)) return i;
    }
  }
  return null;
}

describe('pickVoxel (DDA)', () => {
  it('луч в лоб попадает в ближнюю ячейку и даёт нормаль грани', () => {
    const hit = pickVoxel(grid, 1.5, 1.5, 10, 0, 0, -1, all)!;
    expect(grid.coords(hit.cell)).toEqual([1, 1, 4]);
    expect([hit.axis, hit.sign]).toEqual([2, 1]);
    expect(hit.t).toBeCloseTo(5);
    const fromLeft = pickVoxel(grid, -3, 0.5, 0.5, 1, 0, 0, all)!;
    expect(grid.coords(fromLeft.cell)).toEqual([0, 0, 0]);
    expect([fromLeft.axis, fromLeft.sign]).toEqual([0, -1]);
    const fromTop = pickVoxel(grid, 2.5, 9, 2.5, 0, -1, 0, all)!;
    expect([fromTop.axis, fromTop.sign]).toEqual([1, 1]);
    expect(grid.coords(fromTop.cell)).toEqual([2, 2, 2]);
  });

  it('пропускает сломанные/скрытые ячейки, нормаль — грань входа во внутреннюю', () => {
    const solid = (i: number) => grid.z(i) < 3;
    const hit = pickVoxel(grid, 1.5, 1.5, 10, 0, 0, -1, solid)!;
    expect(grid.coords(hit.cell)).toEqual([1, 1, 2]);
    expect([hit.axis, hit.sign]).toEqual([2, 1]);
    const up = pickVoxel(grid, 0.5, -2, 0.5, 0, 1, 0, (i) => grid.y(i) === 2)!;
    expect(grid.coords(up.cell)).toEqual([0, 2, 0]);
    expect([up.axis, up.sign]).toEqual([1, -1]);
  });

  it('промах мимо блока и сквозь пустоту', () => {
    expect(pickVoxel(grid, 10, 10, 10, 1, 0, 0, all)).toBeNull();
    expect(pickVoxel(grid, -1, 0.5, 0.5, -1, 0, 0, all)).toBeNull();
    expect(pickVoxel(grid, 5, 0.5, 0.5, 0, 0, 1, all)).toBeNull(); // параллельно вне плиты
    expect(pickVoxel(grid, 1.5, 1.5, 10, 0, 0, -1, () => false)).toBeNull();
    expect(pickVoxel(grid, -1, -1, -1, 1, 1, 1, () => false)).toBeNull();
  });

  it('старт внутри блока', () => {
    const hit = pickVoxel(grid, 1.5, 1.5, 2.5, 1, 0, 0, (i) => grid.x(i) === 3)!;
    expect(grid.coords(hit.cell)).toEqual([3, 1, 2]);
    expect([hit.axis, hit.sign]).toEqual([0, -1]);
  });

  it('совпадает с мелким шагом на случайных лучах', () => {
    const rng = mulberry32(99);
    const holes = new Uint8Array(grid.cellCount).map(() => (rng() < 0.6 ? 0 : 1));
    const solid = (i: number) => holes[i] === 1;
    let hits = 0;
    for (let k = 0; k < 400; k++) {
      const o = [rng() * 16 - 6, rng() * 14 - 5, rng() * 17 - 6];
      const target = [rng() * 4, rng() * 3, rng() * 5];
      const d = [target[0]! - o[0]!, target[1]! - o[1]!, target[2]! - o[2]!];
      const hit = pickVoxel(grid, o[0]!, o[1]!, o[2]!, d[0]!, d[1]!, d[2]!, solid);
      const ref = march(o, d, solid);
      expect(hit?.cell ?? null).toBe(ref);
      if (hit) hits++;
    }
    expect(hits).toBeGreaterThan(100);
  });
});
