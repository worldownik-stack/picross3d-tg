import { describe, expect, it } from 'vitest';
import { thinClues } from '../../src/core/thinning';
import { isLogicSolvable } from '../../src/core/solver';
import { makePuzzle, withHidden } from '../../src/core/puzzle';
import { Sculpture, sphere, box } from '../../src/core/dsl';
import { randomPuzzle } from './helpers';

function ball() {
  return new Sculpture([6, 6, 6]).add(sphere([2.5, 2.5, 2.5], 2.6)).cells();
}

describe('thinClues', () => {
  it('детерминирован и сохраняет решаемость', () => {
    const p = makePuzzle([6, 6, 6], ball());
    const a = thinClues(p, { seed: 'ball', targetHidden: 0.4 });
    const b = thinClues(p, { seed: 'ball', targetHidden: 0.4 });
    expect(Array.from(a.hidden)).toEqual(Array.from(b.hidden));
    expect(isLogicSolvable(a.puzzle)).toBe(true);
    expect(a.hiddenRatio).toBeGreaterThan(0.3);
    expect(a.hiddenRatio).toBeLessThanOrEqual(0.4 + 1 / p.grid.totalLines);
    expect(a.attempts).toBeGreaterThan(0);
    const c = thinClues(p, { seed: 'other', targetHidden: 0.4 });
    expect(Array.from(c.hidden)).not.toEqual(Array.from(a.hidden));
  });

  it('нулевая цель ничего не скрывает, цель > 1 обрезается', () => {
    const p = makePuzzle([6, 6, 6], ball());
    expect(thinClues(p, { seed: 's', targetHidden: 0 }).hiddenRatio).toBe(0);
    const max = thinClues(p, { seed: 's', targetHidden: 5 });
    expect(isLogicSolvable(max.puzzle)).toBe(true);
    // Больше скрыть нельзя: каждая оставшаяся подсказка нужна.
    for (let g = 0; g < p.grid.totalLines; g++) {
      if (max.hidden[g]) continue;
      const h = max.hidden.slice();
      h[g] = 1;
      expect(isLogicSolvable(withHidden(p, h))).toBe(false);
    }
  });

  it('hideFirst скрывает кружки и квадраты в первую очередь', () => {
    // Кольцо даёт много кружков.
    const s = new Sculpture([7, 3, 7])
      .add(box([0, 0, 0], [6, 2, 6]))
      .remove(box([2, 0, 2], [4, 2, 4]));
    const p = makePuzzle([7, 3, 7], s.cells());
    const before = p.clues.filter((c) => c.parts[0]!.groups > 1).length;
    expect(before).toBeGreaterThan(0);
    const r = thinClues(p, { seed: 'ring', targetHidden: 0, hideFirst: [2, 3] });
    const visibleFirst = p.clues.filter((c, g) => !r.hidden[g] && c.parts[0]!.groups > 1).length;
    expect(visibleFirst).toBe(r.remainingFirst);
    expect(r.remainingFirst).toBeLessThan(before);
    expect(isLogicSolvable(r.puzzle)).toBe(true);
  });

  it('keepVisible запрещает скрывать линии', () => {
    const p = makePuzzle([6, 6, 6], ball());
    const r = thinClues(p, { seed: 'k', targetHidden: 1, keepVisible: (g) => g < 10 });
    for (let g = 0; g < 10; g++) expect(r.hidden[g]).toBe(0);
  });

  it('ошибка, если уровень изначально не решается логикой', () => {
    let unsolvable = null;
    for (let seed = 1; seed < 100 && !unsolvable; seed++) {
      const p = randomPuzzle([3, 3, 3], seed, 0.5, 0.6);
      if (!isLogicSolvable(p)) unsolvable = p;
    }
    expect(unsolvable).not.toBeNull();
    expect(() => thinClues(unsolvable!, { seed: 'x', targetHidden: 0.5 })).toThrow();
  });
});

describe('thinClues: неустранимые кружки', () => {
  it('remainingFirst > 0, если кружок нельзя скрыть без потери решаемости', () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const p = randomPuzzle([4, 4, 3], seed, 0.5, 0);
      if (!isLogicSolvable(p)) continue;
      const r = thinClues(p, { seed: String(seed), targetHidden: 0, hideFirst: [2, 3] });
      expect(isLogicSolvable(r.puzzle)).toBe(true);
      if (r.remainingFirst > 0) found = true;
    }
    expect(found).toBe(true);
  });
});
