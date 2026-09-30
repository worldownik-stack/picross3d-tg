import type { AppContext } from '../../app/context';
import { t } from '../../i18n';
import { button, h } from '../dom';
import { ICONS } from '../icons';
import { MenuBackdrop } from '../MenuBackdrop';
import { Screen } from '../router';

export class MenuScreen extends Screen {
  private readonly backdrop = new MenuBackdrop();

  constructor(private readonly app: AppContext) {
    super('menu');
    const body = h(
      'div',
      { class: 'screen-body' },
      h(
        'div',
        { class: 'menu-logo' },
        h('div', { class: 'menu-cubes' }, h('i'), h('i'), h('i')),
        h('div', { class: 'title', text: t('app.title') }),
        h('div', { class: 'subtitle', text: t('app.subtitle') }),
      ),
      h(
        'div',
        { class: 'menu-buttons' },
        button(
          { variant: 'primary', icon: ICONS.play, label: t('menu.play'), testId: 'menu-play' },
          () => void this.app.router.go('packs'),
        ),
        button(
          {
            variant: 'secondary',
            icon: ICONS.collection,
            label: t('menu.collection'),
            testId: 'menu-collection',
          },
          () => void this.app.router.go('collection'),
        ),
        button(
          {
            variant: 'secondary',
            icon: ICONS.settings,
            label: t('menu.settings'),
            testId: 'menu-settings',
          },
          () => void this.app.router.go('settings'),
        ),
      ),
    );
    this.el.append(this.backdrop.canvas, body);
  }

  enter(): void {
    this.backdrop.start();
  }

  override leave(): void {
    this.backdrop.stop();
  }
}
