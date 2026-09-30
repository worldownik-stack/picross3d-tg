import { decodeBitset, encodeBitset } from './codec';
import type { Grid } from './grid';
import type { Puzzle } from './puzzle';
import type { Axis } from './types';

export type Tool = 'hammer' | 'brush';
/** Результат удара: сломан, промах, «бонк» по помеченному, ничего (уже сломан/игра окончена). */
export type HammerResult = 'broken' | 'miss' | 'bonk' | 'none';
export type BrushMode = 'set' | 'clear' | 'toggle';
export type BrushResult = 'marked' | 'unmarked' | 'none';
export type GameStatus = 'playing' | 'won' | 'lost';

/** Параметры правил, вынесенные в конфиг (§2.8, §2.10). */
export interface GameRules {
  maxMistakes: number;
  /** На сколько уменьшается счётчик промахов при «Продолжить за рекламу». */
  continueRefund: number;
  /** Сколько раз за попытку можно продолжить. */
  maxContinues: number;
  /** Жёсткий лимит времени, с. В основном режиме нет (сознательное отступление от оригинала). */
  timeLimit: number | null;
}

export const DEFAULT_RULES: Readonly<GameRules> = {
  maxMistakes: 5,
  continueRefund: 2,
  maxContinues: 1,
  timeLimit: null,
};

/** Незавершённый уровень для сохранения (§8, п. 1.9). */
export interface SavedProgress {
  v: 1;
  level: string;
  broken: string;
  marked: string;
  cracked: string;
  mistakes: number;
  totalMistakes: number;
  continues: number;
  time: number;
}

/**
 * Состояние попытки прохождения уровня и правила Round 1 (§2).
 * Чистая логика: рендер и ввод вызывают методы и реагируют на результаты.
 */
export class GameSession {
  readonly grid: Grid;
  /** 1 — куб сломан. */
  readonly broken: Uint8Array;
  /** Цвет пометки кистью (0 — нет). В Round 1 всегда 1. */
  readonly marked: Uint8Array;
  /** 1 — куб треснул от промаха (навсегда помечен). */
  readonly cracked: Uint8Array;
  status: GameStatus = 'playing';
  /** Текущие промахи (для поражения). */
  mistakes = 0;
  /** Все промахи за попытку (для звёзд). */
  totalMistakes = 0;
  continuesUsed = 0;
  /** Время попытки, с. */
  elapsed = 0;
  private remaining = 0;

  constructor(
    readonly puzzle: Puzzle,
    readonly levelId: string,
    readonly targetTime: number,
    readonly rules: GameRules = DEFAULT_RULES,
  ) {
    this.grid = puzzle.grid;
    const n = this.grid.cellCount;
    this.broken = new Uint8Array(n);
    this.marked = new Uint8Array(n);
    this.cracked = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (!puzzle.classes[i]) this.remaining++;
    if (this.remaining === 0) this.status = 'won';
  }

  /** Сколько «лишних» кубов ещё не сломано. */
  get remainingToBreak(): number {
    return this.remaining;
  }

  isIntact(i: number): boolean {
    return !this.broken[i];
  }

  /** Удар молотком (§2.6). */
  hammer(i: number): HammerResult {
    if (this.status !== 'playing' || this.broken[i]) return 'none';
    if (this.marked[i]) return 'bonk';
    if (this.puzzle.classes[i]) {
      this.cracked[i] = 1;
      this.marked[i] = this.puzzle.classes[i]!;
      this.mistakes++;
      this.totalMistakes++;
      if (this.mistakes >= this.rules.maxMistakes) this.status = 'lost';
      return 'miss';
    }
    this.broken[i] = 1;
    this.remaining--;
    if (this.remaining === 0) this.status = 'won';
    return 'broken';
  }

  /** Кисть: поставить/снять пометку. Треснувшие кубы остаются помеченными. */
  brush(i: number, mode: BrushMode = 'toggle', color = 1): BrushResult {
    if (this.status !== 'playing' || this.broken[i] || this.cracked[i]) return 'none';
    const on = this.marked[i] !== 0;
    const want = mode === 'toggle' ? !on : mode === 'set';
    if (want === on && (!want || this.marked[i] === color)) return 'none';
    this.marked[i] = want ? color : 0;
    return want ? 'marked' : 'unmarked';
  }

  /** Ход времени. Вызывается только когда игра не на паузе. */
  tick(dt: number): void {
    if (this.status !== 'playing' || dt <= 0) return;
    this.elapsed += dt;
    if (this.rules.timeLimit !== null && this.elapsed >= this.rules.timeLimit) {
      this.elapsed = this.rules.timeLimit;
      this.status = 'lost';
    }
  }

  canContinue(): boolean {
    return (
      this.status === 'lost' &&
      this.mistakes >= this.rules.maxMistakes &&
      this.continuesUsed < this.rules.maxContinues
    );
  }

  /** «Продолжить за рекламу»: −2 промаха, один раз за попытку (§2.8). */
  continueAfterLoss(): boolean {
    if (!this.canContinue()) return false;
    this.continuesUsed++;
    this.mistakes = Math.max(0, this.mistakes - this.rules.continueRefund);
    this.status = 'playing';
    return true;
  }

  /** Звёзды = 3 − [промахи > 0] − [время > targetTime], минимум 1 (§2.10). */
  stars(): number {
    const s = 3 - (this.totalMistakes > 0 ? 1 : 0) - (this.elapsed > this.targetTime ? 1 : 0);
    return Math.max(1, s);
  }

  /**
   * Линия «выполнена» по знаниям игрока: не осталось непомеченных целых кубов,
   * а число помеченных равно подсказке (§4, «затемнять выполненные линии»).
   */
  isLineDone(g: number): boolean {
    if (this.puzzle.hidden[g]) return false;
    const grid = this.grid;
    const axis = grid.lineAxis[g] as Axis;
    const n = grid.size[axis];
    const d = grid.strides[axis];
    let i = grid.lineStart[g]!;
    let marked = 0;
    for (let k = 0; k < n; k++, i += d) {
      if (this.broken[i]) continue;
      if (!this.marked[i]) return false;
      marked++;
    }
    return marked === this.puzzle.clues[g]!.parts[0]!.count;
  }

  serialize(): SavedProgress {
    return {
      v: 1,
      level: this.levelId,
      broken: encodeBitset(this.broken),
      marked: encodeBitset(this.marked),
      cracked: encodeBitset(this.cracked),
      mistakes: this.mistakes,
      totalMistakes: this.totalMistakes,
      continues: this.continuesUsed,
      time: Math.round(this.elapsed * 10) / 10,
    };
  }

  /** Восстановление незавершённой попытки. Некорректные данные отбрасываются. */
  static restore(
    puzzle: Puzzle,
    targetTime: number,
    saved: SavedProgress,
    rules: GameRules = DEFAULT_RULES,
  ): GameSession {
    const s = new GameSession(puzzle, saved.level, targetTime, rules);
    const n = puzzle.grid.cellCount;
    const broken = decodeBitset(saved.broken, n);
    const marked = decodeBitset(saved.marked, n);
    const cracked = decodeBitset(saved.cracked, n);
    for (let i = 0; i < n; i++) {
      if (broken[i] && !puzzle.classes[i]) {
        s.broken[i] = 1;
        s.remaining--;
      } else if (cracked[i] && puzzle.classes[i]) {
        s.cracked[i] = 1;
        s.marked[i] = puzzle.classes[i]!;
      } else if (marked[i]) {
        s.marked[i] = 1;
      }
    }
    s.mistakes = clampInt(saved.mistakes, 0, rules.maxMistakes);
    s.totalMistakes = Math.max(s.mistakes, clampInt(saved.totalMistakes, 0, 1e6));
    s.continuesUsed = clampInt(saved.continues, 0, rules.maxContinues);
    s.elapsed = Math.max(0, Number(saved.time) || 0);
    if (s.remaining === 0) s.status = 'won';
    else if (s.mistakes >= rules.maxMistakes) s.status = 'lost';
    return s;
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
