import type { Grid } from './grid';
import type { Axis, Ruleset } from './types';

/**
 * Тип подсказки (§2.4): 1 — одна непрерывная группа (или ноль),
 * 2 — ровно две группы («кружок»), 3 — три и больше («квадрат»).
 */
export type GroupClass = 1 | 2 | 3;
export const GROUPS_ONE: GroupClass = 1;
export const GROUPS_TWO: GroupClass = 2;
export const GROUPS_MANY: GroupClass = 3;

/** Часть подсказки: число кубов цвета `color` в линии и тип группировки. */
export interface CluePart {
  readonly color: number;
  readonly count: number;
  readonly groups: GroupClass;
}

/** Подсказка линии — список частей. В classic часть ровно одна (цвет 1). */
export interface LineClue {
  readonly parts: readonly CluePart[];
}

export function groupClassOf(runs: number): GroupClass {
  return runs <= 1 ? GROUPS_ONE : runs === 2 ? GROUPS_TWO : GROUPS_MANY;
}

/** Считает кубы класса `color` и число их серий в линии. */
function scanLine(
  grid: Grid,
  classes: Uint8Array,
  g: number,
  color: number,
): { count: number; runs: number } {
  const axis = grid.lineAxis[g] as Axis;
  const n = grid.size[axis];
  const d = grid.strides[axis];
  let i = grid.lineStart[g]!;
  let count = 0;
  let runs = 0;
  let prev = false;
  for (let k = 0; k < n; k++, i += d) {
    const on = color === 0 ? classes[i]! > 0 : classes[i] === color;
    if (on) {
      count++;
      if (!prev) runs++;
    }
    prev = on;
  }
  return { count, runs };
}

/**
 * Подсказки всех линий из решения. Подсказки не хранятся в файле уровня —
 * всегда вычисляются из клеток (§5.1).
 *
 * @param classes класс ячейки решения: 0 — пусто, ≥1 — класс (цвет) куба.
 */
export function computeClues(grid: Grid, classes: Uint8Array, ruleset: Ruleset): LineClue[] {
  const out: LineClue[] = new Array<LineClue>(grid.totalLines);
  for (let g = 0; g < grid.totalLines; g++) {
    if (ruleset === 'classic') {
      const { count, runs } = scanLine(grid, classes, g, 0);
      out[g] = { parts: [{ color: 1, count, groups: groupClassOf(runs) }] };
    } else {
      const parts: CluePart[] = [];
      for (let c = 1; c <= 2; c++) {
        const { count, runs } = scanLine(grid, classes, g, c);
        if (count > 0) parts.push({ color: c, count, groups: groupClassOf(runs) });
      }
      if (parts.length === 0) parts.push({ color: 1, count: 0, groups: GROUPS_ONE });
      out[g] = { parts };
    }
  }
  return out;
}

/** Классы ячеек решения для classic: `cells > 0` → 1. */
export function classicClasses(cells: Uint8Array): Uint8Array {
  const out = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) out[i] = cells[i]! > 0 ? 1 : 0;
  return out;
}
