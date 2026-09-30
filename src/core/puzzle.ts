import { computeClues, type LineClue } from './clues';
import { Grid } from './grid';
import type { Ruleset, Size3 } from './types';

/** Головоломка: геометрия, подсказки всех линий и маска скрытых подсказок. */
export interface Puzzle {
  readonly grid: Grid;
  readonly ruleset: Ruleset;
  /** Класс ячейки решения (0 — пусто). */
  readonly classes: Uint8Array;
  /** Подсказка каждой глобальной линии (вычислена из решения). */
  readonly clues: readonly LineClue[];
  /** 1 — подсказка линии скрыта (пустая грань). По глобальному номеру линии. */
  readonly hidden: Uint8Array;
}

export function makePuzzle(
  size: Size3 | Grid,
  classes: Uint8Array,
  ruleset: Ruleset = 'classic',
  hidden?: Uint8Array,
): Puzzle {
  const grid = size instanceof Grid ? size : new Grid(size);
  if (classes.length !== grid.cellCount) {
    throw new Error(`classes length ${classes.length} != ${grid.cellCount}`);
  }
  const h = hidden ?? new Uint8Array(grid.totalLines);
  if (h.length !== grid.totalLines) throw new Error('hidden length mismatch');
  return { grid, ruleset, classes, clues: computeClues(grid, classes, ruleset), hidden: h };
}

/** Копия головоломки с другой маской скрытых подсказок. */
export function withHidden(p: Puzzle, hidden: Uint8Array): Puzzle {
  return { ...p, hidden };
}

export function hiddenCount(p: Puzzle): number {
  let c = 0;
  for (let g = 0; g < p.hidden.length; g++) c += p.hidden[g]! ? 1 : 0;
  return c;
}
