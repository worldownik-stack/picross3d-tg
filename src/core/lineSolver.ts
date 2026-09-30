import type { LineClue } from './clues';
import { BREAK, KEEP, type Ruleset } from './types';

/**
 * Решатель одной линии: по подсказке и текущему знанию о ячейках линии
 * (битовые множества допустимых классов) уточняет знание.
 */
export interface LineSolver {
  /**
   * @param cells знание о ячейках линии (длина `n`)
   * @param out   уточнённое знание (может совпадать с `cells`)
   * @returns false, если подсказка противоречит знанию
   */
  solve(clue: LineClue, n: number, cells: Uint8Array, out: Uint8Array): boolean;
}

/** Максимальная длина линии для перебора масок (2^n масок на длину). */
export const MAX_MASK_LINE = 24;

/** Кэш: для длины n — корзины масок по (count, groupClass). */
const buckets: Array<Array<Uint32Array[]> | undefined> = [];

function runsOf(mask: number): number {
  // Начала серий: бит установлен, а предыдущий (младший) — нет.
  let starts = (mask & ~(mask << 1)) >>> 0;
  let c = 0;
  while (starts) {
    starts &= starts - 1;
    c++;
  }
  return c;
}

function popcount(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

function buildBuckets(n: number): Array<Uint32Array[]> {
  if (!Number.isInteger(n) || n < 0 || n > MAX_MASK_LINE) {
    throw new Error(`line length ${n} is out of range 0..${MAX_MASK_LINE}`);
  }
  const lists: number[][][] = [];
  for (let c = 0; c <= n; c++) lists.push([[], [], [], []]);
  const total = 2 ** n;
  for (let m = 0; m < total; m++) {
    const cls = Math.min(3, Math.max(1, runsOf(m)));
    lists[popcount(m)]![cls]!.push(m);
  }
  return lists.map((byClass) => byClass.map((arr) => Uint32Array.from(arr)));
}

/**
 * Все маски длины `n` с `count` единицами и заданным типом группировки
 * (1 — одна серия или ноль, 2 — две серии, 3 — три и больше). Кэшируется.
 */
export function masksFor(n: number, count: number, groups: number): Uint32Array {
  let b = buckets[n];
  if (!b) {
    b = buildBuckets(n);
    buckets[n] = b;
  }
  if (count < 0 || count > n || groups < 1 || groups > 3) return EMPTY;
  return b[count]![groups]!;
}

const EMPTY = new Uint32Array(0);

/** Классический решатель линии: фильтрация кэшированных масок (§5.2). */
export const classicLineSolver: LineSolver = {
  solve(clue, n, cells, out) {
    const part = clue.parts[0]!;
    const masks = masksFor(n, part.count, part.groups);
    let keep = 0;
    let brk = 0;
    for (let k = 0; k < n; k++) {
      const c = cells[k]!;
      if (c === KEEP) keep |= 1 << k;
      else if (c === BREAK) brk |= 1 << k;
      else if (c === 0) return false;
    }
    let all = 0xffffffff;
    let any = 0;
    let found = false;
    for (let j = 0; j < masks.length; j++) {
      const m = masks[j]!;
      if ((m & brk) !== 0 || (keep & ~m) !== 0) continue;
      all &= m;
      any |= m;
      found = true;
    }
    if (!found) return false;
    for (let k = 0; k < n; k++) {
      const bit = 1 << k;
      const possible = ((any & bit) !== 0 ? KEEP : 0) | ((all & bit) !== 0 ? 0 : BREAK);
      out[k] = cells[k]! & possible;
    }
    return true;
  },
};

/** Решатель линии по набору правил (§2, задел под Round 2). */
export function lineSolverFor(ruleset: Ruleset): LineSolver {
  if (ruleset === 'classic') return classicLineSolver;
  throw new Error(`ruleset "${ruleset}" is not supported yet`);
}
