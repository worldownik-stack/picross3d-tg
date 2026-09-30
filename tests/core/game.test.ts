import { describe, expect, it } from 'vitest';
import { GameSession, DEFAULT_RULES } from '../../src/core/game';
import { makePuzzle } from '../../src/core/puzzle';

// Линия из 4 кубов: фигура = [1,1,0,0], плюс вторая строка [0,0,0,0].
function mk(targetTime = 100) {
  const p = makePuzzle([4, 2, 1], Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0]));
  return new GameSession(p, 'lvl', targetTime);
}

describe('GameSession', () => {
  it('молоток: лишний куб ломается, куб фигуры — промах с трещиной и пометкой', () => {
    const s = mk();
    expect(s.remainingToBreak).toBe(6);
    expect(s.hammer(2)).toBe('broken');
    expect(s.isIntact(2)).toBe(false);
    expect(s.hammer(2)).toBe('none');
    expect(s.remainingToBreak).toBe(5);
    expect(s.hammer(0)).toBe('miss');
    expect(s.cracked[0]).toBe(1);
    expect(s.marked[0]).toBe(1);
    expect(s.mistakes).toBe(1);
    // Помеченный куб: «бонк» без штрафа.
    expect(s.hammer(0)).toBe('bonk');
    expect(s.mistakes).toBe(1);
  });

  it('кисть: поставить, снять, toggle; треснувший куб не снимается', () => {
    const s = mk();
    expect(s.brush(3)).toBe('marked');
    expect(s.brush(3, 'set')).toBe('none');
    expect(s.hammer(3)).toBe('bonk');
    expect(s.brush(3, 'clear')).toBe('unmarked');
    expect(s.brush(3, 'clear')).toBe('none');
    expect(s.brush(3, 'toggle')).toBe('marked');
    expect(s.brush(3, 'toggle')).toBe('unmarked');
    s.hammer(1);
    expect(s.brush(1, 'clear')).toBe('none');
    s.hammer(3);
    expect(s.brush(3)).toBe('none'); // сломан
    expect(s.brush(2, 'set', 2)).toBe('marked');
    expect(s.brush(2, 'set', 2)).toBe('none');
    expect(s.brush(2, 'set', 1)).toBe('marked'); // смена цвета (задел под Round 2)
  });

  it('победа, как только сломан последний лишний куб; ввод блокируется', () => {
    const s = mk();
    for (const i of [2, 3, 4, 5, 6]) s.hammer(i);
    expect(s.status).toBe('playing');
    expect(s.hammer(7)).toBe('broken');
    expect(s.status).toBe('won');
    expect(s.hammer(0)).toBe('none');
    expect(s.brush(0)).toBe('none');
    s.tick(10);
    expect(s.elapsed).toBe(0);
  });

  it('поражение на 5 промахах и одно продолжение за рекламу (−2)', () => {
    const p = makePuzzle([6, 1, 1], Uint8Array.from([1, 1, 1, 1, 1, 0]));
    const s = new GameSession(p, 'x', 100);
    expect(s.canContinue()).toBe(false);
    for (let i = 0; i < 5; i++) s.hammer(i);
    expect(s.status).toBe('lost');
    expect(s.canContinue()).toBe(true);
    expect(s.continueAfterLoss()).toBe(true);
    expect(s.mistakes).toBe(3);
    expect(s.totalMistakes).toBe(5);
    expect(s.status).toBe('playing');
    expect(s.continueAfterLoss()).toBe(false);
    expect(s.hammer(5)).toBe('broken');
    expect(s.status).toBe('won');
    expect(s.stars()).toBe(2);
  });

  it('второе поражение после продолжения — продолжить нельзя', () => {
    const p = makePuzzle([8, 1, 1], Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 0]));
    const s = new GameSession(p, 'x', 100);
    for (let i = 0; i < 5; i++) s.hammer(i);
    s.continueAfterLoss();
    s.brush(0, 'clear');
    s.hammer(5);
    s.hammer(6);
    expect(s.status).toBe('lost');
    expect(s.canContinue()).toBe(false);
  });

  it('звёзды: 3 − [промахи] − [время > target], минимум 1', () => {
    const a = mk(10);
    expect(a.stars()).toBe(3);
    a.tick(10);
    expect(a.stars()).toBe(3);
    a.tick(0.5);
    expect(a.stars()).toBe(2);
    a.hammer(0);
    expect(a.stars()).toBe(1);
    a.tick(-5);
    expect(a.elapsed).toBe(10.5);
  });

  it('лимит времени (для будущих режимов)', () => {
    const p = makePuzzle([2, 1, 1], Uint8Array.from([1, 0]));
    const s = new GameSession(p, 'x', 10, { ...DEFAULT_RULES, timeLimit: 5 });
    s.tick(3);
    expect(s.status).toBe('playing');
    s.tick(3);
    expect(s.status).toBe('lost');
    expect(s.elapsed).toBe(5);
    expect(s.canContinue()).toBe(false);
  });

  it('выполненная линия — по знаниям игрока', () => {
    const s = mk();
    const g = 0; // линия X: y=0, клетки 0..3, подсказка 2
    expect(s.isLineDone(g)).toBe(false);
    s.hammer(2);
    s.hammer(3);
    expect(s.isLineDone(g)).toBe(false);
    s.brush(0);
    expect(s.isLineDone(g)).toBe(false);
    s.brush(1);
    expect(s.isLineDone(g)).toBe(true);
    // Лишняя пометка: помеченных больше подсказки.
    const t = mk();
    t.hammer(3);
    t.brush(0);
    t.brush(1);
    t.brush(2);
    expect(t.isLineDone(g)).toBe(false);
    const hidden = new Uint8Array(s.grid.totalLines).fill(1);
    const h = new GameSession({ ...s.puzzle, hidden }, 'h', 10);
    expect(h.isLineDone(0)).toBe(false);
  });

  it('уровень без лишних кубов сразу решён', () => {
    const p = makePuzzle([2, 1, 1], Uint8Array.from([1, 1]));
    expect(new GameSession(p, 'x', 10).status).toBe('won');
  });

  it('сохранение и восстановление незавершённой попытки', () => {
    const s = mk();
    s.hammer(2);
    s.hammer(0);
    s.brush(5);
    s.tick(12.34);
    const saved = s.serialize();
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
    const r = GameSession.restore(s.puzzle, 100, saved);
    expect(Array.from(r.broken)).toEqual(Array.from(s.broken));
    expect(Array.from(r.marked)).toEqual(Array.from(s.marked));
    expect(Array.from(r.cracked)).toEqual(Array.from(s.cracked));
    expect(r.mistakes).toBe(1);
    expect(r.totalMistakes).toBe(1);
    expect(r.elapsed).toBeCloseTo(12.3);
    expect(r.remainingToBreak).toBe(5);
    expect(r.levelId).toBe('lvl');
  });

  it('восстановление отбрасывает некорректные данные', () => {
    const s = mk();
    const saved = s.serialize();
    // «Сломан» куб фигуры и «треснул» лишний — игнорируются.
    const bad = {
      ...saved,
      broken: 'AQ==',
      cracked: 'BA==',
      mistakes: 99,
      totalMistakes: -3,
      continues: 'x' as unknown as number,
      time: -1,
    };
    const r = GameSession.restore(s.puzzle, 100, bad);
    expect(r.broken[0]).toBe(0);
    expect(r.cracked[2]).toBe(0);
    expect(r.mistakes).toBe(5);
    expect(r.status).toBe('lost');
    expect(r.totalMistakes).toBe(5);
    expect(r.continuesUsed).toBe(0);
    expect(r.elapsed).toBe(0);
    const all = { ...saved, broken: '/A==' }; // клетки 2..7 сломаны
    expect(GameSession.restore(s.puzzle, 100, all).status).toBe('won');
  });
});
