import { describe, expect, it } from 'vitest';
import { makePuzzle, hiddenCount, withHidden } from '../../src/core/puzzle';
import { computeClues, classicClasses, groupClassOf } from '../../src/core/clues';
import {
  countSolutions,
  countUnknown,
  emptyState,
  isLogicSolvable,
  propagate,
  solutionState,
  stepLine,
} from '../../src/core/solver';
import { Grid } from '../../src/core/grid';
import { BREAK, KEEP, UNKNOWN } from '../../src/core/types';
import { bruteForceCount, randomPuzzle } from './helpers';

describe('clues', () => {
  it('число и тип подсказки', () => {
    const grid = new Grid([6, 1, 1]);
    const cases: Array<[number[], number, number]> = [
      [[0, 0, 0, 0, 0, 0], 0, 1],
      [[1, 1, 1, 0, 0, 0], 3, 1],
      [[1, 0, 1, 1, 0, 0], 3, 2],
      [[1, 0, 1, 0, 1, 1], 4, 3],
      [[1, 0, 1, 0, 1, 0], 3, 3],
    ];
    for (const [cells, count, groups] of cases) {
      const clues = computeClues(grid, Uint8Array.from(cells), 'classic');
      expect(clues[0]!.parts).toEqual([{ color: 1, count, groups }]);
    }
    expect(groupClassOf(0)).toBe(1);
    expect(groupClassOf(5)).toBe(3);
  });

  it('dual: части по цветам (задел под Round 2)', () => {
    const grid = new Grid([5, 1, 1]);
    const clues = computeClues(grid, Uint8Array.from([1, 2, 2, 0, 1]), 'dual');
    expect(clues[0]!.parts).toEqual([
      { color: 1, count: 2, groups: 2 },
      { color: 2, count: 2, groups: 1 },
    ]);
    const empty = computeClues(grid, new Uint8Array(5), 'dual');
    expect(empty[0]!.parts).toEqual([{ color: 1, count: 0, groups: 1 }]);
    expect(Array.from(classicClasses(Uint8Array.from([0, 3, 1])))).toEqual([0, 1, 1]);
  });

  it('makePuzzle проверяет размеры', () => {
    expect(() => makePuzzle([2, 2, 2], new Uint8Array(7))).toThrow();
    expect(() => makePuzzle([2, 2, 2], new Uint8Array(8), 'classic', new Uint8Array(3))).toThrow();
    const p = makePuzzle([2, 2, 2], new Uint8Array(8));
    expect(hiddenCount(p)).toBe(0);
    const h = new Uint8Array(p.grid.totalLines);
    h[3] = 1;
    expect(hiddenCount(withHidden(p, h))).toBe(1);
  });
});

describe('propagate', () => {
  it('полный куб и пустое поле решаются за один раунд', () => {
    const full = makePuzzle([3, 3, 3], new Uint8Array(27).fill(1));
    const r = propagate(full, emptyState(full));
    expect(r.status).toBe('solved');
    expect(r.rounds).toBe(1);
    const empty = makePuzzle([3, 3, 3], new Uint8Array(27));
    expect(isLogicSolvable(empty)).toBe(true);
  });

  it('известная головоломка: «ступенька» 3×3×1 с журналом', () => {
    // y=0: ###, y=1: ##., y=2: #..
    const cells = Uint8Array.from([1, 1, 1, 1, 1, 0, 1, 0, 0]);
    const p = makePuzzle([3, 3, 1], cells);
    const state = emptyState(p);
    const r = propagate(p, state, { trace: true });
    expect(r.status).toBe('solved');
    expect(Array.from(state)).toEqual(Array.from(solutionState(p)));
    expect(r.trace!.length).toBe(r.rounds);
    expect(r.lineSteps).toBeGreaterThan(0);
    expect(r.lineVisits).toBeGreaterThanOrEqual(r.lineSteps);
    const deduced = r.trace!.flat().flatMap((d) => [...d.keep, ...d.break]);
    expect(new Set(deduced).size).toBe(9);
    for (const d of r.trace!.flat()) {
      for (const i of d.keep) expect(cells[i]).toBe(1);
      for (const i of d.break) expect(cells[i]).toBe(0);
    }
  });

  it('раунды с одной продвинувшейся линией считаются', () => {
    // Цепочка выводов «змейкой» даёт узкие места.
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const p = randomPuzzle([4, 4, 3], seed, 0.5, 0.45);
      const r = propagate(p, emptyState(p));
      if (r.status === 'solved' && r.singleLineRounds > 0) found = true;
    }
    expect(found).toBe(true);
  });

  it('противоречие при неверном знании', () => {
    const p = makePuzzle([3, 1, 1], Uint8Array.from([1, 1, 1]));
    const state = Uint8Array.from([BREAK, UNKNOWN, UNKNOWN]);
    const r = propagate(p, state);
    expect(r.status).toBe('contradiction');
    expect(r.unknown).toBe(2);
  });

  it('скрытые подсказки ничего не ограничивают', () => {
    const p = makePuzzle([3, 1, 1], Uint8Array.from([1, 0, 1]));
    const allHidden = withHidden(p, new Uint8Array(p.grid.totalLines).fill(1));
    const r = propagate(allHidden, emptyState(allHidden));
    expect(r.status).toBe('stuck');
    expect(r.lineVisits).toBe(0);
    expect(countUnknown(emptyState(p))).toBe(3);
  });

  it('stepLine: одна линия и противоречие', () => {
    const p = makePuzzle([4, 1, 1], Uint8Array.from([1, 1, 1, 0]));
    const s = emptyState(p);
    expect(stepLine(p, s, 0)).toEqual([1, 2]);
    expect(Array.from(s)).toEqual([UNKNOWN, KEEP, KEEP, UNKNOWN]);
    expect(stepLine(p, s, 0)).toEqual([]);
    const bad = Uint8Array.from([BREAK, BREAK, UNKNOWN, UNKNOWN]);
    expect(stepLine(p, bad, 0)).toBeNull();
  });

  it('dirty: пропагация только от указанных линий', () => {
    const p = makePuzzle([3, 3, 1], new Uint8Array(9).fill(1));
    const s = emptyState(p);
    const r = propagate(p, s, { dirty: [] });
    expect(r.lineVisits).toBe(0);
    expect(r.status).toBe('stuck');
  });
});

describe('countSolutions', () => {
  it('совпадает с полным перебором на малых полях', () => {
    const sizes: Array<[number, number, number]> = [
      [2, 2, 2],
      [3, 2, 2],
      [2, 3, 2],
      [3, 3, 1],
      [4, 3, 1],
    ];
    let checked = 0;
    let multi = 0;
    for (const size of sizes) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = randomPuzzle(size, seed * 7 + size[0], 0.5, (seed % 5) * 0.15);
        const brute = bruteForceCount(p);
        expect(countSolutions(p, 1000), `${size} seed ${seed}`).toBe(brute);
        expect(countSolutions(p, 2)).toBe(Math.min(2, brute));
        if (isLogicSolvable(p)) expect(brute).toBe(1);
        if (brute > 1) multi++;
        checked++;
      }
    }
    expect(checked).toBe(200);
    expect(multi).toBeGreaterThan(10);
  });

  it('0 решений при противоречивом старте и лимит', () => {
    const p = makePuzzle([2, 2, 1], Uint8Array.from([1, 0, 0, 1]));
    const bad = Uint8Array.from([BREAK, UNKNOWN, UNKNOWN, UNKNOWN]);
    expect(countSolutions(p, 2, bad)).toBe(0);
    // Все подсказки скрыты: 2^4 решений, перебор останавливается на лимите.
    const free = withHidden(p, new Uint8Array(p.grid.totalLines).fill(1));
    expect(countSolutions(free, 5)).toBe(5);
    expect(countSolutions(free, 100)).toBe(16);
  });

  it('диагональ 2×2×1 — классическая неоднозначность', () => {
    const p = makePuzzle([2, 2, 1], Uint8Array.from([1, 0, 0, 1]));
    const onlyXY = new Uint8Array(p.grid.totalLines);
    for (let g = p.grid.lineOffset[2]; g < p.grid.totalLines; g++) onlyXY[g] = 1;
    const q = withHidden(p, onlyXY);
    expect(isLogicSolvable(q)).toBe(false);
    expect(countSolutions(q)).toBe(2);
  });
});

describe('countSolutions: перебор с возвратом', () => {
  it('единственное решение, которое не выводится логикой линий', () => {
    // 4×4×1, подсказки вдоль Z скрыты: линии X и Y не дают продвинуться, но решение одно.
    const cells = Uint8Array.from([1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1]);
    const p = makePuzzle([4, 4, 1], cells);
    const hidden = new Uint8Array(p.grid.totalLines);
    hidden.fill(1, p.grid.lineOffset[2]);
    const q = withHidden(p, hidden);
    expect(isLogicSolvable(q)).toBe(false);
    expect(countSolutions(q, 2)).toBe(1);
    expect(bruteForceCount(q)).toBe(1);
  });
});

describe('propagate: послойный режим', () => {
  it('даёт то же решение, раундов не меньше, журнал по раундам', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = randomPuzzle([4, 4, 3], seed, 0.5, 0.2);
      const a = emptyState(p);
      const b = emptyState(p);
      const ra = propagate(p, a);
      const rb = propagate(p, b, { layered: true, trace: true });
      expect(rb.status).toBe(ra.status);
      expect(Array.from(b)).toEqual(Array.from(a));
      expect(rb.rounds).toBeGreaterThanOrEqual(ra.rounds);
      expect(rb.trace!).toHaveLength(rb.rounds);
    }
    const full = makePuzzle([3, 3, 3], new Uint8Array(27).fill(1));
    const r = propagate(full, emptyState(full), { layered: true });
    expect(r.status).toBe('solved');
    expect(r.rounds).toBe(1);
    expect(r.lineSteps).toBe(9); // линии Y и Z выводят то, что уже применено линиями X
  });

  it('противоречие между линиями одного раунда', () => {
    const p = makePuzzle([2, 2, 1], Uint8Array.from([1, 0, 0, 0]));
    const clues = [...p.clues];
    clues[0] = { parts: [{ color: 1, count: 2, groups: 1 }] }; // ряд y=0: оба куба
    clues[p.grid.lineOffset[1]] = { parts: [{ color: 1, count: 0, groups: 1 }] }; // столбец x=0: пусто
    const bad = { ...p, clues };
    expect(propagate(bad, emptyState(bad), { layered: true }).status).toBe('contradiction');
    expect(propagate(bad, emptyState(bad)).status).toBe('contradiction');
  });

  it('противоречие линии со снимком', () => {
    const p = makePuzzle([3, 1, 1], Uint8Array.from([1, 1, 1]));
    const r = propagate(p, Uint8Array.from([BREAK, UNKNOWN, UNKNOWN]), { layered: true });
    expect(r.status).toBe('contradiction');
  });
});
