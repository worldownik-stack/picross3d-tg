import { GROUPS_MANY, GROUPS_TWO } from './clues';
import type { Puzzle } from './puzzle';
import { emptyState, propagate } from './solver';

/** Метрики сложности уровня (§5.2). */
export interface LevelMetrics {
  cells: number;
  /** Кубов фигуры. */
  filled: number;
  /** Кубов, которые нужно сломать (≈ число действий). */
  toBreak: number;
  rounds: number;
  lineSteps: number;
  singleLineRounds: number;
  hiddenRatio: number;
  /** Доли кружков и квадратов среди видимых подсказок. */
  circleRatio: number;
  squareRatio: number;
  solvable: boolean;
}

export function measure(p: Puzzle): LevelMetrics {
  const res = propagate(p, emptyState(p), { layered: true });
  let filled = 0;
  for (let i = 0; i < p.classes.length; i++) if (p.classes[i]! > 0) filled++;
  let visible = 0;
  let circles = 0;
  let squares = 0;
  for (let g = 0; g < p.grid.totalLines; g++) {
    if (p.hidden[g]) continue;
    visible++;
    const cls = p.clues[g]!.parts[0]!.groups;
    if (cls === GROUPS_TWO) circles++;
    else if (cls === GROUPS_MANY) squares++;
  }
  const cells = p.grid.cellCount;
  return {
    cells,
    filled,
    toBreak: cells - filled,
    rounds: res.rounds,
    lineSteps: res.lineSteps,
    singleLineRounds: res.singleLineRounds,
    hiddenRatio: (p.grid.totalLines - visible) / p.grid.totalLines,
    circleRatio: visible ? circles / visible : 0,
    squareRatio: visible ? squares / visible : 0,
    solvable: res.status === 'solved',
  };
}

/**
 * Коэффициенты оценки. Время калибруется прогонами бота (фаза 4);
 * значения по умолчанию — стартовая оценка.
 */
export interface RatingConfig {
  /** Секунд на один удар молотком. */
  secPerBreak: number;
  /** Секунд «на подумать» за раунд пропагации. */
  secPerRound: number;
  /** Доп. секунд за раунд, где продвигается одна линия (узкое место). */
  secPerSingleRound: number;
  /** Пороги очков для сложности 2..5. */
  thresholds: readonly [number, number, number, number];
}

export const DEFAULT_RATING: RatingConfig = {
  secPerBreak: 1.1,
  secPerRound: 4,
  secPerSingleRound: 6,
  thresholds: [12, 22, 34, 48],
};

export function difficultyScore(m: LevelMetrics): number {
  return (
    m.rounds * 1.0 +
    m.singleLineRounds * 1.5 +
    m.hiddenRatio * 20 +
    (m.circleRatio + m.squareRatio * 1.5) * 12 +
    Math.log2(Math.max(8, m.cells)) * 2
  );
}

export function rate(
  m: LevelMetrics,
  cfg: RatingConfig = DEFAULT_RATING,
): { difficulty: number; targetTime: number; score: number } {
  const score = difficultyScore(m);
  let difficulty = 1;
  for (const t of cfg.thresholds) if (score >= t) difficulty++;
  const raw =
    m.toBreak * cfg.secPerBreak +
    m.rounds * cfg.secPerRound +
    m.singleLineRounds * cfg.secPerSingleRound;
  const targetTime = Math.max(30, Math.ceil(raw / 10) * 10);
  return { difficulty, targetTime, score };
}
