import type { PackInfo } from './content';

/** Лучший результат по решённому уровню. */
export interface LevelRecord {
  stars: number;
  /** Лучшее время, с. */
  time: number;
  /** Меньше всего промахов. */
  mistakes: number;
}

/** Куда пишется раздел прогресса (`SaveStore`). */
export interface SectionWriter {
  set(key: string, value: unknown, flush: boolean): void;
}

/** Раздел прогресса в сохранении: `{ v: 1, levels: { id: [звёзды, время, промахи] } }`. */
export const PROGRESS_KEY = 'progress';

/** Прогресс игрока (§4): решённые уровни и лучшие результаты, открытие наборов и уровней. */
export class ProgressStore {
  private readonly levels = new Map<string, LevelRecord>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly save?: SectionWriter) {}

  /** Прочитать раздел прогресса (битые записи пропускаются). */
  load(section: unknown): void {
    this.levels.clear();
    const p = section as { levels?: Record<string, unknown> } | null | undefined;
    for (const [id, v] of Object.entries(p?.levels ?? {})) {
      if (!Array.isArray(v)) continue;
      const [stars, time, mistakes] = v as unknown[];
      if (typeof stars !== 'number' || typeof time !== 'number') continue;
      this.levels.set(id, {
        stars: Math.max(0, Math.min(3, Math.round(stars))),
        time: Math.max(0, time),
        mistakes: typeof mistakes === 'number' ? Math.max(0, mistakes) : 0,
      });
    }
    this.emit();
  }

  /** Раздел для сохранения. */
  toSection(): { v: 1; levels: Record<string, [number, number, number]> } {
    const levels: Record<string, [number, number, number]> = {};
    for (const [id, r] of this.levels) levels[id] = [r.stars, Math.round(r.time), r.mistakes];
    return { v: 1, levels };
  }

  get(levelId: string): LevelRecord | undefined {
    return this.levels.get(levelId);
  }

  isSolved(levelId: string): boolean {
    return this.levels.has(levelId);
  }

  get solvedCount(): number {
    return this.levels.size;
  }

  solvedIn(pack: PackInfo): number {
    return pack.levels.reduce((n, l) => n + (this.levels.has(l.id) ? 1 : 0), 0);
  }

  starsIn(pack: PackInfo): number {
    return pack.levels.reduce((n, l) => n + (this.levels.get(l.id)?.stars ?? 0), 0);
  }

  /**
   * Записать победу: звёзды — лучшие, время и промахи — наименьшие. Сохраняет сразу
   * (победа — логическая точка, §8). Возвращает true, если уровень решён впервые.
   */
  record(levelId: string, stars: number, time: number, mistakes: number): boolean {
    const prev = this.levels.get(levelId);
    this.levels.set(levelId, {
      stars: Math.max(prev?.stars ?? 0, stars),
      time: prev ? Math.min(prev.time, time) : time,
      mistakes: prev ? Math.min(prev.mistakes, mistakes) : mistakes,
    });
    this.emit();
    this.save?.set(PROGRESS_KEY, this.toSection(), true);
    return !prev;
  }

  /**
   * Набор открыт (§4): первый — всегда, дальше — когда в предыдущем решено `unlockAfter`.
   * Отладочные наборы открыты всегда и не участвуют в цепочке.
   */
  isPackUnlocked(packs: readonly PackInfo[], packId: string): boolean {
    const chain = packs.filter((p) => !p.debugOnly);
    const i = chain.findIndex((p) => p.id === packId);
    if (i < 0) return packs.some((p) => p.id === packId);
    if (i === 0 || chain[i]!.unlockAfter <= 0) return true;
    return this.solvedIn(chain[i - 1]!) >= chain[i]!.unlockAfter;
  }

  /** Уровень открыт: набор открыт и уровень первый, уже решён или решён предыдущий. */
  isLevelUnlocked(packs: readonly PackInfo[], pack: PackInfo, index: number): boolean {
    if (!this.isPackUnlocked(packs, pack.id)) return false;
    const lvl = pack.levels[index];
    if (!lvl) return false;
    return index === 0 || this.isSolved(lvl.id) || this.isSolved(pack.levels[index - 1]!.id);
  }

  /** Сбросить весь прогресс (настройки, §4) и сохранить. */
  reset(): void {
    this.levels.clear();
    this.emit();
    this.save?.set(PROGRESS_KEY, this.toSection(), true);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}
