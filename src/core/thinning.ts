import type { GroupClass } from './clues';
import { hiddenCount, withHidden, type Puzzle } from './puzzle';
import { rngFromString, shuffle } from './rng';
import { isLogicSolvable } from './solver';

export interface ThinOptions {
  /** Зерно порядка перебора (id уровня). */
  seed: string;
  /** Целевая доля скрытых подсказок, 0..1. */
  targetHidden: number;
  /**
   * Типы подсказок, которые пробуем скрыть в первую очередь — все, без учёта
   * целевой доли (в ранних наборах кружки/квадраты вводятся постепенно, §5.3).
   */
  hideFirst?: readonly GroupClass[];
  /** Линии, которые нельзя скрывать. */
  keepVisible?: (line: number) => boolean;
}

export interface ThinResult {
  puzzle: Puzzle;
  hidden: Uint8Array;
  hiddenRatio: number;
  /** Сколько подсказок из `hideFirst` осталось видимыми. */
  remainingFirst: number;
  /** Сколько проверок решаемости понадобилось. */
  attempts: number;
}

function clueClass(p: Puzzle, g: number): GroupClass {
  return p.clues[g]!.parts[0]!.groups;
}

/**
 * Прореживание подсказок (§5.3): в детерминированном случайном порядке
 * пробуем скрыть по одной; скрытие остаётся, только если уровень по-прежнему
 * решается логикой. Останавливаемся на целевой доле.
 */
export function thinClues(p: Puzzle, opts: ThinOptions): ThinResult {
  if (!isLogicSolvable(p)) throw new Error('puzzle is not logic-solvable before thinning');
  const total = p.grid.totalLines;
  const hidden = p.hidden.slice();
  const rng = rngFromString(opts.seed);
  const order = shuffle(
    Array.from({ length: total }, (_, g) => g),
    rng,
  );
  const first = new Set<GroupClass>(opts.hideFirst ?? []);
  const canHide = (g: number) => !hidden[g] && !(opts.keepVisible?.(g) ?? false);
  let count = hiddenCount(p);
  let attempts = 0;

  const tryHide = (g: number): boolean => {
    hidden[g] = 1;
    attempts++;
    if (isLogicSolvable(withHidden(p, hidden))) {
      count++;
      return true;
    }
    hidden[g] = 0;
    return false;
  };

  if (first.size > 0) {
    for (const g of order) if (canHide(g) && first.has(clueClass(p, g))) tryHide(g);
  }
  const target = Math.min(1, Math.max(0, opts.targetHidden)) * total;
  for (const g of order) {
    if (count >= target) break;
    if (canHide(g)) tryHide(g);
  }

  let remainingFirst = 0;
  for (let g = 0; g < total; g++) {
    if (!hidden[g] && first.has(clueClass(p, g))) remainingFirst++;
  }
  return {
    puzzle: withHidden(p, hidden),
    hidden,
    hiddenRatio: count / total,
    remainingFirst,
    attempts,
  };
}
