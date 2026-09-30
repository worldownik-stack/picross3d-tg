import { button, h } from '../dom';
import { ICONS } from '../icons';
import { t } from '../../i18n';

/** Верхняя панель с кнопкой «назад» и заголовком. */
export function topbar(title: string, onBack: () => void): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    button({ variant: 'round', icon: ICONS.back, title: t('common.back'), testId: 'back' }, onBack),
    h('h1', { text: title }),
  );
}

export function starsEl(n: number, max = 3): HTMLElement {
  const el = h('span', { class: 'stars', attrs: { 'aria-label': `${n}/${max}` } });
  for (let i = 0; i < max; i++) {
    const s = h('span', { class: i < n ? 'on' : '' });
    s.innerHTML = `<span class="icon">${ICONS.star}</span>`;
    el.append(s);
  }
  return el;
}
