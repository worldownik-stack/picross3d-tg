import { h, type Child } from './dom';

export interface ModalHandle {
  close(): void;
  readonly el: HTMLElement;
}

let layer: HTMLElement | null = null;
const stack: ModalHandle[] = [];

export function setModalLayer(el: HTMLElement): void {
  layer = el;
}

export function openModal(testId: string, ...children: Child[]): ModalHandle {
  if (!layer) throw new Error('modal layer is not set');
  const modal = h(
    'div',
    { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } },
    ...children,
  );
  const backdrop = h('div', { class: 'modal-backdrop', attrs: { 'data-testid': testId } }, modal);
  layer.append(backdrop);
  const handle: ModalHandle = {
    el: modal,
    close() {
      backdrop.remove();
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
    },
  };
  stack.push(handle);
  return handle;
}

export function topModal(): ModalHandle | null {
  return stack[stack.length - 1] ?? null;
}

export function closeAllModals(): void {
  while (stack.length) stack[stack.length - 1]!.close();
}

let toastTimer = 0;
export function toast(text: string, ms = 2200): void {
  if (!layer) return;
  layer.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', text, attrs: { role: 'status' } });
  layer.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), ms);
}
