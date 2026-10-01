import { describe, expect, it } from 'vitest';
import type { PackInfo } from '../src/app/content';
import { PROGRESS_KEY, ProgressStore } from '../src/app/progress';
import { SaveStore } from '../src/app/save';
import { SETTINGS_KEY, SettingsStore } from '../src/app/settings';
import type { SaveBlob } from '../src/platform';

const pack = (id: string, unlockAfter: number, n = 10, debugOnly = false): PackInfo => ({
  id,
  title: { ru: id, en: id },
  unlockAfter,
  debugOnly,
  levels: Array.from({ length: n }, (_, k) => ({
    id: `${id}_${k + 1}`,
    title: { ru: '', en: '' },
    size: [1, 1, 1],
    difficulty: 1,
  })),
});
const PACKS = [
  pack('tut', 0, 5),
  pack('test', 0, 5, true),
  pack('food', 0),
  pack('home', 7),
  pack('nat', 7),
];

describe('прогресс игрока', () => {
  it('лучший результат: звёзды — максимум, время и промахи — минимум; сохранение сразу', () => {
    const saves: Array<[SaveBlob, boolean]> = [];
    const p = new ProgressStore(new SaveStore(async (b, f) => void saves.push([b, f])));
    expect(p.record('food_1', 2, 90, 3)).toBe(true);
    expect(p.record('food_1', 1, 60, 5)).toBe(false);
    expect(p.get('food_1')).toEqual({ stars: 2, time: 60, mistakes: 3 });
    expect(saves).toHaveLength(2);
    expect(saves[1]![1]).toBe(true);
    expect(saves[1]![0][PROGRESS_KEY]).toEqual({ v: 1, levels: { food_1: [2, 60, 3] } });
  });

  it('наборы открываются по порядку после 7 решённых, отладочные — всегда', () => {
    const p = new ProgressStore();
    expect(p.isPackUnlocked(PACKS, 'tut')).toBe(true);
    expect(p.isPackUnlocked(PACKS, 'food')).toBe(true); // unlockAfter 0
    expect(p.isPackUnlocked(PACKS, 'home')).toBe(false);
    expect(p.isPackUnlocked(PACKS, 'test')).toBe(true);
    for (let k = 1; k <= 6; k++) p.record(`food_${k}`, 3, 10, 0);
    expect(p.isPackUnlocked(PACKS, 'home')).toBe(false);
    p.record('food_7', 3, 10, 0);
    expect(p.isPackUnlocked(PACKS, 'home')).toBe(true);
    expect(p.isPackUnlocked(PACKS, 'nat')).toBe(false);
    expect(p.solvedIn(PACKS[2]!)).toBe(7);
    expect(p.starsIn(PACKS[2]!)).toBe(21);
    expect(p.isPackUnlocked(PACKS, 'nope')).toBe(false);
  });

  it('уровни внутри набора открываются последовательно', () => {
    const p = new ProgressStore();
    const food = PACKS[2]!;
    expect(p.isLevelUnlocked(PACKS, food, 0)).toBe(true);
    expect(p.isLevelUnlocked(PACKS, food, 1)).toBe(false);
    p.record('food_1', 1, 10, 0);
    expect(p.isLevelUnlocked(PACKS, food, 1)).toBe(true);
    expect(p.isLevelUnlocked(PACKS, food, 2)).toBe(false);
    expect(p.isLevelUnlocked(PACKS, PACKS[3]!, 0)).toBe(false); // набор закрыт
    expect(p.isLevelUnlocked(PACKS, food, 99)).toBe(false);
  });

  it('загрузка: битые записи пропускаются; сброс', () => {
    const p = new ProgressStore();
    p.load({ v: 1, levels: { a: [3, 40, 1], b: 'x', c: [7, 12], d: [1] } });
    expect(p.get('a')).toEqual({ stars: 3, time: 40, mistakes: 1 });
    expect(p.get('b')).toBeUndefined();
    expect(p.get('c')).toEqual({ stars: 3, time: 12, mistakes: 0 });
    expect(p.isSolved('d')).toBe(false);
    expect(p.solvedCount).toBe(2);
    let calls = 0;
    const unsub = p.subscribe(() => calls++);
    p.reset();
    expect(p.solvedCount).toBe(0);
    expect(calls).toBe(1);
    unsub();
    p.load(null);
    expect(calls).toBe(1);
    expect(p.toSection()).toEqual({ v: 1, levels: {} });
  });
});

describe('сохранение: разделы и настройки', () => {
  it('разделы не затирают друг друга, незнакомые ключи сохраняются', async () => {
    const saves: Array<[SaveBlob, boolean]> = [];
    const save = new SaveStore(async (b, f) => void saves.push([b, f]));
    save.load({ future: 42, [SETTINGS_KEY]: { music: false } });
    const p = new ProgressStore(save);
    p.load(save.get(PROGRESS_KEY));
    p.record('a', 3, 10, 0);
    save.set(SETTINGS_KEY, { music: true }, false);
    expect(saves).toHaveLength(2);
    expect(saves[0]![1]).toBe(true);
    expect(saves[1]![0]).toEqual({
      future: 42,
      [SETTINGS_KEY]: { music: true },
      [PROGRESS_KEY]: { v: 1, levels: { a: [3, 10, 0] } },
    });
    save.load(null);
    expect(save.snapshot()).toEqual({});
    save.load([1, 2] as unknown as SaveBlob);
    expect(save.snapshot()).toEqual({});
  });

  it('настройки из сохранения: только известные булевы ключи', () => {
    const s = new SettingsStore();
    s.loadSaved({ music: false, sound: 'yes', vibration: false, unknown: true });
    expect(s.get()).toMatchObject({ music: false, sound: true, vibration: false });
    expect(s.get()).not.toHaveProperty('unknown');
    s.loadSaved(null);
    expect(s.get().music).toBe(false);
  });
});
