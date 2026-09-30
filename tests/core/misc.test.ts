import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, rngFromString, shuffle } from '../../src/core/rng';
import { measure, rate, DEFAULT_RATING, difficultyScore } from '../../src/core/difficulty';
import { makePuzzle, withHidden } from '../../src/core/puzzle';
import { Sculpture, sphere, box } from '../../src/core/dsl';
import { botPlay } from '../../src/core/bot';
import { GameSession } from '../../src/core/game';

describe('rng', () => {
  it('детерминирован и равномерен', () => {
    expect(hashString('sea_04')).toBe(hashString('sea_04'));
    expect(hashString('a')).not.toBe(hashString('b'));
    const a = rngFromString('x');
    const b = rngFromString('x');
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    const r = mulberry32(1);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
    const arr = shuffle([1, 2, 3, 4, 5], mulberry32(5));
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('difficulty', () => {
  it('метрики и оценка', () => {
    const cells = new Sculpture([6, 6, 6]).add(sphere([2.5, 2.5, 2.5], 2.6)).cells();
    const p = makePuzzle([6, 6, 6], cells);
    const m = measure(p);
    expect(m.cells).toBe(216);
    expect(m.filled + m.toBreak).toBe(216);
    expect(m.solvable).toBe(true);
    expect(m.hiddenRatio).toBe(0);
    const r = rate(m);
    expect(r.difficulty).toBeGreaterThanOrEqual(1);
    expect(r.difficulty).toBeLessThanOrEqual(5);
    expect(r.targetTime % 10).toBe(0);
    expect(r.targetTime).toBeGreaterThanOrEqual(30);
    expect(r.score).toBe(difficultyScore(m));
    const hard = rate({ ...m, rounds: 60, singleLineRounds: 30, hiddenRatio: 0.6 }, DEFAULT_RATING);
    expect(hard.difficulty).toBe(5);
    const allHidden = measure(withHidden(p, new Uint8Array(p.grid.totalLines).fill(1)));
    expect(allHidden.circleRatio).toBe(0);
    expect(allHidden.solvable).toBe(false);
    const ring = new Sculpture([5, 2, 5])
      .add(box([0, 0, 0], [4, 1, 4]))
      .remove(box([1, 0, 1], [3, 1, 3]));
    const rm = measure(makePuzzle([5, 2, 5], ring.cells()));
    expect(rm.circleRatio).toBeGreaterThan(0);
    const comb = new Sculpture([5, 1, 1])
      .add(box([0, 0, 0], [0, 0, 0]))
      .add(box([2, 0, 0], [2, 0, 0]))
      .add(box([4, 0, 0], [4, 0, 0]));
    expect(measure(makePuzzle([5, 1, 1], comb.cells())).squareRatio).toBeGreaterThan(0);
  });
});

describe('bot', () => {
  it('проходит решаемый уровень без промахов через игровой API', () => {
    const cells = new Sculpture([5, 5, 5]).add(sphere([2, 2, 2], 2)).cells();
    const s = new GameSession(makePuzzle([5, 5, 5], cells), 'b', 100);
    const r = botPlay(s);
    expect(r.won).toBe(true);
    expect(r.mistakes).toBe(0);
    expect(r.hammerHits).toBe(125 - 33);
  });

  it('останавливается, если логика застряла', () => {
    const p = makePuzzle([2, 2, 1], Uint8Array.from([1, 0, 0, 1]));
    const h = new Uint8Array(p.grid.totalLines);
    for (let g = p.grid.lineOffset[2]; g < p.grid.totalLines; g++) h[g] = 1;
    const r = botPlay(new GameSession(withHidden(p, h), 'b', 10));
    expect(r.won).toBe(false);
    expect(r.hammerHits).toBe(0);
  });

  it('останавливается при противоречии в пометках', () => {
    const p = makePuzzle([3, 1, 1], Uint8Array.from([1, 0, 0]));
    const s = new GameSession(p, 'b', 10);
    s.brush(1);
    s.brush(2);
    expect(botPlay(s).won).toBe(false);
  });
});
