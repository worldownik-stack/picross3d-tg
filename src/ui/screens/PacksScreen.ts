import type { AppContext } from '../../app/context';
import { t, tx } from '../../i18n';
import { clear, h } from '../dom';
import { ICONS } from '../icons';
import { toast } from '../modal';
import { Screen } from '../router';
import { topbar } from './common';

export class PacksScreen extends Screen {
  private readonly grid: HTMLElement;

  constructor(private readonly app: AppContext) {
    super('packs');
    this.grid = h('div', { class: 'card-grid' });
    this.el.append(
      topbar(t('packs.title'), () => void this.app.router.go('menu')),
      h('div', { class: 'screen-body scroll-y' }, this.grid),
    );
  }

  enter(): void {
    clear(this.grid);
    const { progress, content } = this.app;
    const packs = content.packs.filter((p) => !p.debugOnly || __DEBUG__);
    for (const pack of packs) {
      const open = progress.isPackUnlocked(content.packs, pack.id);
      const solved = progress.solvedIn(pack);
      const total = pack.levels.length;
      const card = h(
        'button',
        {
          class: `card pack-card${open ? '' : ' locked'}${solved === total && total ? ' done' : ''}`,
          attrs: {
            type: 'button',
            'data-testid': `pack-${pack.id}`,
            'aria-disabled': String(!open),
          },
          on: {
            click: () => {
              if (open) void this.app.router.go('levels', { packId: pack.id });
              else toast(t('packs.locked', { n: pack.unlockAfter }));
            },
          },
        },
        h('span', { class: 'card-title', text: tx(pack.title) }),
      );
      if (open) {
        card.append(
          h('span', { class: 'card-sub', text: t('packs.progress', { solved, total }) }),
          h(
            'span',
            { class: 'pack-bar' },
            h('span', { attrs: { style: `width:${total ? (solved / total) * 100 : 0}%` } }),
          ),
        );
      } else {
        const lock = h('span', { class: 'card-lock' });
        lock.innerHTML = ICONS.lock;
        card.append(
          lock,
          h('span', { class: 'card-sub', text: t('packs.locked', { n: pack.unlockAfter }) }),
        );
      }
      this.grid.append(card);
    }
  }

  override back(): boolean {
    void this.app.router.go('menu');
    return true;
  }
}
