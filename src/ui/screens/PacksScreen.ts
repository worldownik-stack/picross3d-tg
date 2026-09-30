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
    for (const pack of packs) {
      const card = h(
        'button',
        {
          class: 'card',
          attrs: { type: 'button', 'data-testid': `pack-${pack.id}` },
          on: { click: () => void this.app.router.go('levels', { packId: pack.id }) },
        },
        h('span', { class: 'card-title', text: tx(pack.title) }),
        h('span', {
          class: 'card-sub',
          text: t('packs.progress', { solved: 0, total: pack.levels.length }),
        }),
      );
      this.grid.append(card);
    }
  }

  override back(): boolean {
    void this.app.router.go('menu');
    return true;
  }
}
