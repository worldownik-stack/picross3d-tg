import type { Grid } from './grid';
import type { Axis } from './types';

/**
 * Срез (§2.7): скрывает `depth` внешних слоёв вдоль одной оси со стороны `side`.
 * Одновременно активен срез только по одной оси.
 */
export interface SliceState {
  axis: Axis | null;
  /** +1 — слои с максимальной координатой, −1 — с минимальной. */
  side: 1 | -1;
  depth: number;
}

export const NO_SLICE: Readonly<SliceState> = { axis: null, side: 1, depth: 0 };

/** Максимальная глубина среза: хотя бы один слой остаётся видимым. */
export function maxSliceDepth(grid: Grid, axis: Axis): number {
  return grid.size[axis] - 1;
}

export function clampSlice(grid: Grid, s: SliceState): SliceState {
  if (s.axis === null) return { ...NO_SLICE };
  const depth = Math.max(0, Math.min(maxSliceDepth(grid, s.axis), Math.round(s.depth)));
  return depth === 0 ? { axis: s.axis, side: s.side, depth: 0 } : { ...s, depth };
}

/** Скрыта ли ячейка срезом. */
export function isSliced(grid: Grid, s: SliceState, i: number): boolean {
  if (s.axis === null || s.depth <= 0) return false;
  const c = grid.coord(i, s.axis);
  return s.side > 0 ? c >= grid.size[s.axis] - s.depth : c < s.depth;
}

/** Видимый диапазон координат по оси среза [lo, hi]. */
export function visibleRange(grid: Grid, s: SliceState, axis: Axis): [number, number] {
  const n = grid.size[axis];
  if (s.axis !== axis || s.depth <= 0) return [0, n - 1];
  return s.side > 0 ? [0, n - 1 - s.depth] : [s.depth, n - 1];
}
