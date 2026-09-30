import type { BrushResult, GameSession, HammerResult, Tool } from './game';
import type { Axis } from './types';

export type StrokeEvent =
  | { tool: 'hammer'; cell: number; result: HammerResult }
  | { tool: 'brush'; cell: number; result: BrushResult };

/**
 * Протяжка (§2.6): действие применяется ко всем кубам по пути вдоль одной линии.
 * Ось фиксируется по первому переходу на соседний куб (`lockAxis`).
 * Молоток пропускает помеченные кубы и обрывается на первом промахе.
 * Кисть ставит или снимает пометку — режим определяется по первому кубу.
 */
export class Stroke {
  axis: Axis | null = null;
  ended = false;
  /** Режим кисти, определённый по первому кубу. */
  readonly brushMode: 'set' | 'clear';
  /** Пройденный диапазон смещений от стартовой ячейки вдоль оси. */
  private lo = 0;
  private hi = 0;
  private readonly startCoord: [number, number, number];

  constructor(
    private readonly session: GameSession,
    readonly tool: Tool,
    readonly start: number,
    private readonly interactive: (i: number) => boolean = () => true,
    private readonly onEvent: (e: StrokeEvent) => void = () => {},
  ) {
    this.startCoord = session.grid.coords(start);
    this.brushMode = session.marked[start] ? 'clear' : 'set';
  }

  /** Применить инструмент к стартовому кубу. */
  begin(): void {
    this.apply(this.start, true);
  }

  lockAxis(axis: Axis): void {
    if (this.axis === null) this.axis = axis;
  }

  /** Ячейка на линии протяжки по смещению от старта (или -1 за пределами поля). */
  cellAt(offset: number): number {
    if (this.axis === null) return offset === 0 ? this.start : -1;
    const c: [number, number, number] = [...this.startCoord];
    c[this.axis] += offset;
    return this.session.grid.contains(c[0], c[1], c[2]) ? this.session.grid.index(...c) : -1;
  }

  /** Допустимый диапазон смещений вдоль зафиксированной оси. */
  offsetRange(): [number, number] {
    if (this.axis === null) return [0, 0];
    const s = this.startCoord[this.axis];
    return [0 - s, this.session.grid.size[this.axis] - 1 - s];
  }

  /** Протянуть до смещения `offset` (включительно), по порядку от старта. */
  extendTo(offset: number): void {
    if (this.ended || this.axis === null) return;
    const [min, max] = this.offsetRange();
    const target = Math.max(min, Math.min(max, Math.round(offset)));
    while (!this.ended && this.hi < target) {
      this.hi++;
      this.apply(this.cellAt(this.hi), false);
    }
    while (!this.ended && this.lo > target) {
      this.lo--;
      this.apply(this.cellAt(this.lo), false);
    }
  }

  private apply(i: number, first: boolean): void {
    if (i < 0 || !this.interactive(i) || this.session.status !== 'playing') return;
    const s = this.session;
    if (this.tool === 'hammer') {
      if (!first && s.marked[i]) return; // помеченные при протяжке пропускаются
      const result = s.hammer(i);
      if (result !== 'none') this.onEvent({ tool: 'hammer', cell: i, result });
      if (result === 'miss') this.ended = true;
    } else {
      const result = s.brush(i, this.brushMode);
      if (result !== 'none') this.onEvent({ tool: 'brush', cell: i, result });
    }
    if (s.status !== 'playing') this.ended = true;
  }
}
