import { lineSolverFor, type LineSolver } from './lineSolver';
import type { Puzzle } from './puzzle';
import { BREAK, KEEP, UNKNOWN, type Axis } from './types';

export type SolveStatus = 'solved' | 'stuck' | 'contradiction';

/** Изменения, сделанные одной линией за шаг пропагации. */
export interface LineDeduction {
  /** Глобальный номер линии. */
  line: number;
  /** Ячейки, ставшие KEEP. */
  keep: number[];
  /** Ячейки, ставшие BREAK. */
  break: number[];
}

export interface PropagationResult {
  status: SolveStatus;
  /** Раундов пропагации, в которых что-то продвинулось. */
  rounds: number;
  /** Шагов по линии, давших новое знание. */
  lineSteps: number;
  /** Всего вызовов решателя линии. */
  lineVisits: number;
  /** Раундов, в которых продвинулась ровно одна линия. */
  singleLineRounds: number;
  /** Сколько ячеек осталось неизвестными. */
  unknown: number;
  /** Пошаговый журнал (если запрошен). */
  trace?: LineDeduction[][];
}

export interface PropagateOptions {
  /** Записывать журнал выводов по раундам. */
  trace?: boolean;
  /** Начальные «грязные» линии (по умолчанию — все видимые). */
  dirty?: Iterable<number>;
  /**
   * Послойный режим: все линии раунда смотрят на состояние начала раунда,
   * а выводы применяются в конце. Число раундов тогда — «глубина» рассуждений
   * (для метрик сложности и пошагового журнала). По умолчанию выводы
   * применяются сразу — так быстрее сходится.
   */
  layered?: boolean;
}

/** Рабочие буферы решателя под конкретную головоломку. */
class Scratch {
  readonly lineIn: Uint8Array;
  readonly lineOut: Uint8Array;
  constructor(maxLen: number) {
    this.lineIn = new Uint8Array(maxLen);
    this.lineOut = new Uint8Array(maxLen);
  }
}

function maxLineLength(p: Puzzle): number {
  return Math.max(p.grid.X, p.grid.Y, p.grid.Z);
}

/**
 * Вывод по линии `g` из знания `src` без записи: результат в `scratch.lineOut`
 * (исходные значения — в `scratch.lineIn`). false — противоречие.
 */
function deduce(
  p: Puzzle,
  src: Uint8Array,
  g: number,
  solver: LineSolver,
  scratch: Scratch,
): boolean {
  const grid = p.grid;
  const axis = grid.lineAxis[g] as Axis;
  const n = grid.size[axis];
  const d = grid.strides[axis];
  const s = grid.lineStart[g]!;
  for (let k = 0; k < n; k++) scratch.lineIn[k] = src[s + k * d]!;
  return solver.solve(p.clues[g]!, n, scratch.lineIn, scratch.lineOut);
}

/**
 * Один шаг по линии: уточняет знание `state` в линии `g`.
 * @returns null при противоречии, иначе список изменённых ячеек (может быть пустым).
 */
export function stepLine(
  p: Puzzle,
  state: Uint8Array,
  g: number,
  solver: LineSolver = lineSolverFor(p.ruleset),
  scratch: Scratch = new Scratch(maxLineLength(p)),
): number[] | null {
  if (!deduce(p, state, g, solver, scratch)) return null;
  const axis = p.grid.lineAxis[g] as Axis;
  const d = p.grid.strides[axis];
  const s = p.grid.lineStart[g]!;
  const { lineIn, lineOut } = scratch;
  const changed: number[] = [];
  for (let k = 0; k < p.grid.size[axis]; k++) {
    if (lineOut[k] !== lineIn[k]) {
      const i = s + k * d;
      state[i] = lineOut[k]!;
      changed.push(i);
    }
  }
  return changed;
}

/**
 * Послойный шаг: вывод по снимку начала раунда, применение к текущему
 * состоянию (пересечение знаний). null — противоречие.
 */
function stepLineLayered(
  p: Puzzle,
  snapshot: Uint8Array,
  state: Uint8Array,
  g: number,
  solver: LineSolver,
  scratch: Scratch,
): number[] | null {
  if (!deduce(p, snapshot, g, solver, scratch)) return null;
  const axis = p.grid.lineAxis[g] as Axis;
  const d = p.grid.strides[axis];
  const s = p.grid.lineStart[g]!;
  const { lineIn, lineOut } = scratch;
  const applied: number[] = [];
  for (let k = 0; k < p.grid.size[axis]; k++) {
    if (lineOut[k] === lineIn[k]) continue;
    const i = s + k * d;
    const v = state[i]! & lineOut[k]!;
    if (v === state[i]) continue;
    if (v === 0) return null;
    state[i] = v;
    applied.push(i);
  }
  return applied;
}

/** Состояние «ничего не известно». */
export function emptyState(p: Puzzle): Uint8Array {
  return new Uint8Array(p.grid.cellCount).fill(UNKNOWN);
}

export function countUnknown(state: Uint8Array): number {
  let u = 0;
  for (let i = 0; i < state.length; i++) if (state[i] !== KEEP && state[i] !== BREAK) u++;
  return u;
}

/**
 * Пропагация по линиям до неподвижной точки (§5.2). Очередь «грязных»
 * линий по трём осям; раунд — проход по линиям, ставшим грязными в прошлом раунде.
 * Скрытые подсказки ничего не ограничивают, поэтому их линии не обрабатываются.
 * `state` изменяется на месте.
 */
export function propagate(
  p: Puzzle,
  state: Uint8Array,
  opts: PropagateOptions = {},
): PropagationResult {
  const grid = p.grid;
  const solver = lineSolverFor(p.ruleset);
  const scratch = new Scratch(maxLineLength(p));
  const dirty = new Uint8Array(grid.totalLines);
  let queue: number[] = [];
  const initial = opts.dirty ?? range(grid.totalLines);
  for (const g of initial) {
    if (!p.hidden[g] && !dirty[g]) {
      dirty[g] = 1;
      queue.push(g);
    }
  }
  const result: PropagationResult = {
    status: 'stuck',
    rounds: 0,
    lineSteps: 0,
    lineVisits: 0,
    singleLineRounds: 0,
    unknown: 0,
  };
  if (opts.trace) result.trace = [];

  while (queue.length > 0) {
    const next: number[] = [];
    let progressed = 0;
    const roundTrace: LineDeduction[] | null = opts.trace ? [] : null;
    const snapshot = opts.layered ? state.slice() : null;
    // Послойно: линии, «загрязнённые» в этом раунде, идут в следующий, даже если
    // они ещё ждут обработки в текущем (они смотрят на снимок).
    if (snapshot) for (const g of queue) dirty[g] = 0;
    for (const g of queue) {
      // Без снимка в очереди нет повторов: линия попадает туда при переходе флага 0 → 1.
      if (!snapshot) dirty[g] = 0;
      result.lineVisits++;
      const changed = snapshot
        ? stepLineLayered(p, snapshot, state, g, solver, scratch)
        : stepLine(p, state, g, solver, scratch);
      if (changed === null) {
        result.status = 'contradiction';
        result.unknown = countUnknown(state);
        return result;
      }
      if (changed.length === 0) continue;
      progressed++;
      result.lineSteps++;
      const axis = grid.lineAxis[g] as Axis;
      for (const i of changed) {
        for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
          if (a === axis) continue;
          const h = grid.globalLineOf(a, i);
          if (!p.hidden[h] && !dirty[h]) {
            dirty[h] = 1;
            next.push(h);
          }
        }
      }
      if (roundTrace) {
        const keep: number[] = [];
        const brk: number[] = [];
        for (const i of changed) (state[i] === KEEP ? keep : brk).push(i);
        roundTrace.push({ line: g, keep, break: brk });
      }
    }
    if (progressed > 0) {
      result.rounds++;
      if (progressed === 1) result.singleLineRounds++;
      if (roundTrace) result.trace!.push(roundTrace);
    }
    queue = next;
  }
  result.unknown = countUnknown(state);
  result.status = result.unknown === 0 ? 'solved' : 'stuck';
  return result;
}

/**
 * Решаем ли уровень чистой логикой: пропагация с пустого состояния
 * определяет все ячейки. Это же гарантирует единственность решения (§5.2).
 */
export function isLogicSolvable(p: Puzzle): boolean {
  return propagate(p, emptyState(p)).status === 'solved';
}

/**
 * Число решений (не больше `limit`): перебор с возвратом и пропагацией.
 * Для тестов и отладки.
 */
export function countSolutions(p: Puzzle, limit = 2, start?: Uint8Array): number {
  const state = start ? start.slice() : emptyState(p);
  const res = propagate(p, state);
  if (res.status === 'contradiction') return 0;
  if (res.status === 'solved') return 1;
  return branch(p, state, limit);
}

function branch(p: Puzzle, state: Uint8Array, limit: number): number {
  let cell = -1;
  for (let i = 0; i < state.length; i++) {
    if (state[i] === UNKNOWN) {
      cell = i;
      break;
    }
  }
  let total = 0;
  for (const v of [KEEP, BREAK]) {
    const s = state.slice();
    s[cell] = v;
    const dirty = [0, 1, 2].map((a) => p.grid.globalLineOf(a as Axis, cell));
    const res = propagate(p, s, { dirty });
    if (res.status === 'contradiction') continue;
    total += res.status === 'solved' ? 1 : branch(p, s, limit - total);
    if (total >= limit) return total;
  }
  return total;
}

/** Решение как знание: KEEP для кубов фигуры, BREAK для остальных. */
export function solutionState(p: Puzzle): Uint8Array {
  const s = new Uint8Array(p.grid.cellCount);
  for (let i = 0; i < s.length; i++) s[i] = p.classes[i]! > 0 ? KEEP : BREAK;
  return s;
}

function* range(n: number): Iterable<number> {
  for (let i = 0; i < n; i++) yield i;
}
