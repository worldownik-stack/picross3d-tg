import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/core/grid';
import { clampSlice, isSliced, maxSliceDepth, NO_SLICE, visibleRange } from '../../src/core/slice';

describe('slice', () => {
  const g = new Grid([4, 3, 5]);
  it('скрывает внешние слои с выбранной стороны', () => {
    const s = { axis: 2 as const, side: 1 as const, depth: 2 };
    expect(isSliced(g, s, g.index(0, 0, 4))).toBe(true);
    expect(isSliced(g, s, g.index(0, 0, 3))).toBe(true);
    expect(isSliced(g, s, g.index(0, 0, 2))).toBe(false);
    const m = { axis: 0 as const, side: -1 as const, depth: 1 };
    expect(isSliced(g, m, g.index(0, 1, 1))).toBe(true);
    expect(isSliced(g, m, g.index(1, 1, 1))).toBe(false);
    expect(isSliced(g, NO_SLICE, 0)).toBe(false);
    expect(visibleRange(g, s, 2)).toEqual([0, 2]);
    expect(visibleRange(g, m, 0)).toEqual([1, 3]);
    expect(visibleRange(g, s, 0)).toEqual([0, 3]);
  });
  it('ограничение глубины', () => {
    expect(maxSliceDepth(g, 1)).toBe(2);
    expect(clampSlice(g, { axis: 1, side: 1, depth: 9 }).depth).toBe(2);
    expect(clampSlice(g, { axis: 1, side: 1, depth: -3 }).depth).toBe(0);
    expect(clampSlice(g, { axis: null, side: -1, depth: 3 })).toEqual(NO_SLICE);
    expect(clampSlice(g, { axis: 0, side: 1, depth: 1.6 }).depth).toBe(2);
  });
});
