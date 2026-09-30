import { Vector3 } from 'three';
import type { Axis } from '../../core/types';
import type { LevelController } from '../../game/LevelController';
import type { Renderer } from '../../render/Renderer';
import { KNOB_PAD, KNOB_REST_OUT } from '../../render/OrbitCamera';
import { h } from '../dom';

const AXIS_LABEL = ['X', 'Y', 'Z'] as const;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_TRACK_PX = 44;
const KNOB_R = 26;

interface Edge {
  /** Мировые точки трека: координата 0 и size вдоль оси. */
  a: Vector3;
  b: Vector3;
}

/**
 * Ручки срезов у рёбер блока (§2.7): по одной на ось, крупные (≥ 48 px).
 * Ручка оси X/Z идёт по нижнему видимому ребру, оси Y — по левому вертикальному.
 * Перетаскивание ручки задаёт глубину среза; новая ось сбрасывает прежний срез.
 */
export class SliceHandles {
  readonly el: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly tracks: SVGLineElement[] = [];
  private readonly cuts: SVGLineElement[] = [];
  private readonly knobs: HTMLElement[] = [];
  private readonly edges: Edge[] = [0, 1, 2].map(() => ({ a: new Vector3(), b: new Vector3() }));
  private readonly screen = [0, 1, 2].map(() => ({ ax: 0, ay: 0, bx: 0, by: 0, ok: false }));
  private drag: { axis: Axis; side: 1 | -1; pointer: number } | null = null;
  private readonly pos = new Float32Array(6);
  private readonly visible = new Uint8Array(3);
  private readonly p = new Vector3();
  private readonly q = new Vector3();
  private readonly center = new Vector3();

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
      const track = document.createElementNS(SVG_NS, 'line');
      track.setAttribute('class', `slice-track axis-${a}`);
      const cut = document.createElementNS(SVG_NS, 'line');
      cut.setAttribute('class', `slice-cut axis-${a}`);
      this.svg.append(track, cut);
      this.tracks.push(track);
      this.cuts.push(cut);
      const knob = h(
        'button',
        {
          class: `slice-knob axis-${a}`,
          attrs: {
            type: 'button',
            'data-testid': `slice-knob-${AXIS_LABEL[a]}`,
            'aria-label': `Slice ${AXIS_LABEL[a]}`,
          },
        },
        h('span', { class: 'slice-knob-label', text: AXIS_LABEL[a] }),
      );
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
    const grid = ctl.grid;
    const size = grid.size;
    this.center.set(0, size[1] / 2, 0);
    this.visible.fill(0);
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      const s = this.screen[a]!;
      if (size[a] < 2) {
        s.ok = false;
        this.hideAxis(a);
        continue;
      }
      this.pickEdge(a, size);
      const e = this.edges[a]!;
      const pa = this.renderer.project(e.a, this.p);
      s.ax = pa.x;
      s.ay = pa.y;
      const pb = this.renderer.project(e.b, this.p);
      s.bx = pb.x;
      s.by = pb.y;
      s.ok = Math.hypot(s.bx - s.ax, s.by - s.ay) >= MIN_TRACK_PX && pa.z < 1 && pb.z < 1;
      if (!s.ok && this.drag?.axis !== a) {
        this.hideAxis(a);
        continue;
      }
      const sl = ctl.slice;
      const active = sl.axis === a && sl.depth > 0;
      const side = active ? sl.side : this.sideFor(a);
      const depth = active ? sl.depth : 0;
      // Координата ручки вдоль трека (0..size); в покое ручка вынесена за конец
      // ребра, чтобы ручки соседних осей не сходились в ближнем углу.
      const c =
        depth > 0
          ? side > 0
            ? size[a] - depth
            : depth
          : side > 0
            ? size[a] + KNOB_REST_OUT
            : -KNOB_REST_OUT;
      const t = c / size[a];
      // Ручка всегда целиком на экране.
      const { width, height } = this.renderer.viewportSize;
      const kx = clamp(s.ax + (s.bx - s.ax) * t, KNOB_R, width - KNOB_R);
      const ky = clamp(s.ay + (s.by - s.ay) * t, KNOB_R, height - KNOB_R);
      const track = this.tracks[a]!;
      track.setAttribute('x1', String(s.ax));
      track.setAttribute('y1', String(s.ay));
      track.setAttribute('x2', String(s.bx));
      track.setAttribute('y2', String(s.by));
      track.style.display = '';
      const cut = this.cuts[a]!;
      const endX = side > 0 ? s.bx : s.ax;
      const endY = side > 0 ? s.by : s.ay;
      cut.setAttribute('x1', String(kx));
      cut.setAttribute('y1', String(ky));
      cut.setAttribute('x2', String(endX));
      cut.setAttribute('y2', String(endY));
      cut.style.display = active ? '' : 'none';
      const knob = this.knobs[a]!;
      knob.style.display = '';
      knob.classList.toggle('active', active);
      this.pos[a * 2] = kx;
      this.pos[a * 2 + 1] = ky;
      this.visible[a] = 1;
    }
    this.separate();
    for (let a = 0; a < 3; a++) {
      if (!this.visible[a]) continue;
      const x = this.pos[a * 2]!.toFixed(1);
      const y = this.pos[a * 2 + 1]!.toFixed(1);
      this.knobs[a]!.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  /** Раздвинуть ручки, если они наложились (например, в ближнем углу блока). */
  private separate(): void {
    const minD = KNOB_R * 2 + 6;
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          if (!this.visible[i] || !this.visible[j]) continue;
          let dx = this.pos[j * 2]! - this.pos[i * 2]!;
          let dy = this.pos[j * 2 + 1]! - this.pos[i * 2 + 1]!;
          let d = Math.hypot(dx, dy);
          if (d >= minD) continue;
          if (d < 0.01) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = (minD - d) / 2;
          const ux = (dx / d) * push;
          const uy = (dy / d) * push;
          this.pos[i * 2]! -= ux;
          this.pos[i * 2 + 1]! -= uy;
          this.pos[j * 2]! += ux;
          this.pos[j * 2 + 1]! += uy;
        }
      }
    }
  }

  private hideAxis(a: Axis): void {
    this.tracks[a]!.style.display = 'none';
    this.cuts[a]!.style.display = 'none';
    this.knobs[a]!.style.display = 'none';
  }

  /** Сторона, с которой срезаем: к камере (для Y — всегда сверху). */
  private sideFor(a: Axis): 1 | -1 {
    return a === 1 ? 1 : this.renderer.orbit.nearSide(a);
  }

  /** Выбрать ребро, параллельное оси, для трека ручки. */
  private pickEdge(a: Axis, size: readonly [number, number, number]): void {
    const X = size[0];
    const Y = size[1];
    const Z = size[2];
    const b = ((a + 1) % 3) as Axis;
    const c = ((a + 2) % 3) as Axis;
    let best = -Infinity;
    const e = this.edges[a]!;
    const pad = KNOB_PAD;
    for (const vb of [0, 1]) {
      for (const vc of [0, 1]) {
        const coords = [0, 0, 0];
        coords[b] = vb * size[b];
        coords[c] = vc * size[c];
        // Середина ребра в мире.
        coords[a] = size[a] / 2;
        this.q.set(coords[0]! - X / 2, coords[1]!, coords[2]! - Z / 2);
        const m = this.renderer.project(this.q, this.p);
        // X/Z — нижнее на экране ребро; Y — левое.
        const score = a === 1 ? -m.x : m.y;
        if (score <= best) continue;
        best = score;
        // Отступ наружу от центра блока в плоскости, перпендикулярной оси.
        const off = [0, 0, 0];
        off[b] = vb ? 1 : -1;
        off[c] = vc ? 1 : -1;
        if (b === 1 || c === 1) off[1] = coords[1] === 0 ? -1 : 1;
        const ox = off[0]! * pad;
        const oy = off[1]! * pad;
        const oz = off[2]! * pad;
        const start = [...coords];
        start[a] = 0;
        const end = [...coords];
        end[a] = size[a];
        e.a.set(start[0]! - X / 2 + ox, start[1]! + oy, start[2]! - Z / 2 + oz);
        e.b.set(end[0]! - X / 2 + ox, end[1]! + oy, end[2]! - Z / 2 + oz);
      }
    }
    void Y;
  }

  private onDown(e: PointerEvent, axis: Axis): void {
    const ctl = this.controller();
    if (!ctl || ctl.inputLocked || !this.enabled()) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const sl = ctl.slice;
    const side = sl.axis === axis && sl.depth > 0 ? sl.side : this.sideFor(axis);
    this.drag = { axis, side, pointer: e.pointerId };
    this.knobs[axis]!.classList.add('dragging');
  }

  private readonly onMove = (e: PointerEvent): void => {
    const d = this.drag;
    const ctl = this.controller();
    if (!d || e.pointerId !== d.pointer || !ctl) return;
    const s = this.screen[d.axis]!;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const vx = s.bx - s.ax;
    const vy = s.by - s.ay;
    const len2 = vx * vx + vy * vy || 1;
    const n = ctl.grid.size[d.axis];
    const t = ((x - s.ax) * vx + (y - s.ay) * vy) / len2;
    const c = Math.max(0, Math.min(n, Math.round(t * n)));
    const depth = d.side > 0 ? n - c : c;
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
