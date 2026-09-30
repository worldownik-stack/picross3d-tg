import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/core/game';
import { makePuzzle } from '../../src/core/puzzle';
import { Stroke, type StrokeEvent } from '../../src/core/stroke';

// 6×2×1: строка y=0 — фигура [0,0,1,0,0,0]; строка y=1 пустая.
function mk() {
  const cells = Uint8Array.from([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return new GameSession(makePuzzle([6, 2, 1], cells), 's', 100);
}

describe('Stroke', () => {
  it('молоток по линии: пропускает помеченные, обрывается на промахе', () => {
    const s = mk();
    s.brush(1);
    const ev: StrokeEvent[] = [];
    const st = new Stroke(s, 'hammer', 0, undefined, (e) => ev.push(e));
    st.begin();
    st.extendTo(3); // без оси — ничего
    expect(ev).toHaveLength(1);
    st.lockAxis(0);
    st.lockAxis(1); // ось фиксируется один раз
    expect(st.axis).toBe(0);
    st.extendTo(5);
    expect(ev.map((e) => [e.cell, e.result])).toEqual([
      [0, 'broken'],
      [2, 'miss'],
    ]);
    expect(st.ended).toBe(true);
    expect(s.broken[3]).toBe(0);
  });

  it('старт на помеченном кубе — «бонк», протяжка продолжается', () => {
    const s = mk();
    s.brush(3);
    const ev: StrokeEvent[] = [];
    const st = new Stroke(s, 'hammer', 3, undefined, (e) => ev.push(e));
    st.begin();
    st.lockAxis(0);
    st.extendTo(99); // обрезается по границе
    expect(ev.map((e) => e.result)).toEqual(['bonk', 'broken', 'broken']);
    expect(st.offsetRange()).toEqual([-3, 2]);
    st.extendTo(-1); // назад: клетка 2 — промах
    expect(ev.at(-1)).toEqual({ tool: 'hammer', cell: 2, result: 'miss' });
  });

  it('кисть: режим по первому кубу', () => {
    const s = mk();
    s.brush(7);
    const set = new Stroke(s, 'brush', 6);
    expect(set.brushMode).toBe('set');
    set.begin();
    set.lockAxis(0);
    set.extendTo(3);
    expect(Array.from(s.marked.subarray(6, 12))).toEqual([1, 1, 1, 1, 0, 0]);
    const clear = new Stroke(s, 'brush', 8);
    expect(clear.brushMode).toBe('clear');
    clear.begin();
    clear.lockAxis(0);
    clear.extendTo(-2);
    clear.extendTo(3);
    expect(Array.from(s.marked.subarray(6, 12))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('неинтерактивные (скрытые срезом) кубы пропускаются; победа завершает протяжку', () => {
    const s = mk();
    const st = new Stroke(s, 'hammer', 6, (i) => i !== 8);
    st.begin();
    st.lockAxis(0);
    st.extendTo(5);
    expect(s.broken[8]).toBe(0);
    expect(s.broken[11]).toBe(1);
    for (const i of [0, 1, 3, 4]) s.hammer(i);
    const last = new Stroke(s, 'hammer', 5);
    last.begin();
    expect(s.status).toBe('playing');
    const fin = new Stroke(s, 'hammer', 8);
    fin.begin();
    expect(s.status).toBe('won');
    expect(fin.ended).toBe(true);
    fin.lockAxis(0);
    fin.extendTo(-3);
  });

  it('cellAt: вне поля и по вертикальной оси', () => {
    const s = mk();
    const st = new Stroke(s, 'brush', 1);
    expect(st.cellAt(0)).toBe(1);
    expect(st.cellAt(1)).toBe(-1);
    st.lockAxis(1);
    expect(st.cellAt(1)).toBe(7);
    expect(st.cellAt(2)).toBe(-1);
    expect(st.offsetRange()).toEqual([0, 1]);
  });
});
