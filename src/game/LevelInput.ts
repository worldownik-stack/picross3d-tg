import type { Axis } from '../core/types';
import type { Renderer } from '../render/Renderer';
import type { LevelController } from './LevelController';

export interface InputHost {
  readonly renderer: Renderer;
  controller(): LevelController | null;
  /** Ввод разрешён (нет паузы/модалки). */
  enabled(): boolean;
  setTool(tool: 'hammer' | 'brush'): void;
  setBrushHeld(on: boolean): void;
  cycleSliceAxis(): void;
  nudgeSlice(delta: number): void;
}

type Mode = 'idle' | 'pending' | 'stroke' | 'rotate' | 'pinch';

const ROTATE_SPEED = 0.0085; // рад на px
const KEY_SPEED = 1.9; // рад/с
const TOUCH_COMMIT_MS = 110;
const TOUCH_MOVE_PX = 7;

/**
 * Ввод на уровне (§3). Мышь: ЛКМ — инструмент, ПКМ — кисть, по пустому месту
 * или средней кнопкой — вращение, колесо — зум. Тач: тап/протяжка по кубу —
 * инструмент (с короткой задержкой, чтобы второй палец мог начать жест),
 * по пустому месту — вращение, двумя пальцами — вращение и pinch-зум.
 * Клавиши — по `event.code` (не зависят от раскладки).
 */
export class LevelInput {
  private mode: Mode = 'idle';
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private primary = -1;
  private last = { x: 0, y: 0 };
  private pending: {
    cell: number;
    x: number;
    y: number;
    tool: 'hammer' | 'brush';
    timer: number;
  } | null = null;
  private pinch = { dist: 0, x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private attached = false;

  constructor(private readonly host: InputHost) {}

  private get canvas(): HTMLCanvasElement {
    return this.host.renderer.canvas;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('pointerleave', this.onLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.releaseAll);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }

  /** Сбросить все удержания (потеря фокуса, пауза). */
  readonly releaseAll = (): void => {
    this.cancelPending();
    this.host.controller()?.endStroke();
    this.pointers.clear();
    this.mode = 'idle';
    this.primary = -1;
    this.keys.clear();
    this.host.setBrushHeld(false);
    const v = this.host.renderer.orbit.keyVelocity;
    v.az = 0;
    v.pitch = 0;
  };

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.host.enabled()) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* указатель мог уже исчезнуть */
    }
    const ctl = this.host.controller();
    if (this.pointers.size === 2) {
      if (this.mode === 'stroke') return; // протяжка уже идёт — второй палец игнорируем
      this.cancelPending();
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;
    this.primary = e.pointerId;
    this.last = p;
    if (e.pointerType === 'mouse') {
      if (e.button === 1) {
        this.mode = 'rotate';
        e.preventDefault();
        return;
      }
      const hit = ctl && !ctl.inputLocked ? ctl.pick(p.x, p.y) : null;
      if (hit && (e.button === 0 || e.button === 2)) {
        const tool = e.button === 2 ? 'brush' : ctl!.effectiveTool;
        ctl!.setHover(-1);
        ctl!.beginStroke(hit.cell, p.x, p.y, tool);
        this.mode = 'stroke';
      } else {
        this.mode = 'rotate';
      }
      return;
    }
    // Тач/перо.
    const hit = ctl && !ctl.inputLocked ? ctl.pick(p.x, p.y) : null;
    if (hit) {
      this.mode = 'pending';
      this.pending = {
        cell: hit.cell,
        x: p.x,
        y: p.y,
        tool: ctl!.effectiveTool,
        timer: window.setTimeout(() => this.commitPending(), TOUCH_COMMIT_MS),
      };
    } else {
      this.mode = 'rotate';
    }
  };

  private commitPending(): void {
    const pd = this.pending;
    if (!pd) return;
    clearTimeout(pd.timer);
    this.pending = null;
    const ctl = this.host.controller();
    if (!ctl || !this.host.enabled()) {
      this.mode = 'idle';
      return;
    }
    ctl.beginStroke(pd.cell, pd.x, pd.y, pd.tool);
    this.mode = 'stroke';
  }

  private cancelPending(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    this.pinch.dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
    this.pinch.x = (a!.x + b!.x) / 2;
    this.pinch.y = (a!.y + b!.y) / 2;
    this.mode = 'pinch';
  }

  private readonly onMove = (e: PointerEvent): void => {
    const p = this.local(e);
    const ctl = this.host.controller();
    if (!this.pointers.has(e.pointerId)) {
      // Ховер мышью без нажатия.
      if (e.pointerType === 'mouse' && this.mode === 'idle' && this.host.enabled())
        ctl?.hoverAt(p.x, p.y);
      return;
    }
    this.pointers.set(e.pointerId, p);
    const orbit = this.host.renderer.orbit;
    switch (this.mode) {
      case 'pending':
        if (e.pointerId !== this.primary) return;
        if (Math.hypot(p.x - this.pending!.x, p.y - this.pending!.y) < TOUCH_MOVE_PX) return;
        this.commitPending();
        ctl?.strokeMove(p.x, p.y);
        return;
      case 'stroke':
        if (e.pointerId === this.primary) ctl?.strokeMove(p.x, p.y);
        return;
      case 'rotate': {
        if (e.pointerId !== this.primary) return;
        orbit.rotate(-(p.x - this.last.x) * ROTATE_SPEED, (p.y - this.last.y) * ROTATE_SPEED);
        this.last = p;
        this.host.renderer.invalidate();
        return;
      }
      case 'pinch': {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
        const mx = (a!.x + b!.x) / 2;
        const my = (a!.y + b!.y) / 2;
        orbit.zoomBy(this.pinch.dist / dist);
        orbit.rotate(-(mx - this.pinch.x) * ROTATE_SPEED, (my - this.pinch.y) * ROTATE_SPEED);
        this.pinch = { dist, x: mx, y: my };
        this.host.renderer.invalidate();
        return;
      }
      default:
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const ctl = this.host.controller();
    if (this.mode === 'pending' && e.pointerId === this.primary) {
      if (e.type === 'pointerup') this.commitPending();
      else this.cancelPending();
      ctl?.endStroke();
      this.mode = 'idle';
    } else if (this.mode === 'stroke' && e.pointerId === this.primary) {
      ctl?.endStroke();
      this.mode = 'idle';
    } else if (this.mode === 'pinch') {
      if (this.pointers.size === 1) {
        const [id, p] = [...this.pointers.entries()][0]!;
        this.primary = id;
        this.last = p;
        this.mode = 'rotate';
      } else {
        this.mode = 'idle';
      }
    } else if (e.pointerId === this.primary) {
      this.mode = 'idle';
    }
    if (this.pointers.size === 0) this.mode = 'idle';
  };

  private readonly onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !this.pointers.has(e.pointerId))
      this.host.controller()?.setHover(-1);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.host.enabled()) return;
    this.host.renderer.orbit.zoomBy(Math.exp(e.deltaY * 0.0012));
    this.host.renderer.invalidate();
  };

  private updateKeyVelocity(): void {
    const v = this.host.renderer.orbit.keyVelocity;
    const k = this.keys;
    v.az =
      ((k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
        (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)) *
      -KEY_SPEED;
    v.pitch =
      ((k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
        (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)) *
      KEY_SPEED;
    this.host.renderer.invalidate();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // системные сочетания не трогаем
    if (!this.host.enabled()) return;
    const code = e.code;
    switch (code) {
      case 'Digit1':
      case 'Numpad1':
        this.host.setTool('hammer');
        break;
      case 'Digit2':
      case 'Numpad2':
        this.host.setTool('brush');
        break;
      case 'Space':
        e.preventDefault();
        if (!e.repeat) this.host.setBrushHeld(true);
        return;
      case 'KeyW':
      case 'KeyA':
      case 'KeyS':
      case 'KeyD':
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        this.keys.add(code);
        this.updateKeyVelocity();
        return;
      case 'KeyR':
        if (!e.repeat) this.host.cycleSliceAxis();
        break;
      case 'KeyQ':
        this.host.nudgeSlice(-1);
        break;
      case 'KeyE':
        this.host.nudgeSlice(1);
        break;
      default:
        return;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.host.setBrushHeld(false);
      return;
    }
    if (this.keys.delete(e.code)) this.updateKeyVelocity();
  };
}

export type { Axis };
