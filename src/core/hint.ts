import { lineSolverFor } from './lineSolver';
import type { Puzzle } from './puzzle';
import { stepLine } from './solver';
import { BREAK, KEEP, UNKNOWN } from './types';

export interface Hint {
  /** Глобальный номер линии. */
  line: number;
  /** Кубы, которые нужно сломать (возможно, ошибочно помеченные). */
  breaks: number[];
  /** Кубы, которые нужно пометить. */
  keeps: number[];
}

export interface BoardView {
  broken: Uint8Array;
  cracked: Uint8Array;
  marked: Uint8Array;
}

/**
 * Следующий логический шаг от текущего состояния поля (§4, «Подсказка»).
 * Достоверное знание — только сломанные и треснувшие кубы (пометки игрока
 * могут быть ошибочными). Ищется линия, шаг по которой даёт больше всего
 * полезных действий; если полезных нет, выводы применяются и поиск повторяется.
 */
export function findHint(p: Puzzle, board: BoardView): Hint | null {
  const n = p.grid.cellCount;
  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    state[i] = board.broken[i] ? BREAK : board.cracked[i] ? KEEP : UNKNOWN;
  const solver = lineSolverFor(p.ruleset);
  const useful = (i: number, v: number) =>
    v === BREAK ? !board.broken[i] : v === KEEP ? !board.marked[i] : false;

  for (let guard = 0; guard <= n; guard++) {
    let best: Hint | null = null;
    let bestScore = 0;
    const deductions: Array<[number, number]> = [];
    for (let g = 0; g < p.grid.totalLines; g++) {
      if (p.hidden[g]) continue;
      const copy = state.slice();
      const changed = stepLine(p, copy, g, solver);
      if (!changed || changed.length === 0) continue;
      const hint: Hint = { line: g, breaks: [], keeps: [] };
      let score = 0;
      for (const i of changed) {
        deductions.push([i, copy[i]!]);
        if (!useful(i, copy[i]!)) continue;
        score++;
        (copy[i] === BREAK ? hint.breaks : hint.keeps).push(i);
      }
      if (score > bestScore) {
        best = hint;
        bestScore = score;
      }
    }
    if (best) return best;
    if (deductions.length === 0) return null;
    for (const [i, v] of deductions) state[i] = state[i]! & v;
  }
  return null;
}
