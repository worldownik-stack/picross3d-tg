import type { AppContext } from '../../app/context';
import { t, tx } from '../../i18n';
import { clear, h } from '../dom';
import { Screen } from '../router';
import { starsEl, topbar } from './common';

/** Коллекция: решённые фигуры со звёздами; нажатие — сыграть ещё раз. */
export class CollectionScreen extends Screen {
  private readonly body: HTMLElement;

  constructor(private readonly app: AppContext) {
    super('collection');
    this.body = h('div', { class: 'screen-body scroll-y' });
    this.el.append(
      topbar(t('collection.title'), () => void this.app.router.go('menu')),
      this.body,
    );
  }

  enter(): void {
    clear(this.body);
    const grid = h('div', { class: 'card-grid' });
    for (const pack of this.app.content.packs) {
      for (const lvl of pack.levels) {
        const result = this.app.progress.get(lvl.id);
        if (!result) continue;
        grid.append(
          h(
            'button',
            {
              class: 'card solved',
              attrs: { type: 'button', 'data-testid': `collection-${lvl.id}` },
              on: {
                click: () => void this.app.router.go('game', { packId: pack.id, levelId: lvl.id }),
              },
            },
            h('span', { class: 'card-title', text: tx(lvl.title) }),
            h('span', { class: 'card-sub', text: tx(pack.title) }),
            starsEl(result.stars),
          ),
        );
      }
    }
    this.body.append(grid.childElementCount ? grid : h('p', { text: t('collection.empty') }));
  }

  override back(): boolean {
    void this.app.router.go('menu');
    return true;
  }
}
