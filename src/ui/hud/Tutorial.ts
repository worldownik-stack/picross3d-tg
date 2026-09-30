import { Vector3 } from 'three';
import type { LevelController } from '../../game/LevelController';
import type { Axis } from '../../core/types';
import { isSliced } from '../../core/slice';
import { t, type StringKey } from '../../i18n';
import { h } from '../dom';

/** Событие игрока, по которому обучение переходит к следующему шагу. */
export type TutorialEvent =
  'break' | 'miss' | 'bonk' | 'mark' | 'unmark' | 'brush' | 'hammer' | 'rotate' | 'slice';

interface FaceInfo {
  count: number;
  groups: number;
  len: number;
  /** Куб входит в фигуру. */
  solid: boolean;
}

type Target =
  | { kind: 'face'; want: (f: FaceInfo) => boolean }
  | { kind: 'el'; selector: string }
  | { kind: 'drag' };

interface Step {
  text: StringKey;
  target?: Target;
  /** События, завершающие шаг; пусто — шаг до конца уровня. */
  until: TutorialEvent[];
}

const ACT: TutorialEvent[] = ['break', 'miss', 'mark', 'bonk'];

/** Сценарии обучения (§4): один шаг — одна строка текста и указатель-рука. */
const SCRIPTS: Record<string, Step[]> = {
  tut_01: [
    { text: 'tut.zero', target: { kind: 'face', want: (f) => f.count === 0 }, until: ['break'] },
    {
      text: 'tut.full',
      target: { kind: 'face', want: (f) => f.count === f.len && f.len > 1 },
      until: ACT,
    },
    { text: 'tut.finish', until: [] },
  ],
  tut_02: [
    {
      text: 'tut.numbers',
      target: { kind: 'face', want: (f) => f.count > 0 && f.count < f.len && !f.solid },
      until: ACT,
    },
    { text: 'tut.finish', until: [] },
  ],
  tut_03: [
    {
      text: 'tut.brushTool',
      target: { kind: 'el', selector: '[data-testid=tool-brush]' },
      until: ['brush'],
    },
    {
      text: 'tut.brushMark',
      target: { kind: 'face', want: (f) => f.solid && f.count === f.len },
      until: ['mark'],
    },
    {
      text: 'tut.hammerBack',
      target: { kind: 'el', selector: '[data-testid=tool-hammer]' },
      until: ['hammer'],
    },
    { text: 'tut.finish', until: [] },
  ],
  tut_04: [
    { text: 'tut.rotate', target: { kind: 'drag' }, until: ['rotate'] },
    {
      text: 'tut.slice',
      target: { kind: 'el', selector: '[data-testid=slice-more]' },
      until: ['slice'],
    },
    { text: 'tut.finish', until: [] },
  ],
  tut_05: [
    { text: 'tut.circle', target: { kind: 'face', want: (f) => f.groups === 2 }, until: ACT },
    { text: 'tut.square', target: { kind: 'face', want: (f) => f.groups === 3 }, until: ACT },
    { text: 'tut.finish', until: [] },
  ],
};

/** Кончик пальца в координатах SVG руки (viewBox 48×48). */
const TIP = { x: 20.5, y: 2 };
const HAND_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 5a3.5 3.5 0 0 1 7 0v16.5l1.6-.3a3.4 3.4 0 0 1 3.9 2.6l1.7-.3a3.4 3.4 0 0 1 3.9 2.8l1.1-.2a3.4 3.4 0 0 1 3.8 3.3v7.1C40 43 35.5 47 30 47h-3.6c-3.2 0-6.1-1.5-8-4L9.6 31.6a3.4 3.4 0 0 1 5.2-4.4l2.2 2.3z" fill="#fffaf2" stroke="#4b3323" stroke-width="2.4" stroke-linejoin="round"/></svg>`;

export const hasTutorial = (levelId: string): boolean => levelId in SCRIPTS;

/**
 * Обучение поверх уровня: строка подсказки и рука, указывающая на грань куба с нужной
 * подсказкой, на кнопку или жест вращения. Не перехватывает ввод.
 */
export class Tutorial {
  readonly el: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hand: HTMLElement;
  private readonly steps: Step[];
  private index = 0;
  private face: { cell: number; axis: Axis; sign: 1 | -1 } | null = null;
  /** Цель-грань надо (пере)выбрать: на кадре камера уже в актуальном положении. */
  private faceDirty = true;
  private readonly startAz: number;
  private readonly p = new Vector3();
  private readonly q = new Vector3();
  private readonly cam = new Vector3();
  /** Положение камеры при последнем выборе грани: камера двигается — грань выбираем заново. */
  private readonly faceCam = new Vector3(Infinity, 0, 0);

  constructor(
    levelId: string,
    private readonly ctl: LevelController,
  ) {
    this.steps = SCRIPTS[levelId] ?? [];
    this.banner = h('div', { class: 'tut-banner', attrs: { 'data-testid': 'tutorial-text' } });
    this.hand = h('div', { class: 'tut-hand', attrs: { 'data-testid': 'tutorial-hand' } });
    this.hand.innerHTML = HAND_SVG;
    this.el = h('div', { class: 'tutorial' }, this.banner, this.hand);
    this.startAz = ctl.renderer.orbit.az;
    this.enterStep();
  }

  get stepIndex(): number {
    return this.index;
  }

  /** Событие игрока: при совпадении — следующий шаг, иначе пересчёт цели (куб мог исчезнуть). */
  notify(ev: TutorialEvent): void {
    const step = this.steps[this.index];
    if (!step) return;
    if (step.until.includes(ev) && this.index < this.steps.length - 1) {
      this.index++;
      this.enterStep();
    } else {
      this.faceDirty = true;
    }
  }

  /** Каждый кадр: следить за вращением и держать руку на цели. */
  update(): void {
    const step = this.steps[this.index];
    if (!step) return;
    if (step.until.includes('rotate')) {
      const d = Math.abs(this.ctl.renderer.orbit.az - this.startAz);
      if (d > 0.35) this.notify('rotate');
    }
    if (step.until.includes('slice') && this.ctl.slice.depth > 0) this.notify('slice');
    this.placeHand(this.steps[this.index]!);
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  dispose(): void {
    this.el.remove();
  }

  private enterStep(): void {
    const step = this.steps[this.index];
    if (!step) return this.hide();
    this.banner.textContent = t(step.text);
    this.face = null;
    this.faceDirty = true;
    this.hand.className = `tut-hand ${step.target?.kind === 'drag' ? 'drag' : 'tap'}`;
    this.placeHand(step);
  }

  private placeHand(step: Step): void {
    const tg = step.target;
    let pos: { x: number; y: number } | null = null;
    if (tg?.kind === 'face') {
      const f = this.face;
      const cam = this.ctl.renderer.orbit.camera.position;
      const moved = cam.distanceTo(this.faceCam) > 0.04 * cam.length();
      if (this.faceDirty || moved || (f && this.ctl.session.broken[f.cell])) {
        this.faceCam.copy(cam);
        this.face = this.findFace(tg.want);
        this.faceDirty = false;
      }
      if (this.face) pos = this.faceScreen(this.face);
    } else if (tg?.kind === 'el') {
      const el = document.querySelector<HTMLElement>(tg.selector);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0) pos = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.55 };
    } else if (tg?.kind === 'drag') {
      // Пустое место слева от блока: рука тянет вправо.
      pos = { x: window.innerWidth * 0.14, y: window.innerHeight * 0.62 };
    }
    this.hand.style.display = pos ? '' : 'none';
    if (pos) {
      const size = this.hand.getBoundingClientRect().width || 48;
      const scale = size / 48;
      // У нижнего края рука не помещается — показываем её сверху, пальцем вниз.
      const flip = pos.y + size > window.innerHeight - 8;
      this.hand.classList.toggle('flip', flip);
      const tx = flip ? 48 - TIP.x : TIP.x;
      const ty = flip ? 48 - TIP.y : TIP.y;
      this.hand.style.left = `${pos.x - tx * scale}px`;
      this.hand.style.top = `${pos.y - ty * scale}px`;
    }
  }

  /** Центр грани в CSS px окна. */
  private faceScreen(f: { cell: number; axis: Axis; sign: 1 | -1 }): { x: number; y: number } {
    const r = this.ctl.renderer;
    this.ctl.view.cellCenter(f.cell, this.p);
    this.p.setComponent(f.axis, this.p.getComponent(f.axis) + 0.5 * f.sign);
    r.project(this.p, this.q);
    const rect = r.canvas.getBoundingClientRect();
    return { x: this.q.x + rect.left, y: this.q.y + rect.top };
  }

  /**
   * Видимая грань, чья подсказка (по оси грани) подходит шагу; из подходящих — сильнее всех
   * повёрнутая к камере и ближе к центру блока.
   */
  private findFace(
    want: (f: FaceInfo) => boolean,
  ): { cell: number; axis: Axis; sign: 1 | -1 } | null {
    const { grid, puzzle, broken } = this.ctl.session;
    const r = this.ctl.renderer;
    this.cam.copy(r.orbit.camera.position);
    const solid = (i: number) => !broken[i] && !isSliced(grid, this.ctl.slice, i);
    let best: { cell: number; axis: Axis; sign: 1 | -1 } | null = null;
    let bestScore = -Infinity;
    const c = [0, 0, 0];
    for (let i = 0; i < grid.cellCount; i++) {
      if (!solid(i)) continue;
      const xyz = grid.coords(i);
      for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
        const g = grid.globalLineOf(a, i);
        if (puzzle.hidden[g]) continue;
        const part = puzzle.clues[g]!.parts[0]!;
        const info: FaceInfo = {
          count: part.count,
          groups: part.count === 0 ? 0 : part.groups,
          len: grid.size[a],
          solid: puzzle.classes[i]! > 0,
        };
        if (!want(info)) continue;
        for (const sign of [1, -1] as const) {
          c[0] = xyz[0];
          c[1] = xyz[1];
          c[2] = xyz[2];
          c[a] = c[a]! + sign;
          if (grid.contains(c[0]!, c[1]!, c[2]!) && solid(grid.index(c[0]!, c[1]!, c[2]!)))
            continue;
          this.ctl.view.cellCenter(i, this.p);
          this.p.setComponent(a, this.p.getComponent(a) + 0.5 * sign);
          const toCam = this.q.copy(this.cam).sub(this.p).normalize();
          const facing = toCam.getComponent(a) * sign;
          if (facing < 0.25) continue;
          const score = facing - this.p.length() * 0.05;
          if (score > bestScore) {
            bestScore = score;
            best = { cell: i, axis: a, sign };
          }
        }
      }
    }
    return best;
  }
}
