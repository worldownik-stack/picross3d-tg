import { Quaternion, Vector2, Vector3 } from 'three';
import type { Settings } from '../app/settings';
import { GameSession, type Tool } from '../core/game';
import { levelPuzzle, type Level } from '../core/level';
import { pickVoxel, type PickHit } from '../core/pick';
import { isSliced, clampSlice, NO_SLICE, type SliceState } from '../core/slice';
import { Stroke, type StrokeEvent } from '../core/stroke';
import type { Axis } from '../core/types';
import { BlockView } from '../render/BlockView';
import {
  CUBE_COLORS,
  LIGHT_DIR,
  ST_CRACKED,
  ST_FLASH,
  ST_HIDDEN,
  ST_HINT,
  ST_HOVER,
  ST_LINE,
  ST_MARKED,
} from '../render/cubeMaterial';
import type { GlyphAtlas } from '../render/glyphAtlas';
import type { Renderer } from '../render/Renderer';

/** Игровые события для звука и обучения. */
export type LevelFx = 'break' | 'miss' | 'bonk' | 'mark' | 'unmark' | 'solved';

export interface LevelEvents {
  /** Изменились промахи, инструмент, срез и т. п. — обновить HUD. */
  onChange(): void;
  onMiss(): void;
  /** Волна окраски закончилась, фигура «ожила». */
  onWin(): void;
  onLose(): void;
  /** Звуки и обучение: каждый удар, пометка, решение. */
  onFx?(kind: LevelFx, cell: number): void;
}

/** Порог сдвига указателя (px) для фиксации оси протяжки. */
const AXIS_LOCK_PX = 14;

/**
 * Контроллер уровня: связывает игровую сессию (ядро), вид (рендер) и ввод.
 * Логика правил — в `GameSession`/`Stroke`, здесь только оркестрация и эффекты.
 */
export class LevelController {
  readonly session: GameSession;
  readonly view: BlockView;
  tool: Tool = 'hammer';
  /** Кисть «на удержании» (Space или кнопка). */
  brushHeld = false;
  slice: SliceState = { ...NO_SLICE };
  inputLocked = false;
  private hover = -1;
  private stroke: Stroke | null = null;
  private strokeStart = { x: 0, y: 0 };
  private readonly solid = (i: number) =>
    !this.session.broken[i] && !isSliced(this.grid, this.slice, i);
  private readonly interactive = (i: number) => this.solid(i);
  private readonly o = new Vector3();
  private readonly d = new Vector3();
  private readonly c = new Vector3();
  private readonly sv = new Vector2();
  private disposed = false;
  private aliveAnim: ((dt: number, t: number) => boolean) | null = null;

  constructor(
    readonly renderer: Renderer,
    readonly level: Level,
    atlas: GlyphAtlas,
    private readonly settings: () => Readonly<Settings>,
    private readonly events: LevelEvents,
    session?: GameSession,
  ) {
    const puzzle = levelPuzzle(level);
    this.session = session ?? new GameSession(puzzle, level.id, level.targetTime);
    this.view = new BlockView(this.session.puzzle, atlas, level.palette, level.cells);
    this.syncAll();
    renderer.setBlock(this.view);
  }

  get grid() {
    return this.session.grid;
  }

  get effectiveTool(): Tool {
    return this.brushHeld ? 'brush' : this.tool;
  }

  get hoverCell(): number {
    return this.hover;
  }

  get isStroking(): boolean {
    return this.stroke !== null;
  }

  // ---------- Состояние вида ----------

  /** Полная синхронизация флагов вида с сессией и срезом. */
  syncAll(): void {
    const s = this.session;
    for (let i = 0; i < this.grid.cellCount; i++) {
      this.view.setFlag(i, ST_HIDDEN, !!s.broken[i] || isSliced(this.grid, this.slice, i));
      this.view.setFlag(i, ST_MARKED, !!s.marked[i]);
      this.view.setFlag(i, ST_CRACKED, !!s.cracked[i]);
    }
    this.refreshDims(null);
    this.renderer.invalidate();
  }

  /** Затемнение выполненных линий (по знаниям игрока). */
  refreshDims(cells: readonly number[] | null): void {
    const on = this.settings().dimCompleted;
    const grid = this.grid;
    const lines = new Set<number>();
    if (cells === null) for (let g = 0; g < grid.totalLines; g++) lines.add(g);
    else
      for (const i of cells) for (let a = 0; a < 3; a++) lines.add(grid.globalLineOf(a as Axis, i));
    for (const g of lines) {
      const axis = grid.lineAxis[g] as Axis;
      const done = on && this.session.isLineDone(g);
      const n = grid.size[axis];
      const step = grid.strides[axis];
      for (let k = 0, i = grid.lineStart[g]!; k < n; k++, i += step)
        this.view.setDim(i, axis, done);
    }
  }

  // ---------- Пикинг и ховер ----------

  pick(x: number, y: number): PickHit | null {
    if (!this.renderer.rayToGrid(x, y, this.o, this.d)) return null;
    return pickVoxel(
      this.grid,
      this.o.x,
      this.o.y,
      this.o.z,
      this.d.x,
      this.d.y,
      this.d.z,
      this.solid,
    );
  }

  setHover(cell: number): void {
    if (cell === this.hover) return;
    const grid = this.grid;
    const lineHi = this.settings().lineHighlight;
    const mark = (c: number, on: boolean) => {
      this.view.setFlag(c, ST_HOVER, on);
      if (!lineHi) return;
      for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
        const g = grid.globalLineOf(a, c);
        const n = grid.size[a];
        const step = grid.strides[a];
        for (let k = 0, i = grid.lineStart[g]!; k < n; k++, i += step)
          this.view.setFlag(i, ST_LINE, on);
      }
    };
    if (this.hover >= 0) mark(this.hover, false);
    this.hover = cell;
    if (cell >= 0) mark(cell, true);
    this.renderer.invalidate();
  }

  hoverAt(x: number, y: number): void {
    if (this.inputLocked) return this.setHover(-1);
    this.setHover(this.pick(x, y)?.cell ?? -1);
  }

  // ---------- Протяжка ----------

  /** Начать протяжку с куба `cell` (инструмент применяется к нему сразу). */
  beginStroke(cell: number, x: number, y: number, tool: Tool = this.effectiveTool): void {
    if (this.inputLocked || this.session.status !== 'playing') return;
    this.endStroke();
    this.stroke = new Stroke(this.session, tool, cell, this.interactive, this.onStrokeEvent);
    this.strokeStart = { x, y };
    this.stroke.begin();
    this.afterActions();
  }

  strokeMove(x: number, y: number): void {
    const st = this.stroke;
    if (!st || st.ended || this.inputLocked) return;
    if (st.axis === null) {
      const dx = x - this.strokeStart.x;
      const dy = y - this.strokeStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist < AXIS_LOCK_PX) return;
      const axis = this.axisByScreenDirection(st.start, dx, dy, dist);
      if (axis === null) return;
      st.lockAxis(axis);
    }
    st.extendTo(this.offsetAlongAxis(st, x, y));
    this.afterActions();
  }

  endStroke(): void {
    this.stroke = null;
  }

  /** Ось, экранная проекция которой лучше всего совпадает с движением. */
  private axisByScreenDirection(cell: number, dx: number, dy: number, dist: number): Axis | null {
    this.view.cellCenter(cell, this.c);
    let best: Axis | null = null;
    let bestScore = 0;
    let maxLen = 0;
    const lens = [0, 0, 0];
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      this.renderer.screenAxis(this.c, a, this.sv);
      lens[a] = this.sv.length();
      maxLen = Math.max(maxLen, lens[a]!);
    }
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      if (this.grid.size[a] < 2) continue;
      const len = lens[a]!;
      if (len < 6 || len < maxLen * 0.3) continue;
      this.renderer.screenAxis(this.c, a, this.sv);
      const score = Math.abs(this.sv.x * dx + this.sv.y * dy) / (len * dist);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return bestScore > 0.55 ? best : null;
  }

  /** Смещение вдоль оси протяжки: ближайшая к лучу указателя точка линии. */
  private offsetAlongAxis(st: Stroke, x: number, y: number): number {
    const axis = st.axis!;
    this.renderer.rayToGrid(x, y, this.o, this.d);
    const g = this.grid;
    // Центр стартовой ячейки в пространстве сетки.
    const cx = g.x(st.start) + 0.5;
    const cy = g.y(st.start) + 0.5;
    const cz = g.z(st.start) + 0.5;
    const A = [0, 0, 0];
    A[axis] = 1;
    const wx = cx - this.o.x;
    const wy = cy - this.o.y;
    const wz = cz - this.o.z;
    const b = A[0]! * this.d.x + A[1]! * this.d.y + A[2]! * this.d.z;
    const dd = A[0]! * wx + A[1]! * wy + A[2]! * wz;
    const e = this.d.x * wx + this.d.y * wy + this.d.z * wz;
    const denom = 1 - b * b;
    if (denom > 0.01) return (b * e - dd) / denom;
    // Ось почти параллельна взгляду — по экранной проекции.
    this.view.cellCenter(st.start, this.c);
    const p = this.renderer.project(this.c, this.o);
    this.renderer.screenAxis(this.c, axis, this.sv);
    const l2 = this.sv.lengthSq() || 1;
    return ((x - p.x) * this.sv.x + (y - p.y) * this.sv.y) / l2;
  }

  private readonly changedCells: number[] = [];

  private readonly onStrokeEvent = (e: StrokeEvent): void => {
    const i = e.cell;
    this.changedCells.push(i);
    if (e.tool === 'hammer') {
      if (e.result === 'broken') {
        this.view.setFlag(i, ST_HIDDEN, true);
        if (i === this.hover) this.setHover(-1);
        this.view.cellCenter(i, this.c);
        this.renderer.particles.burst(this.c.x, this.c.y, this.c.z, CUBE_COLORS.stone, 7);
        this.renderer.playTool('hammer', this.c);
        this.renderer.invalidate();
        this.events.onFx?.('break', i);
      } else if (e.result === 'miss') {
        this.view.setFlag(i, ST_CRACKED, true);
        this.view.setFlag(i, ST_MARKED, true);
        this.renderer.playTool('hammer', this.view.cellCenter(i, this.c));
        this.renderer.orbit.shake(0.1);
        if (this.settings().vibration && 'vibrate' in navigator) navigator.vibrate?.(70);
        this.events.onFx?.('miss', i);
        this.events.onMiss();
      } else if (e.result === 'bonk') {
        this.flash(i);
        this.renderer.playTool('hammer', this.view.cellCenter(i, this.c));
        this.events.onFx?.('bonk', i);
      }
    } else {
      this.view.setFlag(i, ST_MARKED, e.result === 'marked');
      this.renderer.playTool('brush', this.view.cellCenter(i, this.c));
      this.events.onFx?.(e.result === 'marked' ? 'mark' : 'unmark', i);
    }
  };

  private flash(i: number): void {
    this.view.setFlag(i, ST_FLASH, true);
    let t = 0;
    this.renderer.animate((dt) => {
      t += dt;
      if (t < 0.12 || this.disposed) return !this.disposed;
      this.view.setFlag(i, ST_FLASH, false);
      return false;
    });
  }

  /** После пачки действий: затемнения, HUD, победа/поражение. */
  private afterActions(): void {
    if (this.changedCells.length) {
      this.refreshDims(this.changedCells);
      this.changedCells.length = 0;
      this.renderer.invalidate();
      this.events.onChange();
    }
    if (this.session.status === 'won' && !this.inputLocked) this.win();
    else if (this.session.status === 'lost' && !this.inputLocked) {
      this.inputLocked = true;
      this.endStroke();
      this.setHover(-1);
      this.events.onLose();
    }
  }

  // ---------- Прямые действия (debug-API, бот, подсказка) ----------

  hammerCell(i: number): void {
    if (this.inputLocked) return;
    const st = new Stroke(this.session, 'hammer', i, () => true, this.onStrokeEvent);
    st.begin();
    this.afterActions();
  }

  brushCell(i: number, mode: 'set' | 'clear' = 'set'): void {
    if (this.inputLocked) return;
    const r = this.session.brush(i, mode);
    if (r !== 'none') this.onStrokeEvent({ tool: 'brush', cell: i, result: r });
    this.afterActions();
  }

  /** Подсветить линию (для подсказки). */
  highlightLine(g: number, on: boolean): void {
    const grid = this.grid;
    const axis = grid.lineAxis[g] as Axis;
    for (let k = 0, i = grid.lineStart[g]!; k < grid.size[axis]; k++, i += grid.strides[axis]) {
      this.view.setFlag(i, ST_HINT, on);
    }
    this.renderer.invalidate();
  }

  // ---------- Срезы ----------

  setSlice(next: SliceState): void {
    const s = clampSlice(this.grid, next);
    if (s.axis === this.slice.axis && s.side === this.slice.side && s.depth === this.slice.depth)
      return;
    this.slice = s;
    for (let i = 0; i < this.grid.cellCount; i++) {
      this.view.setFlag(i, ST_HIDDEN, !!this.session.broken[i] || isSliced(this.grid, s, i));
    }
    if (this.hover >= 0 && !this.solid(this.hover)) this.setHover(-1);
    this.renderer.invalidate();
    this.events.onChange();
  }

  /** Сдвинуть срез по оси на ±1 слой (сторона — к камере, при старте). */
  nudgeSlice(axis: Axis, delta: number): void {
    const cur = this.slice;
    const same = cur.axis === axis && cur.depth > 0;
    const side = same ? cur.side : axis === 1 ? 1 : this.renderer.orbit.nearSide(axis);
    const depth = (same ? cur.depth : 0) + delta;
    this.setSlice({ axis, side, depth: Math.max(0, depth) });
  }

  // ---------- Время ----------

  tick(dt: number): void {
    if (this.session.status !== 'playing') return;
    this.session.tick(dt);
    this.afterActions(); // лимит времени (для будущих режимов)
  }

  // ---------- Победа ----------

  private win(): void {
    this.inputLocked = true;
    this.endStroke();
    this.setHover(-1);
    this.view.clearFlag(ST_LINE | ST_HINT | ST_FLASH);
    this.setSlice({ ...NO_SLICE });
    this.renderer.orbit.reset(this.renderer.orbit.az, 0.42, 1);
    const duration = this.view.startReveal();
    this.events.onFx?.('solved', -1);
    let t = 0;
    this.renderer.animate((dt) => {
      if (this.disposed) return false;
      t += dt;
      this.view.setRevealTime(t);
      if (t < duration) return true;
      this.startAlive();
      this.events.onWin();
      return false;
    });
    this.events.onChange();
  }

  /** «Оживление» фигуры: простая процедурная анимация из данных уровня (§2.9). */
  private startAlive(): void {
    const g = this.view.group;
    const u = this.view.material.uniforms;
    const lightW = new Vector3(...LIGHT_DIR).normalize();
    const upW = new Vector3(0, 1, 0);
    const inv = new Quaternion();
    const kind = this.level.anim;
    const anim = (_dt: number, time: number): boolean => {
      if (this.disposed || this.aliveAnim !== anim) return false;
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      if (kind === 'bob') {
        g.position.y = 0.25 + Math.sin(time * 2.4) * 0.25;
        g.rotation.y = Math.sin(time * 0.8) * 0.35;
      } else if (kind === 'spin') {
        g.position.y = 0.2;
        g.rotation.y = time * 1.3;
      } else if (kind === 'hop') {
        const ph = (time * 1.6) % 1;
        const h = Math.sin(ph * Math.PI);
        g.position.y = h * 0.9;
        const squash = ph < 0.12 ? 1 - (0.12 - ph) * 1.2 : 1;
        g.scale.set(2 - squash, squash, 2 - squash);
      } else {
        g.rotation.z = Math.sin(time * 3.2) * 0.12;
        g.rotation.x = Math.cos(time * 2.6) * 0.06;
      }
      g.updateMatrixWorld();
      inv.copy(g.quaternion).invert();
      (u.uLightDir!.value as Vector3).copy(lightW).applyQuaternion(inv);
      (u.uUp!.value as Vector3).copy(upW).applyQuaternion(inv);
      return true;
    };
    this.aliveAnim = anim;
    this.renderer.animate(anim);
  }

  /** Продолжить после поражения (награда за rewarded). */
  continueAfterLoss(): boolean {
    if (!this.session.continueAfterLoss()) return false;
    this.inputLocked = false;
    this.events.onChange();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.aliveAnim = null;
    this.stroke = null;
    this.renderer.setBlock(null);
    this.view.dispose();
  }
}
