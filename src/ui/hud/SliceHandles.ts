import { Vector3 } from 'three';
import type { Axis } from '../../core/types';
import type { LevelController } from '../../game/LevelController';
import type { Renderer } from '../../render/Renderer';
import { KNOB_REST_OUT } from '../../render/OrbitCamera';
import { h } from '../dom';

const AXIS_LABEL = ['X', 'Y', 'Z'] as const;
const AXIS_COLOR: readonly [number, number, number][] = [
  [0xe0, 0x60, 0x4a],
  [0x4c, 0xa8, 0x62],
  [0x3d, 0x86, 0xd0],
];
const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_TRACK_PX = 44;
/** Отступ центра ручки от края экрана, px: зона нажатия 56 px и ромб целиком. */
const EDGE_PX = 38;
/**
 * Ромб-флажок: торчит из плоскости среза наружу от блока. Половины диагоналей (длинная —
 * наружу, короткая — вдоль оси среза), высота пирамидки и зазор до блока, кубов.
 */
const GEM_LONG = 0.75;
const GEM_SHORT = 0.42;
const GEM_RISE = 0.3;
const GEM_GAP = 0.25;
/** Ромб на экране — не меньше, px (по большей диагонали); увеличение — не больше. */
const GEM_MIN_PX = 64;
const GEM_MAX_SCALE = 2.5;
/** Ось взгляда меняется, только когда новая заметно ближе к взгляду (без мигания на 45°). */
const VIEW_HYST = 0.08;
/** Шаг перетаскивания на один слой — не меньше, px. */
const MIN_LAYER_PX = 30;

interface Track {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ok: boolean;
}

/**
 * Ручка среза (§2.7, D-059) — одна: объёмный цветной ромб у силуэта блока, режет вдоль
 * взгляда — по оси, ближайшей к направлению камеры. Чтобы резать по другой оси, блок
 * поворачивают; срез при этом остаётся. Ромб X торчит из-за дальнего по Z ребра (на экране
 * справа), Z — из-за дальнего по X (слева), Y — над дальним углом. Ручка стоит в плоскости
 * среза и едет вместе с ней, не закрывая кубы. Новая ось сбрасывает прежний срез.
 */
export class SliceHandles {
  readonly el: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly guides: SVGLineElement[] = [];
  private readonly gems: SVGGElement[] = [];
  private readonly faces: SVGPolygonElement[][] = [];
  private readonly knobs: HTMLElement[] = [];
  private readonly tracks: Track[] = [0, 1, 2].map(() => ({
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
    ok: false,
  }));
  private drag: {
    axis: Axis;
    side: 1 | -1;
    pointer: number;
    /** Начало жеста, глубина в начале, направление «глубже» на экране и шаг на слой. */
    x0: number;
    y0: number;
    depth0: number;
    ux: number;
    uy: number;
    step: number;
  } | null = null;
  /** Ось взгляда — та, по которой сейчас показана ручка. */
  private viewAxis: Axis | null = null;
  /** Экранный центр ручки по осям (для направления жеста). */
  private readonly pos = new Float32Array(6);
  private readonly dir = new Vector3();
  private readonly p = new Vector3();
  private readonly q = new Vector3();
  private readonly c = new Vector3();
  private readonly u = new Vector3();
  private readonly v = new Vector3();
  private readonly light = new Vector3();
  private readonly cam = new Vector3();
  private readonly corners = [0, 1, 2, 3, 4].map(() => new Vector3());
  private readonly screen = [0, 1, 2, 3, 4].map(() => new Vector3());
  private readonly n = new Vector3();
  private readonly e1 = new Vector3();
  private readonly e2 = new Vector3();

  constructor(
    private readonly renderer: Renderer,
    private readonly controller: () => LevelController | null,
    private readonly enabled: () => boolean,
  ) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'slice-svg');
    this.el = h('div', { class: 'slice-layer' });
    this.el.append(this.svg);
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      const guide = document.createElementNS(SVG_NS, 'line');
      guide.setAttribute('class', `slice-guide axis-${a}`);
      this.svg.append(guide);
      this.guides.push(guide);
    }
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      const gem = document.createElementNS(SVG_NS, 'g');
      gem.setAttribute('class', `slice-gem axis-${a}`);
      // Основание (контур) и четыре грани пирамидки.
      const polys: SVGPolygonElement[] = [];
      for (let k = 0; k < 5; k++) {
        const poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('class', k === 0 ? 'gem-base' : 'gem-face');
        gem.append(poly);
        polys.push(poly);
      }
      this.svg.append(gem);
      this.gems.push(gem);
      this.faces.push(polys);
      const knob = h('button', {
        class: `slice-knob axis-${a}`,
        attrs: {
          type: 'button',
          'data-testid': `slice-knob-${AXIS_LABEL[a]}`,
          'aria-label': `Slice ${AXIS_LABEL[a]}`,
        },
      });
      knob.addEventListener('pointerdown', (e) => this.onDown(e, a));
      knob.addEventListener('pointermove', this.onMove);
      knob.addEventListener('pointerup', this.onUp);
      knob.addEventListener('pointercancel', this.onUp);
      this.knobs.push(knob);
      this.el.append(knob);
    }
  }

  /** Пересчитать положение ручек после кадра. */
  update(): void {
    const ctl = this.controller();
    const show = !!ctl && !ctl.inputLocked && this.enabled();
    this.el.classList.toggle('hidden', !show);
    if (!ctl || !show) return;
    const size = ctl.grid.size;
    const cam = this.renderer.orbit.camera;
    this.cam.copy(cam.position);
    // Свет — сверху слева от камеры, чтобы грани читались при любом повороте.
    this.light.set(-0.45, 0.85, 0.4).applyQuaternion(cam.quaternion).normalize();
    const axis = this.pickAxis(size);
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      const s = this.tracks[a]!;
      if (a !== axis) {
        s.ok = false;
        this.hideAxis(a);
        continue;
      }
      const k = this.gemScale(a, size);
      const pa = this.renderer.project(this.anchor(a, 0, size, k, this.q), this.p);
      s.ax = pa.x;
      s.ay = pa.y;
      const okA = pa.z < 1;
      const pb = this.renderer.project(this.anchor(a, size[a], size, k, this.q), this.p);
      s.bx = pb.x;
      s.by = pb.y;
      // Ось взгляда на экране короткая; если трек вырожден, жест идёт к центру блока.
      s.ok = okA && pb.z < 1 && Math.hypot(s.bx - s.ax, s.by - s.ay) >= MIN_TRACK_PX;
      const sl = ctl.slice;
      const active = sl.axis === a && sl.depth > 0;
      const side = active ? sl.side : this.sideFor(a);
      const depth = active ? sl.depth : 0;
      // Ручка — в плоскости среза; в покое — чуть за краем блока.
      const c =
        depth > 0
          ? side > 0
            ? size[a] - depth
            : depth
          : side > 0
            ? size[a] + KNOB_REST_OUT
            : -KNOB_REST_OUT;
      this.anchor(a, c, size, k, this.c);
      const center = this.renderer.project(this.c, this.p);
      // Ручка всегда целиком на экране: ромб и зона нажатия сдвигаются вместе.
      const { width, height } = this.renderer.viewportSize;
      const kx = clamp(center.x, EDGE_PX, width - EDGE_PX);
      const ky = clamp(center.y, EDGE_PX, height - EDGE_PX);
      this.drawGem(a, k, kx - center.x, ky - center.y);
      const guide = this.guides[a]!;
      const dragging = this.drag?.axis === a;
      // Направляющая — только пока тянут: в покое пересекала бы блок.
      guide.style.display = dragging && s.ok ? '' : 'none';
      guide.setAttribute('x1', String(s.ax));
      guide.setAttribute('y1', String(s.ay));
      guide.setAttribute('x2', String(s.bx));
      guide.setAttribute('y2', String(s.by));
      this.gems[a]!.style.display = '';
      this.gems[a]!.classList.toggle('active', active || dragging);
      const knob = this.knobs[a]!;
      knob.style.display = '';
      knob.classList.toggle('active', active);
      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px) translate(-50%, -50%)`;
      this.pos[a * 2] = kx;
      this.pos[a * 2 + 1] = ky;
    }
  }

  /** Ось, ближайшая к направлению взгляда (с гистерезисом); во время жеста — его ось. */
  private pickAxis(size: readonly [number, number, number]): Axis | null {
    if (this.drag) return this.drag.axis;
    const orbit = this.renderer.orbit;
    const d = this.dir.copy(orbit.camera.position).sub(orbit.target).normalize();
    const comp = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)];
    const cur = this.viewAxis !== null && size[this.viewAxis] >= 2 ? this.viewAxis : null;
    let best = cur;
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      if (size[a] < 2 || a === best) continue;
      if (best === null || comp[a]! > comp[best]! + (best === cur ? VIEW_HYST : 0)) best = a;
    }
    this.viewAxis = best;
    return best;
  }

  /** Дальние стороны блока по X и Z (от камеры): за ними ручки не закрывают кубы. */
  private far(): [number, number] {
    const orbit = this.renderer.orbit;
    return [-orbit.nearSide(0), -orbit.nearSide(2)];
  }

  /** Точка на дальнем ребре для оси `a` на координате `c` (0…size[a]); X, Z — на середине высоты. */
  private edge(a: Axis, c: number, size: readonly [number, number, number], out: Vector3) {
    const [X, Y, Z] = size;
    const [fx, fz] = this.far();
    if (a === 0) return out.set(c - X / 2, Y / 2, (fz * Z) / 2);
    if (a === 2) return out.set((fx * X) / 2, Y / 2, c - Z / 2);
    return out.set((fx * X) / 2, c, (fz * Z) / 2);
  }

  /**
   * Направление флажка наружу (`u`, горизонтально) и поперёк него (`v`) — перпендикулярно
   * и `u`, и взгляду: ромб повёрнут к камере и не виден ребром, даже если смотреть вровень.
   */
  private axes(a: Axis): void {
    const [fx, fz] = this.far();
    if (a === 0) this.u.set(0, 0, fz);
    else if (a === 2) this.u.set(fx, 0, 0);
    else this.u.set(fx, 0, fz).normalize();
    const orbit = this.renderer.orbit;
    this.dir.copy(orbit.camera.position).sub(orbit.target).normalize();
    this.v.crossVectors(this.dir, this.u);
    if (this.v.lengthSq() < 0.04) this.v.set(-this.u.z, 0, this.u.x);
    else this.v.normalize();
  }

  /** Во сколько раз увеличить ромб, чтобы на экране он был не меньше GEM_MIN_PX. */
  private gemScale(a: Axis, size: readonly [number, number, number]): number {
    this.axes(a);
    const E = this.edge(a, size[a] / 2, size, this.q);
    const p0 = this.renderer.project(E, this.p);
    const x0 = p0.x;
    const y0 = p0.y;
    const pu = this.renderer.project(this.n.copy(E).addScaledVector(this.u, GEM_LONG), this.p);
    const du = Math.hypot(pu.x - x0, pu.y - y0);
    const pv = this.renderer.project(this.n.copy(E).addScaledVector(this.v, GEM_SHORT), this.p);
    const dv = Math.hypot(pv.x - x0, pv.y - y0);
    const px = 2 * Math.max(du, dv);
    return Math.min(GEM_MAX_SCALE, Math.max(1, GEM_MIN_PX / Math.max(1, px)));
  }

  /** Центр ромба оси `a` на координате `c`: от ребра наружу на зазор и полдиагонали. */
  private anchor(
    a: Axis,
    c: number,
    size: readonly [number, number, number],
    k: number,
    out: Vector3,
  ): Vector3 {
    this.axes(a);
    return this.edge(a, c, size, out).addScaledVector(this.u, GEM_GAP + GEM_LONG * k);
  }

  /** Ромб-пирамидка с центром в `this.c` в перспективе, со сдвигом (dx, dy) на экране. */
  private drawGem(a: Axis, k: number, dx: number, dy: number): void {
    const C = this.c;
    this.axes(a);
    const long = GEM_LONG;
    const short = GEM_SHORT;
    const [P0, P1, P2, P3, T] = this.corners as [Vector3, Vector3, Vector3, Vector3, Vector3];
    P0.copy(C).addScaledVector(this.u, long * k);
    P1.copy(C).addScaledVector(this.v, short * k);
    P2.copy(C).addScaledVector(this.u, -long * k);
    P3.copy(C).addScaledVector(this.v, -short * k);
    // Вершина пирамидки — по нормали ромба, к камере.
    this.n.crossVectors(this.u, this.v).normalize();
    if (this.n.dot(this.e1.subVectors(this.cam, C)) < 0) this.n.negate();
    T.copy(C).addScaledVector(this.n, GEM_RISE * k);
    for (let i = 0; i < 5; i++) {
      const sp = this.renderer.project(this.corners[i]!, this.screen[i]!);
      sp.x += dx;
      sp.y += dy;
    }
    const pt = (i: number) => `${this.screen[i]!.x.toFixed(1)},${this.screen[i]!.y.toFixed(1)}`;
    const polys = this.faces[a]!;
    polys[0]!.setAttribute('points', `${pt(0)} ${pt(1)} ${pt(2)} ${pt(3)}`);
    const [r, g, b] = AXIS_COLOR[a]!;
    for (let f = 0; f < 4; f++) {
      const A = this.corners[f]!;
      const B = this.corners[(f + 1) % 4]!;
      // Нормаль грани (T, A, B) наружу и освещённость.
      this.e1.subVectors(A, T);
      this.e2.subVectors(B, T);
      this.n.crossVectors(this.e1, this.e2).normalize();
      this.q.addVectors(A, B).add(T).divideScalar(3);
      if (this.n.dot(this.p.subVectors(this.q, C)) < 0) this.n.negate();
      const lit = 0.62 + 0.55 * Math.max(0, this.n.dot(this.light));
      const poly = polys[f + 1]!;
      poly.setAttribute('points', `${pt(4)} ${pt(f)} ${pt((f + 1) % 4)}`);
      poly.setAttribute(
        'fill',
        `rgb(${Math.min(255, r * lit) | 0},${Math.min(255, g * lit) | 0},${Math.min(255, b * lit) | 0})`,
      );
    }
  }

  private hideAxis(a: Axis): void {
    this.guides[a]!.style.display = 'none';
    this.gems[a]!.style.display = 'none';
    this.knobs[a]!.style.display = 'none';
  }

  /** Сторона, с которой срезаем: к камере (для Y — всегда сверху). */
  private sideFor(a: Axis): 1 | -1 {
    return a === 1 ? 1 : this.renderer.orbit.nearSide(a);
  }

  private onDown(e: PointerEvent, axis: Axis): void {
    const ctl = this.controller();
    if (!ctl || ctl.inputLocked || !this.enabled()) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const sl = ctl.slice;
    const active = sl.axis === axis && sl.depth > 0;
    const side = active ? sl.side : this.sideFor(axis);
    // «Глубже» на экране: вдоль трека к меньшей координате для стороны +1, иначе к большей.
    const s = this.tracks[axis]!;
    const n = ctl.grid.size[axis];
    let ux = (s.ax - s.bx) * side;
    let uy = (s.ay - s.by) * side;
    let len = Math.hypot(ux, uy);
    let step = Math.max(len / n, MIN_LAYER_PX);
    if (!s.ok) {
      // Ось почти вдоль взгляда — тянем ручку к центру блока.
      const c = this.renderer.project(this.renderer.orbit.target, this.p);
      ux = c.x - this.pos[axis * 2]!;
      uy = c.y - this.pos[axis * 2 + 1]!;
      len = Math.hypot(ux, uy);
      if (len < 1) {
        ux = 0;
        uy = 1;
        len = 1;
      }
      step = MIN_LAYER_PX;
    }
    this.drag = {
      axis,
      side,
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      depth0: active ? sl.depth : 0,
      ux: ux / len,
      uy: uy / len,
      step,
    };
    this.knobs[axis]!.classList.add('dragging');
    this.renderer.invalidate();
  }

  private readonly onMove = (e: PointerEvent): void => {
    const d = this.drag;
    const ctl = this.controller();
    if (!d || e.pointerId !== d.pointer || !ctl) return;
    const t = ((e.clientX - d.x0) * d.ux + (e.clientY - d.y0) * d.uy) / d.step;
    const depth = Math.max(0, d.depth0 + Math.round(t));
    ctl.setSlice({ axis: d.axis, side: d.side, depth });
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    this.knobs[this.drag.axis]!.classList.remove('dragging');
    this.drag = null;
    this.renderer.invalidate();
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
