import type { AppContext } from '../../app/context';
import { t, tx } from '../../i18n';
import { clear, h } from '../dom';
import { ICONS } from '../icons';
import { toast } from '../modal';
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
    const { progress, content } = this.app;
    const pack = content.packs.find((p) => p.id === params.packId);
    clear(this.grid);
    this.titleEl.textContent = pack ? tx(pack.title) : t('levels.title');
    if (!pack) return;
    pack.levels.forEach((lvl, i) => {
      const open = progress.isLevelUnlocked(content.packs, pack, i);
      const rec = progress.get(lvl.id);
      const card = h(
        'button',
        {
          class: `card${open ? '' : ' locked'}${rec ? ' solved' : ''}`,
          attrs: {
            type: 'button',
            'data-testid': `level-${lvl.id}`,
            title: rec ? tx(lvl.title) : String(i + 1),
            'aria-disabled': String(!open),
          },
          on: {
            click: () => {
              if (open) void this.app.router.go('game', { packId: pack.id, levelId: lvl.id });
              else toast(t('levels.locked'));
            },
          },
        },
        h('span', { class: 'level-num', text: String(i + 1) }),
      );
      if (rec) card.append(starsEl(rec.stars));
      else if (!open) {
        const lock = h('span', { class: 'card-lock' });
        lock.innerHTML = ICONS.lock;
        card.append(lock);
      }
      this.grid.append(card);
    });
  }

  override back(): boolean {
    void this.app.router.go('packs');
    return true;
  }
}
