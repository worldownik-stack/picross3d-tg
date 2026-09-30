import { describe, expect, it } from 'vitest';
import {
  classicLineSolver,
  lineSolverFor,
  masksFor,
  MAX_MASK_LINE,
} from '../../src/core/lineSolver';
import { groupClassOf, type LineClue } from '../../src/core/clues';
import { mulberry32 } from '../../src/core/rng';
import { BREAK, CONTRADICTION, KEEP, UNKNOWN } from '../../src/core/types';

const clue = (count: number, groups: number): LineClue => ({
  parts: [{ color: 1, count, groups: groups as 1 | 2 | 3 }],
});

function runs(m: number, n: number): number {
  let r = 0;
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const b = (m >> k) & 1;
    if (b && !prev) r++;
    prev = b;
  }
  return r;
}

function brute(n: number, count: number, groups: number, cells: Uint8Array): Uint8Array | null {
  let found = false;
  const out = new Uint8Array(n);
  for (let m = 0; m < 1 << n; m++) {
    let pc = 0;
    for (let k = 0; k < n; k++) pc += (m >> k) & 1;
    if (pc !== count || groupClassOf(runs(m, n)) !== groups) continue;
    let ok = true;
    for (let k = 0; k < n && ok; k++) {
      const bit = ((m >> k) & 1 ? KEEP : BREAK) & cells[k]!;
      ok = bit !== 0;
    }
    if (!ok) continue;
    found = true;
    for (let k = 0; k < n; k++) out[k]! |= (m >> k) & 1 ? KEEP : BREAK;
  }
  return found ? out : null;
}

describe('masksFor', () => {
  it('комбинаторика для n = 5', () => {
    expect(Array.from(masksFor(5, 0, 1))).toEqual([0]);
    expect(masksFor(5, 0, 2)).toHaveLength(0);
    expect(Array.from(masksFor(5, 5, 1))).toEqual([31]);
    expect(masksFor(5, 2, 1)).toHaveLength(4);
    expect(masksFor(5, 2, 2)).toHaveLength(6);
    expect(masksFor(5, 3, 3)).toHaveLength(1); // 10101
    let total = 0;
    for (let c = 0; c <= 5; c++) for (let g = 1; g <= 3; g++) total += masksFor(5, c, g).length;
    expect(total).toBe(32);
  });

  it('кэшируется и возвращает пустой список для невозможных подсказок', () => {
    expect(masksFor(6, 3, 2)).toBe(masksFor(6, 3, 2));
    expect(masksFor(6, 7, 1)).toHaveLength(0);
    expect(masksFor(6, -1, 1)).toHaveLength(0);
    expect(masksFor(6, 2, 0)).toHaveLength(0);
    expect(masksFor(6, 2, 4)).toHaveLength(0);
  });

  it('длина линии 15 поддерживается, слишком длинная — ошибка', () => {
    expect(masksFor(15, 7, 1)).toHaveLength(9);
    expect(masksFor(0, 0, 1)).toHaveLength(1);
    expect(() => masksFor(MAX_MASK_LINE + 1, 1, 1)).toThrow();
    expect(() => masksFor(2.5, 1, 1)).toThrow();
  });
});

describe('classicLineSolver', () => {
  it('совпадает с полным перебором на случайных состояниях (n ≤ 7)', () => {
    const rng = mulberry32(42);
    const states = [UNKNOWN, UNKNOWN, UNKNOWN, KEEP, BREAK];
    for (let iter = 0; iter < 3000; iter++) {
      const n = 1 + Math.floor(rng() * 7);
      const cells = new Uint8Array(n);
      for (let k = 0; k < n; k++) cells[k] = states[Math.floor(rng() * states.length)]!;
      const count = Math.floor(rng() * (n + 1));
      const groups = 1 + Math.floor(rng() * 3);
      const out = new Uint8Array(n);
      const ok = classicLineSolver.solve(clue(count, groups), n, cells, out);
      const expected = brute(n, count, groups, cells);
      if (expected === null) {
        expect(ok).toBe(false);
      } else {
        expect(ok).toBe(true);
        expect(Array.from(out)).toEqual(Array.from(expected).map((v, k) => v & cells[k]!));
      }
    }
  });

  it('классические выводы: 0, полная линия, перекрытие', () => {
    const out = new Uint8Array(5);
    const u = new Uint8Array(5).fill(UNKNOWN);
    expect(classicLineSolver.solve(clue(0, 1), 5, u, out)).toBe(true);
    expect(Array.from(out)).toEqual([BREAK, BREAK, BREAK, BREAK, BREAK]);
    classicLineSolver.solve(clue(5, 1), 5, u, out);
    expect(Array.from(out)).toEqual([KEEP, KEEP, KEEP, KEEP, KEEP]);
    classicLineSolver.solve(clue(4, 1), 5, u, out);
    expect(Array.from(out)).toEqual([UNKNOWN, KEEP, KEEP, KEEP, UNKNOWN]);
    // Кружок 4 в линии 5: единственный вариант с пробелом внутри неизвестен, но края — KEEP.
    classicLineSolver.solve(clue(4, 2), 5, u, out);
    expect([out[0], out[4]]).toEqual([KEEP, KEEP]);
  });

  it('противоречие: ячейка без вариантов или нет подходящих масок', () => {
    const out = new Uint8Array(3);
    expect(
      classicLineSolver.solve(
        clue(1, 1),
        3,
        Uint8Array.from([CONTRADICTION, UNKNOWN, UNKNOWN]),
        out,
      ),
    ).toBe(false);
    expect(
      classicLineSolver.solve(clue(3, 1), 3, Uint8Array.from([BREAK, UNKNOWN, UNKNOWN]), out),
    ).toBe(false);
  });

  it('решатель по ruleset', () => {
    expect(lineSolverFor('classic')).toBe(classicLineSolver);
    expect(() => lineSolverFor('dual')).toThrow(/not supported/);
  });
});
