import type { GameSession } from './game';
import { propagate } from './solver';
import { BREAK, KEEP, UNKNOWN } from './types';

export interface BotReport {
  won: boolean;
  mistakes: number;
  hammerHits: number;
  brushMarks: number;
  iterations: number;
}

/**
 * Бот-проверка (§5.4): проходит уровень через игровой API — по знаниям,
 * видимым игроку (подсказки, сломанные и помеченные кубы), ломает все выведенные
 * BREAK и помечает KEEP. Не должен сделать ни одного промаха.
 */
export function botPlay(session: GameSession, maxIterations = 1000): BotReport {
  const p = session.puzzle;
  const n = p.grid.cellCount;
  const report: BotReport = {
    won: false,
    mistakes: 0,
    hammerHits: 0,
    brushMarks: 0,
    iterations: 0,
  };
  while (session.status === 'playing' && report.iterations < maxIterations) {
    report.iterations++;
    const state = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      state[i] = session.broken[i] ? BREAK : session.marked[i] ? KEEP : UNKNOWN;
    }
    const res = propagate(p, state);
    if (res.status === 'contradiction') break;
    let acted = false;
    for (let i = 0; i < n && session.status === 'playing'; i++) {
      if (state[i] === BREAK && !session.broken[i]) {
        const r = session.hammer(i);
        report.hammerHits++;
        if (r === 'miss') report.mistakes++;
        acted = true;
      } else if (state[i] === KEEP && !session.marked[i]) {
        session.brush(i, 'set');
        report.brushMarks++;
        acted = true;
      }
    }
    if (!acted) break;
  }
  report.won = session.status === 'won';
  return report;
}
