import type { Insets } from '../../render/OrbitCamera';
import { t } from '../../i18n';
import { button, h } from '../dom';
import { ICONS } from '../icons';

const AXIS_LABEL = ['X', 'Y', 'Z'];
export const LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 560px)';

export interface HudActions {
  pause(): void;
  resetView(): void;
  setTool(tool: 'hammer' | 'brush'): void;
  cycleSliceAxis(): void;
  nudgeSlice(delta: number): void;
}

/** HUD уровня: время, промахи, инструменты, срезы (§3). */
export class GameHud {
  readonly el: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly pips: HTMLElement[] = [];
  private readonly hammerBtn: HTMLButtonElement;
  private readonly brushBtn: HTMLButtonElement;
  private readonly axisBtn: HTMLButtonElement;
  private readonly sliceLabel: HTMLElement;
  private readonly bottom: HTMLElement;

  constructor(actions: HudActions) {
    this.timer = h('span', {
      class: 'hud-timer',
      text: '0:00',
      attrs: { 'data-testid': 'hud-timer' },
    });
    const mistakes = h('div', {
      class: 'hud-mistakes',
      attrs: { 'aria-label': t('game.mistakes'), 'data-testid': 'hud-mistakes' },
    });
    for (let i = 0; i < 5; i++) {
      const pip = h('span', { class: 'pip' });
      pip.innerHTML = ICONS.crack;
      this.pips.push(pip);
      mistakes.append(pip);
    }
    const top = h(
      'header',
      { class: 'hud-top' },
      button(
        { variant: 'round', icon: ICONS.pause, title: t('game.pause'), testId: 'game-pause' },
        () => actions.pause(),
      ),
      h('div', { class: 'hud-status' }, this.timer, mistakes),
      button(
        {
          variant: 'round',
          icon: ICONS.resetView,
          title: t('game.resetView'),
          testId: 'reset-view',
        },
        () => actions.resetView(),
      ),
    );

    this.hammerBtn = button(
      {
        variant: 'ghost',
        icon: ICONS.hammer,
        label: t('game.hammer'),
        testId: 'tool-hammer',
        class: 'tool',
      },
      () => actions.setTool('hammer'),
    );
    this.brushBtn = button(
      {
        variant: 'ghost',
        icon: ICONS.brush,
        label: t('game.brush'),
        testId: 'tool-brush',
        class: 'tool',
      },
      () => actions.setTool('brush'),
    );
    const tools = h(
      'div',
      { class: 'tool-switch', attrs: { role: 'radiogroup' } },
      this.hammerBtn,
      this.brushBtn,
    );

    this.sliceLabel = h('span', { class: 'slice-axis-label', text: 'Y' });
    this.axisBtn = button(
      {
        variant: 'round',
        title: t('game.sliceAxis'),
        testId: 'slice-axis',
        class: 'slice-axis',
      },
      () => actions.cycleSliceAxis(),
    );
    this.axisBtn.append(this.sliceLabel);
    const slicePad = h(
      'div',
      { class: 'slice-pad' },
      this.axisBtn,
      button(
        { variant: 'round', icon: ICONS.minus, title: t('game.sliceLess'), testId: 'slice-less' },
        () => actions.nudgeSlice(-1),
      ),
      button(
        { variant: 'round', icon: ICONS.plus, title: t('game.sliceMore'), testId: 'slice-more' },
        () => actions.nudgeSlice(1),
      ),
    );
    this.bottom = h('div', { class: 'hud-bottom' }, slicePad, tools);
    this.el = h('div', { class: 'hud' }, top, this.bottom);
  }

  setTime(seconds: number): void {
    this.timer.textContent = formatTime(seconds);
  }

  setMistakes(n: number): void {
    this.pips.forEach((p, i) => p.classList.toggle('on', i < n));
  }

  setTool(tool: 'hammer' | 'brush', held: boolean): void {
    const eff = held ? 'brush' : tool;
    this.hammerBtn.classList.toggle('selected', eff === 'hammer');
    this.brushBtn.classList.toggle('selected', eff === 'brush');
    this.hammerBtn.setAttribute('aria-checked', String(eff === 'hammer'));
    this.brushBtn.setAttribute('aria-checked', String(eff === 'brush'));
  }

  setSliceAxis(axis: number, depth: number): void {
    this.sliceLabel.textContent = AXIS_LABEL[axis] + (depth > 0 ? `−${depth}` : '');
    this.axisBtn.dataset.axis = String(axis);
    this.axisBtn.classList.toggle('active', depth > 0);
  }

  setVisible(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }

  /** Области экрана, занятые HUD: камера кадрирует фигуру в оставшейся части. */
  insets(viewW: number, viewH: number): Insets {
    const rect = (sel: string) => this.el.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    const top = rect('.hud-top');
    const ins: Insets = { top: top ? top.bottom + 6 : 0, right: 0, bottom: 0, left: 0 };
    if (matchMedia(LANDSCAPE_PHONE).matches) {
      // Ландшафт телефона: срезы слева, инструменты справа.
      const pad = rect('.slice-pad');
      const tools = rect('.tool-switch');
      // Плашка времени слева сверху попадает в пустой угол силуэта блока,
      // поэтому по высоте блок занимает весь экран.
      const pause = rect('[data-testid=game-pause]');
      ins.top = 6;
      ins.left = Math.max(pad?.right ?? 0, pause?.right ?? 0) + 6;
      ins.right = viewW - (tools?.left ?? viewW) + 6;
      ins.bottom = 6;
    } else {
      let minTop = viewH;
      for (const n of this.el.querySelectorAll<HTMLElement>('.hud-bottom > *')) {
        const r = n.getBoundingClientRect();
        if (r.height > 0) minTop = Math.min(minTop, r.top);
      }
      ins.bottom = viewH - minTop + 6;
    }
    return ins;
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
