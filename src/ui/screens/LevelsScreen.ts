import type { AppContext } from '../../app/context';
import { t, tx } from '../../i18n';
import { clear, h } from '../dom';
import { Screen, type ScreenParams } from '../router';
import { starsEl, topbar } from './common';

export class LevelsScreen extends Screen {
  private readonly grid: HTMLElement;
  private readonly titleEl: HTMLElement;

  constructor(private readonly app: AppContext) {
    super('levels');
    this.grid = h('div', { class: 'card-grid level-grid' });
    const bar = topbar(t('levels.title'), () => void this.app.router.go('packs'));
    this.titleEl = bar.querySelector('h1')!;
    this.el.append(bar, h('div', { class: 'screen-body scroll-y' }, this.grid));
  }

  enter(params: ScreenParams): void {
    const pack = this.app.content.packs.find((p) => p.id === params.packId);
    clear(this.grid);
    this.titleEl.textContent = pack ? tx(pack.title) : t('levels.title');
    if (!pack) return;
    pack.levels.forEach((lvl, i) => {
      const result = this.app.progress.get(lvl.id);
      this.grid.append(
        h(
          'button',
          {
            class: result ? 'card solved' : 'card',
            attrs: { type: 'button', 'data-testid': `level-${lvl.id}`, title: tx(lvl.title) },
            on: {
              click: () => void this.app.router.go('game', { packId: pack.id, levelId: lvl.id }),
            },
          },
          String(i + 1),
          result ? starsEl(result.stars) : null,
        ),
      );
    });
  }

  override back(): boolean {
    void this.app.router.go('packs');
    return true;
  }
}
