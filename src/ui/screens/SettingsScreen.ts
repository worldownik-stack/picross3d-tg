import type { AppContext } from '../../app/context';
import type { Settings } from '../../app/settings';
import { t, type StringKey } from '../../i18n';
import { button, h } from '../dom';
import { openModal } from '../modal';
import { Screen } from '../router';
import { topbar } from './common';

const ROWS: Array<[keyof Settings, StringKey]> = [
  ['music', 'settings.music'],
  ['sound', 'settings.sound'],
  ['vibration', 'settings.vibration'],
  ['lineHighlight', 'settings.lineHighlight'],
  ['dimCompleted', 'settings.dimCompleted'],
];

export class SettingsScreen extends Screen {
  private readonly rows = new Map<keyof Settings, HTMLElement>();

  constructor(private readonly app: AppContext) {
    super('settings');
    const list = h('div', { class: 'settings-list' });
    for (const [key, label] of ROWS) {
      const row = h(
        'div',
        {
          class: 'toggle-row',
          attrs: { role: 'switch', tabindex: 0, 'data-testid': `setting-${key}` },
          on: { click: () => this.app.settings.set(key, !this.app.settings.get()[key]) },
        },
        h('span', { text: t(label) }),
        h('span', { class: 'switch' }),
      );
      this.rows.set(key, row);
      list.append(row);
    }
    list.append(
      button({ variant: 'danger', label: t('settings.reset'), testId: 'settings-reset' }, () =>
        this.confirmReset(),
      ),
    );
    this.el.append(
      topbar(t('settings.title'), () => void this.app.router.go('menu')),
      h('div', { class: 'screen-body' }, list),
    );
    this.app.settings.subscribe(() => this.sync());
  }

  enter(): void {
    this.sync();
  }

  private sync(): void {
    const s = this.app.settings.get();
    for (const [key, row] of this.rows) row.setAttribute('aria-checked', String(s[key]));
  }

  private confirmReset(): void {
    const m = openModal(
      'confirm-reset',
      h('p', { text: t('settings.resetConfirm') }),
      h(
        'div',
        { class: 'modal-buttons' },
        button({ variant: 'danger', label: t('common.yes'), testId: 'confirm-yes' }, () => {
          m.close();
          this.app.progress.reset();
          void this.app.save.flush();
        }),
        button({ variant: 'secondary', label: t('common.no'), testId: 'confirm-no' }, () =>
          m.close(),
        ),
      ),
    );
  }

  override back(): boolean {
    void this.app.router.go('menu');
    return true;
  }
}
