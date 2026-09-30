export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean>;
  data?: Record<string, string>;
  style?: Partial<Record<string, string>>;
  on?: { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };
}

/** Маленький помощник для DOM без фреймворков. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v === false) continue;
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (props.data) Object.assign(el.dataset, props.data);
    if (props.style) {
      for (const [k, v] of Object.entries(props.style)) {
        if (v !== undefined) el.style.setProperty(k, v);
      }
    }
    if (props.on) {
      for (const [k, fn] of Object.entries(props.on)) {
        el.addEventListener(k, fn as EventListener);
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** SVG-иконка из строки разметки (иконки свои, см. icons.ts). */
export function icon(svg: string, cls = 'icon'): HTMLElement {
  const span = h('span', { class: cls, attrs: { 'aria-hidden': 'true' } });
  span.innerHTML = svg;
  return span;
}

export interface ButtonOpts {
  variant?: 'primary' | 'secondary' | 'ghost' | 'round' | 'danger';
  icon?: string;
  label?: string;
  title?: string;
  testId?: string;
  class?: string;
}

export function button(opts: ButtonOpts, onClick: (ev: MouseEvent) => void): HTMLButtonElement {
  const cls = ['btn', `btn-${opts.variant ?? 'secondary'}`, opts.class ?? ''].join(' ').trim();
  const attrs: Record<string, string> = { type: 'button' };
  if (opts.title) {
    attrs['aria-label'] = opts.title;
    attrs.title = opts.title;
  }
  if (opts.testId) attrs['data-testid'] = opts.testId;
  const b = h(
    'button',
    { class: cls, attrs, on: { click: onClick } },
    opts.icon ? icon(opts.icon) : null,
    opts.label ? h('span', { class: 'btn-label', text: opts.label }) : null,
  );
  return b;
}
