import { describe, expect, it, vi } from 'vitest';
import type { PackInfo } from '../src/app/content';
import { mergeProgress, parseProgress, ProgressStore } from '../src/app/progress';
import { parseSave, SaveManager } from '../src/app/save';
import { SettingsStore } from '../src/app/settings';
import { MockPlatform } from '../src/platform/MockPlatform';

const pack = (id: string, levels: number, unlockAfter: number): PackInfo => ({
  id,
  title: { ru: id, en: id },
  unlockAfter,
  levels: Array.from({ length: levels }, (_, i) => ({
    id: `${id}_${i + 1}`,
    title: { ru: '', en: '' },
    size: [3, 3, 3],
    difficulty: 1,
  })),
});

describe('ProgressStore', () => {
  it('хранит максимум звёзд и минимум времени', () => {
    const p = new ProgressStore();
    expect(p.record('a', 2, 50)).toEqual({ previous: undefined, best: { stars: 2, time: 50 } });
    const r = p.record('a', 1, 40);
    expect(r.previous).toEqual({ stars: 2, time: 50 });
    expect(r.best).toEqual({ stars: 2, time: 40 });
    expect(p.record('a', 3, 90).best).toEqual({ stars: 3, time: 40 });
    expect(p.isSolved('a')).toBe(true);
    expect(p.isSolved('b')).toBe(false);
  });

  it('уведомляет подписчиков и умеет сбрасываться', () => {
    const p = new ProgressStore();
    const cb = vi.fn();
    p.subscribe(cb);
    p.record('a', 3, 10);
    p.reset();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(p.get('a')).toBeUndefined();
  });

  it('открывает наборы по числу решённых в предыдущем', () => {
    const packs = [pack('p1', 3, 0), pack('p2', 3, 2), pack('p3', 3, 1)];
    const p = new ProgressStore();
    expect(p.isPackUnlocked(packs, 0)).toBe(true);
    expect(p.isPackUnlocked(packs, 1)).toBe(false);
    p.record('p1_1', 3, 10);
    expect(p.isPackUnlocked(packs, 1)).toBe(false);
    p.record('p1_2', 1, 10);
    expect(p.isPackUnlocked(packs, 1)).toBe(true);
    expect(p.isPackUnlocked(packs, 2)).toBe(false);
    expect(p.isPackUnlocked(packs, 9)).toBe(false);
    expect(p.solvedIn(packs[0]!)).toBe(2);
    expect(p.starsIn(packs[0]!)).toBe(4);
  });

  it('наборы без порога (unlockAfter = 0) открыты сразу', () => {
    const packs = [pack('p1', 3, 0), pack('p2', 3, 0)];
    expect(new ProgressStore().isPackUnlocked(packs, 1)).toBe(true);
  });
});

describe('parseProgress / mergeProgress', () => {
  it('отбрасывает мусор', () => {
    expect(parseProgress(null)).toEqual({ v: 1, levels: {} });
    expect(parseProgress({ levels: 5 })).toEqual({ v: 1, levels: {} });
    const p = parseProgress({
      levels: {
        ok: { stars: 2, time: 12.34 },
        badStars: { stars: 4, time: 1 },
        zeroStars: { stars: 0, time: 1 },
        fracStars: { stars: 1.5, time: 1 },
        badTime: { stars: 1, time: -1 },
        nanTime: { stars: 1, time: Number.NaN },
        str: { stars: '3', time: 1 },
        nul: null,
      },
    });
    expect(p.levels).toEqual({ ok: { stars: 2, time: 12.3 } });
  });

  it('сливает два прогресса, беря лучшее по каждому уровню', () => {
    const a = parseProgress({ levels: { x: { stars: 3, time: 60 }, y: { stars: 1, time: 9 } } });
    const b = parseProgress({ levels: { x: { stars: 2, time: 30 }, z: { stars: 2, time: 5 } } });
    expect(mergeProgress(a, b).levels).toEqual({
      x: { stars: 3, time: 30 },
      y: { stars: 1, time: 9 },
      z: { stars: 2, time: 5 },
    });
  });
});

describe('parseSave', () => {
  it('берёт только известные булевы настройки', () => {
    const s = parseSave({ settings: { music: false, sound: 'no', junk: true }, progress: {} });
    expect(s.settings).toEqual({ music: false });
    expect(parseSave(null)).toEqual({ settings: {}, progress: { v: 1, levels: {} } });
  });
});

describe('SaveManager', () => {
  function mem() {
    const data = new Map<string, string>();
    return {
      data,
      storage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      },
    };
  }

  it('склеивает частые правки, flush пишет сразу, загрузка восстанавливает', async () => {
    vi.useFakeTimers();
    try {
      const { storage } = mem();
      const platform = new MockPlatform({ storage });
      const settings = new SettingsStore();
      const progress = new ProgressStore();
      const save = new SaveManager(platform, settings, progress, { debounceMs: 500 });
      await save.start();
      expect(platform.log.filter((l) => l.startsWith('save'))).toEqual([]);

      settings.set('music', false);
      settings.set('sound', false);
      progress.record('a', 2, 33);
      vi.advanceTimersByTime(499);
      expect(platform.log.filter((l) => l.startsWith('save'))).toEqual([]);
      vi.advanceTimersByTime(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(platform.log.filter((l) => l.startsWith('save'))).toHaveLength(1);

      progress.record('b', 3, 20);
      await save.flush();
      expect(platform.log.filter((l) => l.startsWith('save'))).toHaveLength(2);
      await save.flush(); // нечего писать
      expect(platform.log.filter((l) => l.startsWith('save'))).toHaveLength(2);

      // «Новый запуск» с тем же хранилищем.
      const settings2 = new SettingsStore();
      const progress2 = new ProgressStore();
      await new SaveManager(new MockPlatform({ storage }), settings2, progress2).start();
      expect(settings2.get().music).toBe(false);
      expect(settings2.get().sound).toBe(false);
      expect(settings2.get().vibration).toBe(true);
      expect(progress2.get('a')).toEqual({ stars: 2, time: 33 });
      expect(progress2.get('b')).toEqual({ stars: 3, time: 20 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('повреждённое сохранение не ломает запуск', async () => {
    const { storage, data } = mem();
    data.set('cube-sculptor/mock-cloud', '{oops');
    const progress = new ProgressStore();
    await new SaveManager(new MockPlatform({ storage }), new SettingsStore(), progress).start();
    expect(progress.toJSON()).toEqual({ v: 1, levels: {} });
  });

  it('ошибка записи не теряет изменения: следующий flush повторит', async () => {
    const platform = new MockPlatform({ storage: null });
    const save = new SaveManager(platform, new SettingsStore(), new ProgressStore(), {
      debounceMs: 10_000,
    });
    await save.start();
    let fail = true;
    const spy = vi.spyOn(platform, 'saveData').mockImplementation(async () => {
      if (fail) throw new Error('offline');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (save as unknown as { progress: ProgressStore }).progress.record('a', 1, 1);
    await save.flush();
    fail = false;
    await save.flush();
    expect(spy).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
