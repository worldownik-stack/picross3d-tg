import { h } from './dom';

export type ScreenId = 'menu' | 'packs' | 'levels' | 'game' | 'collection' | 'settings';

export interface ScreenParams {
  packId?: string;
  levelId?: string;
}

export abstract class Screen {
  readonly el: HTMLElement;

  protected constructor(
    readonly id: ScreenId,
    extraClass = '',
  ) {
    this.el = h('section', {
      class: `screen ${extraClass}`.trim(),
      data: { screen: id },
      attrs: { 'data-testid': `screen-${id}` },
    });
  }

  /** Вызывается при каждом показе экрана. */
  abstract enter(params: ScreenParams): void | Promise<void>;
  /** Вызывается при уходе с экрана. */
  leave(): void {}
  /** Системная кнопка «назад» / Escape. Возвращает true, если обработано. */
  back(): boolean {
    return false;
  }
}

export class Router {
  private current: Screen | null = null;
  private readonly screens = new Map<ScreenId, Screen>();
  private readonly listeners = new Set<(id: ScreenId) => void>();

  constructor(
    private readonly root: HTMLElement,
    private readonly factory: (id: ScreenId) => Screen,
  ) {}

  get currentId(): ScreenId | null {
    return this.current?.id ?? null;
  }

  get currentScreen(): Screen | null {
    return this.current;
  }

  onChange(cb: (id: ScreenId) => void): void {
    this.listeners.add(cb);
  }

  async go(id: ScreenId, params: ScreenParams = {}): Promise<void> {
    const prev = this.current;
    let next = this.screens.get(id);
    if (!next) {
      next = this.factory(id);
      this.screens.set(id, next);
    }
    if (prev && prev !== next) {
      prev.leave();
      prev.el.classList.remove('active');
      const el = prev.el;
      setTimeout(() => {
        if (this.current?.el !== el) el.remove();
      }, 250);
    }
    this.current = next;
    if (!next.el.isConnected) this.root.append(next.el);
    await next.enter(params);
    // Кадр на применение стилей, чтобы сработал переход прозрачности.
    requestAnimationFrame(() => next.el.classList.add('active'));
    for (const cb of this.listeners) cb(id);
  }
}
