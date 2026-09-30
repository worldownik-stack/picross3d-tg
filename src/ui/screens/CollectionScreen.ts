import type { AppContext } from '../../app/context';
import { t } from '../../i18n';
import { h } from '../dom';
import { Screen } from '../router';
import { topbar } from './common';

export class CollectionScreen extends Screen {
  constructor(private readonly app: AppContext) {
    super('collection');
    this.el.append(
      topbar(t('collection.title'), () => void this.app.router.go('menu')),
      h('div', { class: 'screen-body' }, h('p', { text: t('collection.empty') })),
    );
  }

  enter(): void {}

  override back(): boolean {
    void this.app.router.go('menu');
    return true;
  }
}
