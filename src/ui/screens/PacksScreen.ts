import type { AppContext } from '../../app/context';
import { t, tx } from '../../i18n';
import { clear, h } from '../dom';
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
    const packs = this.app.content.packs.filter((p) => !p.debugOnly || __DEBUG__);
    // В debug-режиме (?debug=1) наборы не блокируются.
    const openAll = __DEBUG__ && new URLSearchParams(location.search).has('debug');
    // Замки считаются по наборам, видимым игроку.
    const visible = packs.filter((p) => !p.debugOnly);
    packs.forEach((pack) => {
      const idx = visible.indexOf(pack);
      const unlocked = openAll || idx < 0 || this.app.progress.isPackUnlocked(visible, idx);
      const card = h(
        'button',
        {
          class: unlocked ? 'card' : 'card locked',
          attrs: { type: 'button', 'data-testid': `pack-${pack.id}`, disabled: !unlocked },
          on: { click: () => void this.app.router.go('levels', { packId: pack.id }) },
        },
        h('span', { class: 'card-title', text: tx(pack.title) }),
        h('span', {
          class: 'card-sub',
          text: unlocked
            ? t('packs.progress', {
                solved: this.app.progress.solvedIn(pack),
                total: pack.levels.length,
              })
            : t('packs.locked', { n: pack.unlockAfter }),
        }),
      );
      this.grid.append(card);
    });
  }

  override back(): boolean {
    void this.app.router.go('menu');
    return true;
  }
}
