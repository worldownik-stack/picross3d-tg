import type { AppContext } from '../../app/context';
import type { Level } from '../../core/level';
import type { Axis } from '../../core/types';
import { LevelController } from '../../game/LevelController';
import { LevelInput } from '../../game/LevelInput';
import { t, tx } from '../../i18n';
import { GlyphAtlas } from '../../render/glyphAtlas';
import { DEFAULT_AZ, DEFAULT_PITCH } from '../../render/OrbitCamera';
import { Renderer } from '../../render/Renderer';
import { button, clear, h } from '../dom';
import { ICONS } from '../icons';
import { closeAllModals, openModal, toast, type ModalHandle } from '../modal';
import { Screen, type ScreenParams } from '../router';
import { formatTime, GameHud } from '../hud/GameHud';
import { SliceHandles } from '../hud/SliceHandles';
import { starsEl } from './common';

/** Экран уровня (§2–3): 3D-блок, HUD, срезы, пауза, итог. */
export class GameScreen extends Screen {
  renderer: Renderer | null = null;
  private atlas: GlyphAtlas | null = null;
  private controller: LevelController | null = null;
  private level: Level | null = null;
  private input: LevelInput | null = null;
  private handles: SliceHandles | null = null;
  private readonly hud: GameHud;
  private readonly titleEl: HTMLElement;
  private readonly sheet: HTMLElement;
  private pauseModal: ModalHandle | null = null;
  private failModal: ModalHandle | null = null;
  private params: ScreenParams = {};
  private userPaused = false;
  private platformPaused = false;
  private timerId = 0;
  private lastTick = 0;
  private sliceAxis: Axis = 1;
  private loadToken = 0;
  private active = false;

  constructor(private readonly app: AppContext) {
    super('game', 'passthrough');
    this.hud = new GameHud({
      pause: () => this.openPause(),
      resetView: () => {
        this.renderer?.orbit.reset();
        this.renderer?.invalidate();
      },
      setTool: (tool) => this.setTool(tool),
      cycleSliceAxis: () => this.cycleSliceAxis(),
      nudgeSlice: (d) => this.nudgeSlice(d),
    });
    this.titleEl = h('div', { class: 'win-title', attrs: { 'data-testid': 'win-title' } });
    this.sheet = h('div', {
      class: 'result-sheet hidden',
      attrs: { 'data-testid': 'result-sheet' },
    });
    this.el.append(this.hud.el, this.titleEl, this.sheet);

    app.platform.onPause(() => {
      this.platformPaused = true;
      this.input?.releaseAll();
      this.syncGameplay();
    });
    app.platform.onResume(() => {
      this.platformPaused = false;
      this.lastTick = performance.now();
      this.syncGameplay();
    });
    app.settings.subscribe((_s, key) => {
      if (key === 'dimCompleted') this.controller?.refreshDims(null);
      if (key === 'lineHighlight') this.controller?.setHover(-1);
    });
  }

  get currentController(): LevelController | null {
    return this.controller;
  }

  get currentLevel(): Level | null {
    return this.level;
  }

  private ensureRenderer(): Renderer {
    if (this.renderer) return this.renderer;
    const r = new Renderer(this.app.stage);
    this.renderer = r;
    this.atlas = new GlyphAtlas(Math.min(8, r.gl.capabilities.getMaxAnisotropy()));
    this.handles = new SliceHandles(
      r,
      () => this.controller,
      () => this.inputEnabled(),
    );
    this.el.insertBefore(this.handles.el, this.hud.el);
    r.onAfterRender(() => this.handles?.update());
    this.input = new LevelInput({
      renderer: r,
      controller: () => this.controller,
      enabled: () => this.inputEnabled(),
      setTool: (tool) => this.setTool(tool),
      setBrushHeld: (on) => this.setBrushHeld(on),
      cycleSliceAxis: () => this.cycleSliceAxis(),
      nudgeSlice: (d) => this.nudgeSlice(d),
    });
    new ResizeObserver(() => this.updateInsets()).observe(this.el);
    window.addEventListener('resize', () => this.updateInsets());
    return r;
  }

  private inputEnabled(): boolean {
    return this.active && !this.userPaused && !this.platformPaused && !this.failModal;
  }

  async enter(params: ScreenParams): Promise<void> {
    this.params = params;
    this.active = true;
    const token = ++this.loadToken;
    const r = this.ensureRenderer();
    this.app.stage.classList.remove('hidden');
    // Повторный вход (следующий уровень, «заново») — сбросить модалки и паузу.
    this.pauseModal?.close();
    this.pauseModal = null;
    this.failModal?.close();
    this.failModal = null;
    this.userPaused = false;
    this.input?.releaseAll();
    this.disposeLevel();
    this.hideResult();
    this.hud.setVisible(true);
    let level: Level;
    try {
      level = await this.app.levels.getLevel(params.packId ?? '', params.levelId ?? '');
    } catch (e) {
      console.error(e);
      toast(t('error.generic'));
      void this.app.router.go('levels', { packId: params.packId ?? '' });
      return;
    }
    if (token !== this.loadToken || !this.active) return;
    this.level = level;
    this.controller = new LevelController(r, level, this.atlas!, () => this.app.settings.get(), {
      onChange: () => this.syncHud(),
      onMiss: () => {
        if (this.app.settings.get().vibration) this.app.platform.haptic?.('miss');
        this.syncHud();
      },
      onWin: () => {
        if (this.app.settings.get().vibration) this.app.platform.haptic?.('win');
        this.showWin();
      },
      onLose: () => {
        if (this.app.settings.get().vibration) this.app.platform.haptic?.('fail');
        this.showFail();
      },
    });
    r.orbit.az = DEFAULT_AZ;
    r.orbit.pitch = DEFAULT_PITCH;
    r.orbit.zoom = 1;
    this.userPaused = false;
    this.sliceAxis = 1;
    this.syncHud();
    this.updateInsets();
    this.input!.attach();
    this.startTimer();
    this.syncGameplay();
    r.invalidate();
  }

  override leave(): void {
    this.active = false;
    this.loadToken++;
    this.stopTimer();
    this.input?.detach();
    this.pauseModal?.close();
    this.pauseModal = null;
    this.failModal?.close();
    this.failModal = null;
    this.disposeLevel();
    this.app.stage.classList.add('hidden');
    this.app.platform.gameplayStop();
  }

  private disposeLevel(): void {
    this.controller?.dispose();
    this.controller = null;
    this.level = null;
    this.renderer?.invalidate();
  }

  // ---------- Геймплей и таймер ----------

  /** start/stop платформы по состоянию уровня (§8). */
  private syncGameplay(): void {
    const ctl = this.controller;
    const playing =
      this.active &&
      !!ctl &&
      ctl.session.status === 'playing' &&
      !this.userPaused &&
      !this.platformPaused;
    if (playing) this.app.platform.gameplayStart();
    else this.app.platform.gameplayStop();
  }

  private startTimer(): void {
    this.stopTimer();
    this.lastTick = performance.now();
    this.timerId = window.setInterval(() => this.tick(), 250);
  }

  private stopTimer(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = 0;
  }

  private tick(): void {
    const now = performance.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    const ctl = this.controller;
    if (!ctl || this.userPaused || this.platformPaused || document.hidden || ctl.inputLocked)
      return;
    ctl.tick(Math.min(dt, 1));
    this.hud.setTime(ctl.session.elapsed);
  }

  private syncHud(): void {
    const ctl = this.controller;
    if (!ctl) return;
    this.hud.setMistakes(ctl.session.mistakes);
    this.hud.setTime(ctl.session.elapsed);
    this.hud.setTool(ctl.tool, ctl.brushHeld);
    const sl = ctl.slice;
    if (sl.axis !== null && sl.depth > 0) this.sliceAxis = sl.axis;
    this.hud.setSliceAxis(this.sliceAxis, sl.axis === this.sliceAxis ? sl.depth : 0);
  }

  private updateInsets(): void {
    if (!this.renderer || !this.active) return;
    const { width, height } = this.renderer.viewportSize;
    const sheetOpen = !this.sheet.classList.contains('hidden');
    const ins = sheetOpen ? this.sheetInsets(width, height) : this.hud.insets(width, height);
    this.renderer.setInsets(ins);
  }

  private sheetInsets(w: number, h: number) {
    const r = this.sheet.getBoundingClientRect();
    const title = this.titleEl.getBoundingClientRect();
    const top = title.height ? title.bottom + 8 : 16;
    if (r.width < w * 0.6 && r.left > w * 0.4)
      return { top, right: w - r.left + 8, bottom: 16, left: 16 };
    return { top, right: 16, bottom: h - r.top + 8, left: 16 };
  }

  // ---------- Инструменты и срезы ----------

  private setTool(tool: 'hammer' | 'brush'): void {
    const ctl = this.controller;
    if (!ctl) return;
    ctl.tool = tool;
    this.syncHud();
  }

  private setBrushHeld(on: boolean): void {
    const ctl = this.controller;
    if (!ctl) return;
    ctl.brushHeld = on;
    this.syncHud();
  }

  private cycleSliceAxis(): void {
    const ctl = this.controller;
    if (!ctl || !this.inputEnabled()) return;
    const sizes = ctl.grid.size;
    let a = this.sliceAxis;
    for (let k = 0; k < 3; k++) {
      a = ((a + 1) % 3) as Axis;
      if (sizes[a] > 1) break;
    }
    this.sliceAxis = a;
    // Новая ось сбрасывает прежний срез.
    if (ctl.slice.axis !== null && ctl.slice.axis !== a)
      ctl.setSlice({ axis: null, side: 1, depth: 0 });
    this.syncHud();
  }

  private nudgeSlice(delta: number): void {
    const ctl = this.controller;
    if (!ctl || !this.inputEnabled()) return;
    if (ctl.grid.size[this.sliceAxis] < 2) this.cycleSliceAxis();
    ctl.nudgeSlice(this.sliceAxis, delta);
    this.syncHud();
  }

  // ---------- Пауза ----------

  openPause(): void {
    if (this.pauseModal || !this.controller || this.controller.inputLocked) return;
    this.userPaused = true;
    this.input?.releaseAll();
    this.syncGameplay();
    this.renderer?.invalidate();
    this.pauseModal = openModal(
      'pause-modal',
      h('h2', { text: t('pause.title') }),
      h(
        'div',
        { class: 'modal-buttons' },
        button(
          {
            variant: 'primary',
            icon: ICONS.play,
            label: t('pause.resume'),
            testId: 'pause-resume',
          },
          () => this.closePause(),
        ),
        button(
          {
            variant: 'secondary',
            icon: ICONS.restart,
            label: t('pause.restart'),
            testId: 'pause-restart',
          },
          () => {
            this.closePause();
            void this.restart();
          },
        ),
        button(
          { variant: 'secondary', icon: ICONS.home, label: t('pause.menu'), testId: 'pause-menu' },
          () => void this.goMenu(),
        ),
      ),
    );
  }

  private closePause(): void {
    this.pauseModal?.close();
    this.pauseModal = null;
    this.userPaused = false;
    this.lastTick = performance.now();
    this.syncGameplay();
    this.renderer?.invalidate();
  }

  private async goMenu(): Promise<void> {
    closeAllModals();
    this.pauseModal = null;
    this.failModal = null;
    await this.app.router.go('menu');
    // Полноэкранная реклама — только в логических паузах (§8).
    void this.app.platform.showFullscreenAd();
  }

  private restart(): Promise<void> {
    return this.enter(this.params);
  }

  override back(): boolean {
    if (this.failModal) return true;
    if (!this.sheet.classList.contains('hidden')) return true;
    if (this.pauseModal) this.closePause();
    else this.openPause();
    return true;
  }

  // ---------- Итог ----------

  private showWin(): void {
    const ctl = this.controller;
    const level = this.level;
    if (!ctl || !level) return;
    this.syncGameplay();
    this.hud.setVisible(false);
    this.titleEl.textContent = tx(level.title);
    this.titleEl.classList.add('shown');
    const s = ctl.session;
    clear(this.sheet);
    this.sheet.append(
      starsEl(s.stars()),
      h(
        'div',
        { class: 'result-stats' },
        h(
          'div',
          null,
          h('span', { text: t('result.time') }),
          h('b', { text: formatTime(s.elapsed) }),
        ),
        h(
          'div',
          null,
          h('span', { text: t('result.mistakes') }),
          h('b', { text: String(s.totalMistakes) }),
        ),
      ),
      h(
        'div',
        { class: 'result-buttons' },
        button(
          { variant: 'primary', icon: ICONS.play, label: t('result.next'), testId: 'result-next' },
          () => void this.next(),
        ),
        button(
          {
            variant: 'secondary',
            icon: ICONS.restart,
            label: t('result.replay'),
            testId: 'result-replay',
          },
          () => void this.restart(),
        ),
        button(
          {
            variant: 'secondary',
            icon: ICONS.collection,
            label: t('result.collection'),
            testId: 'result-collection',
          },
          () => void this.app.router.go('collection'),
        ),
      ),
    );
    this.sheet.classList.remove('hidden');
    requestAnimationFrame(() => this.updateInsets());
  }

  private hideResult(): void {
    this.sheet.classList.add('hidden');
    this.titleEl.classList.remove('shown');
    this.titleEl.textContent = '';
  }

  private async next(): Promise<void> {
    const cur = this.params;
    const nxt = this.app.levels.next(cur.packId ?? '', cur.levelId ?? '');
    await this.app.platform.showFullscreenAd();
    if (!this.active) return;
    if (nxt) void this.app.router.go('game', nxt);
    else void this.app.router.go('packs');
  }

  private showFail(): void {
    const ctl = this.controller;
    if (!ctl) return;
    this.syncGameplay();
    this.input?.releaseAll();
    const buttons = h('div', { class: 'modal-buttons' });
    if (ctl.session.canContinue()) {
      buttons.append(
        button(
          {
            variant: 'primary',
            icon: ICONS.ad,
            label: t(this.app.platform.hasAds ? 'fail.continueAd' : 'fail.continueFree'),
            testId: 'fail-continue',
          },
          () => void this.continueForAd(),
        ),
      );
    }
    buttons.append(
      button(
        {
          variant: ctl.session.canContinue() ? 'secondary' : 'primary',
          icon: ICONS.restart,
          label: t('fail.restart'),
          testId: 'fail-restart',
        },
        () => {
          this.failModal?.close();
          this.failModal = null;
          void this.restart();
        },
      ),
    );
    this.failModal = openModal(
      'fail-modal',
      h('h2', { text: t('fail.title') }),
      h('p', { text: t('fail.text') }),
      ctl.session.canContinue() ? h('p', { class: 'note', text: t('fail.continueNote') }) : null,
      buttons,
    );
  }

  private async continueForAd(): Promise<void> {
    const rewarded = await this.app.platform.showRewardedAd();
    const ctl = this.controller;
    if (!ctl || !this.active) return;
    if (!rewarded) {
      toast(t('ad.unavailable'));
      return;
    }
    this.failModal?.close();
    this.failModal = null;
    ctl.continueAfterLoss();
    this.lastTick = performance.now();
    this.syncGameplay();
    this.syncHud();
  }
}
