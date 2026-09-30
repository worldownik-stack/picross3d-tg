import type { PackInfo } from './content';

/** Лучший результат по уровню: максимум звёзд, минимум времени (с). */
export interface LevelResult {
  stars: number;
  time: number;
}

export interface ProgressData {
  v: 1;
  levels: Record<string, LevelResult>;
}

export interface RecordOutcome {
  /** Результат до этой попытки (если уровень уже проходили). */
  previous?: LevelResult;
  best: LevelResult;
}

export type ProgressListener = () => void;

const round1 = (x: number) => Math.round(x * 10) / 10;

function cleanResult(raw: unknown): LevelResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { stars, time } = raw as Record<string, unknown>;
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 3) return null;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) return null;
  return { stars, time: round1(time) };
}

/** Разбор сохранённого блоба: всё лишнее и повреждённое отбрасывается. */
export function parseProgress(raw: unknown): ProgressData {
  const out: ProgressData = { v: 1, levels: {} };
  const levels = (raw as { levels?: unknown } | null)?.levels;
  if (typeof levels !== 'object' || levels === null) return out;
  for (const [id, r] of Object.entries(levels)) {
    const res = cleanResult(r);
    if (res) out.levels[id] = res;
  }
  return out;
}

function better(a: LevelResult | undefined, b: LevelResult): LevelResult {
  return a ? { stars: Math.max(a.stars, b.stars), time: Math.min(a.time, b.time) } : b;
}

/** Слияние двух прогрессов (например, облако и локальная копия): по каждому уровню лучшее. */
export function mergeProgress(a: ProgressData, b: ProgressData): ProgressData {
  const levels: Record<string, LevelResult> = { ...a.levels };
  for (const [id, r] of Object.entries(b.levels)) levels[id] = better(levels[id], r);
  return { v: 1, levels };
}

/** Прогресс игрока по уровням и открытие наборов (§4). */
export class ProgressStore {
  private data: ProgressData;
  private readonly listeners = new Set<ProgressListener>();

  constructor(initial?: ProgressData) {
    this.data = initial ?? { v: 1, levels: {} };
  }

  get(levelId: string): LevelResult | undefined {
    return this.data.levels[levelId];
  }

  isSolved(levelId: string): boolean {
    return levelId in this.data.levels;
  }

  /** Записывает результат: звёзды — максимум, время — минимум. */
  record(levelId: string, stars: number, time: number): RecordOutcome {
    const previous = this.data.levels[levelId];
    const best = better(previous, cleanResult({ stars, time }) ?? { stars: 1, time: 0 });
    this.data = { v: 1, levels: { ...this.data.levels, [levelId]: best } };
    this.emit();
    return { previous, best };
  }

  solvedIn(pack: PackInfo): number {
    return pack.levels.filter((l) => this.isSolved(l.id)).length;
  }

  starsIn(pack: PackInfo): number {
    return pack.levels.reduce((sum, l) => sum + (this.get(l.id)?.stars ?? 0), 0);
  }

  /** Первый набор открыт всегда, остальные — после `unlockAfter` решённых в предыдущем. */
  isPackUnlocked(packs: readonly PackInfo[], index: number): boolean {
    const pack = packs[index];
    if (!pack) return false;
    if (index === 0) return true;
    return this.solvedIn(packs[index - 1]!) >= pack.unlockAfter;
  }

  /** Подмешивает другой прогресс (лучшее по каждому уровню). */
  merge(other: ProgressData): void {
    this.data = mergeProgress(this.data, other);
    this.emit();
  }

  reset(): void {
    this.data = { v: 1, levels: {} };
    this.emit();
  }

  toJSON(): ProgressData {
    return this.data;
  }

  subscribe(cb: ProgressListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}
