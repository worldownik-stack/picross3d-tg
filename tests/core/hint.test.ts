import { describe, expect, it } from 'vitest';
import { findHint } from '../../src/core/hint';
import { GameSession } from '../../src/core/game';
import { makePuzzle, withHidden } from '../../src/core/puzzle';
import { Sculpture, sphere } from '../../src/core/dsl';

describe('findHint', () => {
  it('с пустого поля — линия с наибольшим числом полезных действий', () => {
    const p = makePuzzle([5, 5, 5], new Sculpture([5, 5, 5]).add(sphere([2, 2, 2], 1.5)).cells());
    const s = new GameSession(p, 'h', 100);
    const h = findHint(p, s)!;
    expect(h).not.toBeNull();
    expect(h.breaks.length + h.keeps.length).toBeGreaterThan(0);
    for (const i of h.breaks) expect(p.classes[i]).toBe(0);
    for (const i of h.keeps) expect(p.classes[i]).toBe(1);
  });

  it('применение подсказок раз за разом решает уровень без промахов', () => {
    const p = makePuzzle(
      [4, 4, 4],
      new Sculpture([4, 4, 4]).add(sphere([1.5, 1.5, 1.5], 1.7)).cells(),
    );
    const s = new GameSession(p, 'h', 100);
    for (let guard = 0; guard < 200 && s.status === 'playing'; guard++) {
      const h = findHint(p, s)!;
      for (const i of h.breaks) {
        s.brush(i, 'clear');
        expect(s.hammer(i)).toBe('broken');
      }
      for (const i of h.keeps) s.brush(i, 'set');
    }
    expect(s.status).toBe('won');
    expect(s.totalMistakes).toBe(0);
  });

  it('ошибочная пометка исправляется подсказкой', () => {
    const p = makePuzzle([3, 1, 1], Uint8Array.from([0, 0, 0]));
    const s = new GameSession(p, 'h', 100);
    s.brush(1);
    const h = findHint(p, s)!;
    expect(h.breaks).toContain(1);
  });

  it('если полезное действие только после применения выводов — ищет глубже', () => {
    // Все KEEP уже помечены игроком: первый шаг не даёт полезного, дальше — да.
    const p = makePuzzle([3, 3, 1], Uint8Array.from([1, 1, 1, 1, 0, 0, 1, 0, 0]));
    const s = new GameSession(p, 'h', 100);
    for (const i of [0, 1, 2, 3, 6]) s.brush(i);
    const h = findHint(p, s)!;
    expect(h.breaks.length).toBeGreaterThan(0);
  });

  it('null, если логика не продвигается (все подсказки скрыты)', () => {
    const p = makePuzzle([2, 1, 1], Uint8Array.from([1, 0]));
    const q = withHidden(p, new Uint8Array(p.grid.totalLines).fill(1));
    expect(findHint(q, new GameSession(q, 'h', 1))).toBeNull();
  });
});
