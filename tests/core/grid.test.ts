import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/core/grid';
import type { Axis } from '../../src/core/types';

describe('Grid', () => {
  const g = new Grid([4, 3, 5]);

  it('размеры и число линий', () => {
    expect(g.cellCount).toBe(60);
    expect(g.lineCounts).toEqual([15, 20, 12]);
    expect(g.totalLines).toBe(3 * 5 + 4 * 5 + 4 * 3);
    expect(g.lineOffset).toEqual([0, 15, 35]);
  });

  it('индекс ↔ координаты по формуле i = x + X*(y + Y*z)', () => {
    for (let i = 0; i < g.cellCount; i++) {
      const [x, y, z] = g.coords(i);
      expect(x + 4 * (y + 3 * z)).toBe(i);
      expect(g.index(x, y, z)).toBe(i);
      expect([g.coord(i, 0), g.coord(i, 1), g.coord(i, 2)]).toEqual([x, y, z]);
    }
  });

  it('линии каждой оси разбивают все ячейки, lineOf согласован с lineCell', () => {
    for (const a of [0, 1, 2] as Axis[]) {
      const seen = new Set<number>();
      for (let l = 0; l < g.lineCounts[a]; l++) {
        const cells = g.lineCells(a, l);
        expect(cells).toHaveLength(g.lineLength(a));
        cells.forEach((i, k) => {
          expect(g.lineCell(a, l, k)).toBe(i);
          expect(g.lineOf(a, i)).toBe(l);
          expect(g.globalLineOf(a, i)).toBe(g.lineOffset[a] + l);
          expect(g.lineStart[g.lineOffset[a] + l]).toBe(cells[0]);
          expect(g.lineAxis[g.lineOffset[a] + l]).toBe(a);
          // Вдоль линии меняется только координата оси.
          const c0 = g.coords(cells[0]!);
          const c = g.coords(i);
          expect(c[a]).toBe(k);
          for (const b of [0, 1, 2] as Axis[]) if (b !== a) expect(c[b]).toBe(c0[b]);
          seen.add(i);
        });
      }
      expect(seen.size).toBe(g.cellCount);
    }
  });

  it('contains и ошибки размера', () => {
    expect(g.contains(0, 0, 0)).toBe(true);
    expect(g.contains(3, 2, 4)).toBe(true);
    expect(g.contains(4, 0, 0)).toBe(false);
    expect(g.contains(0, -1, 0)).toBe(false);
    expect(() => new Grid([0, 1, 1])).toThrow();
    expect(() => new Grid([1.5, 1, 1])).toThrow();
  });

  it('поле 15×15×15 без лимита в движке', () => {
    const big = new Grid([15, 15, 15]);
    expect(big.totalLines).toBe(675);
    expect(big.lineCell(2, 224, 14)).toBe(big.cellCount - 1);
  });
});
