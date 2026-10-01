import type { AppContext } from '../../app/context';
import type { LevelInfo, PackInfo } from '../../app/content';
import { t, tx } from '../../i18n';
import { FigureStudio } from '../../render/FigureStudio';
import { button, clear, h } from '../dom';
import { ICONS } from '../icons';
import { openModal, toast, type ModalHandle } from '../modal';
import { Screen, type ScreenParams } from '../router';
import { formatTime } from '../hud/GameHud';
import { starsEl, topbar } from './common';

/** Миниатюры решённых фигур на сессию (data URL по id уровня). */
const thumbs = new Map<string, string>();

/**
 * Коллекция (§4): решённые фигуры на полках по наборам, нерешённые — «?».
 * По тапу фигура крупно вращается на поворотном столе.
 */
export class CollectionScreen extends Screen {
  private readonly body: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly slots = new Map<
    string,
    { pack: PackInfo; level: LevelInfo; img: HTMLElement }
  >();
  private studio: FigureStudio | null = null;
  private studioHost: HTMLElement | null = null;
  private viewer: { modal: ModalHandle; studio: FigureStudio } | null = null;
  private token = 0;

  constructor(private readonly app: AppContext) {
    super('collection');
    const bar = topbar(t('collection.title'), () => void this.app.router.go('menu'));
    this.countEl = h('span', {
      class: 'topbar-count',
      attrs: { 'data-testid': 'collection-count' },
    });
    bar.append(this.countEl);
    this.body = h('div', { class: 'collection' });
    this.el.append(bar, h('div', { class: 'screen-body scroll-y' }, this.body));
  }

  enter(params: ScreenParams): void {
    const token = ++this.token;
    const { progress, content } = this.app;
    const packs = content.packs.filter((p) => !p.debugOnly);
    const total = packs.reduce((n, p) => n + p.levels.length, 0);
    this.countEl.textContent = t('packs.progress', { solved: progress.solvedCount, total });
    clear(this.body);
    this.slots.clear();
    if (progress.solvedCount === 0) {
      this.body.append(h('p', { class: 'collection-hint', text: t('collection.empty') }));
    }
    for (const pack of packs) {
      const shelf = h('div', { class: 'shelf' });
      this.body.append(
        h(
          'section',
          { class: 'shelf-section', attrs: { 'data-testid': `shelf-${pack.id}` } },
          h(
            'header',
            { class: 'shelf-head' },
            h('h2', { text: tx(pack.title) }),
            h('span', {
              text: t('packs.progress', {
                solved: progress.solvedIn(pack),
                total: pack.levels.length,
              }),
            }),
          ),
          shelf,
        ),
      );
      for (const level of pack.levels) {
        const solved = progress.isSolved(level.id);
        const img = h('span', { class: 'slot-figure' });
        const slot = h(
          'button',
          {
            class: `slot${solved ? ' solved' : ''}`,
            attrs: {
              type: 'button',
              'data-testid': `slot-${level.id}`,
              'aria-label': solved ? tx(level.title) : '?',
            },
            on: {
              click: () => {
                if (solved) void this.openViewer(pack, level);
                else toast(t('collection.unsolved'));
              },
            },
          },
          img,
        );
        if (solved) {
          const url = thumbs.get(level.id);
          if (url) img.style.backgroundImage = `url(${url})`;
          else img.classList.add('loading');
          this.slots.set(level.id, { pack, level, img });
        } else {
          img.textContent = '?';
        }
        shelf.append(slot);
      }
    }
    if (params.levelId) {
      const el = this.body.querySelector<HTMLElement>(`[data-testid="slot-${params.levelId}"]`);
      if (el) {
        el.classList.add('focus');
        requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
      }
    }
    void this.renderThumbs(token, params.levelId);
  }

  override leave(): void {
    this.token++;
    this.closeViewer();
    this.studio?.dispose();
    this.studio = null;
    this.studioHost?.remove();
    this.studioHost = null;
  }

  override back(): boolean {
    if (this.viewer) {
      this.closeViewer();
      return true;
    }
    void this.app.router.go('menu');
    return true;
  }

  /** Снимки решённых фигур по очереди, не блокируя интерфейс; сначала — фигура в фокусе. */
  private async renderThumbs(token: number, first?: string): Promise<void> {
    const todo = [...this.slots.entries()].filter(([id]) => !thumbs.has(id));
    todo.sort(([a], [b]) => Number(b === first) - Number(a === first));
    for (const [id, { pack, img }] of todo) {
      if (token !== this.token) return;
      try {
        const level = await this.app.levels.getLevel(pack.id, id);
        if (token !== this.token) return;
        const studio = this.ensureStudio();
        studio.show(level, { stage: false, zoom: 0.74 });
        const url = studio.snapshot();
        thumbs.set(id, url);
        img.style.backgroundImage = `url(${url})`;
        img.classList.remove('loading');
      } catch (e) {
        console.error(e);
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    // Снимки готовы — второй WebGL-контекст больше не нужен.
    if (token === this.token && !this.viewer) {
      this.studio?.dispose();
      this.studio = null;
    }
  }

  private ensureStudio(): FigureStudio {
    if (!this.studio) {
      this.studioHost ??= h('div', { class: 'thumb-studio', attrs: { 'aria-hidden': 'true' } });
      document.body.append(this.studioHost);
      this.studio = new FigureStudio(this.studioHost);
    }
    return this.studio;
  }

  private async openViewer(pack: PackInfo, info: LevelInfo): Promise<void> {
    if (this.viewer) return;
    const rec = this.app.progress.get(info.id);
    const host = h('div', { class: 'viewer-stage', attrs: { 'data-testid': 'viewer-stage' } });
    const modal = openModal(
      'collection-viewer',
      h('h2', { class: 'viewer-title', text: tx(info.title) }),
      h('p', { class: 'viewer-pack', text: tx(pack.title) }),
      host,
      rec ? starsEl(rec.stars) : null,
      rec
        ? h(
            'div',
            { class: 'result-stats' },
            h(
              'div',
              null,
              h('span', { text: t('collection.bestTime') }),
              h('b', { text: formatTime(rec.time) }),
            ),
            h(
              'div',
              null,
              h('span', { text: t('result.mistakes') }),
              h('b', { text: String(rec.mistakes) }),
            ),
          )
        : null,
      h(
        'div',
        { class: 'modal-buttons' },
        button(
          {
            variant: 'primary',
            icon: ICONS.restart,
            label: t('result.replay'),
            testId: 'viewer-replay',
          },
          () => {
            this.closeViewer();
            void this.app.router.go('game', { packId: pack.id, levelId: info.id });
          },
        ),
        button(
          {
            variant: 'secondary',
            icon: ICONS.close,
            label: t('common.close'),
            testId: 'viewer-close',
          },
          () => this.closeViewer(),
        ),
      ),
    );
    modal.el.classList.add('viewer');
    const studio = new FigureStudio(host);
    // Закрытие любым путём (кнопка, Escape) освобождает WebGL-контекст просмотра.
    const closeModal = modal.close;
    modal.close = () => {
      studio.dispose();
      closeModal();
      if (this.viewer?.studio === studio) this.viewer = null;
    };
    this.viewer = { modal, studio };
    try {
      const level = await this.app.levels.getLevel(pack.id, info.id);
      if (this.viewer?.studio !== studio) return;
      studio.show(level, { stage: true });
      studio.spin();
    } catch (e) {
      console.error(e);
      this.closeViewer();
    }
  }

  private closeViewer(): void {
    this.viewer?.modal.close();
  }
}
