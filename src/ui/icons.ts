/* Собственные простые иконки (viewBox 0 0 24 24), без сторонних наборов. */
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/>',
  ),
  collection: svg(
    '<path d="M3.5 20.5h17M5 20.5V9.5M19 20.5V9.5M3.5 9.5h17M7.5 9.5V6.5a4.5 4.5 0 019 0v3"/>',
  ),
  hammer: svg(
    '<path d="M13.2 6.8l4 4" /><path d="M10.5 4.2l5.7-.9 4.6 4.6-.9 5.7-2.6-2.6-6.8 6.8a1.9 1.9 0 01-2.7 0l-.3-.3a1.9 1.9 0 010-2.7l6.8-6.8z"/>',
  ),
  brush: svg(
    '<path d="M19.5 4.5l-8 8"/><path d="M11.5 12.5c-2.2-.6-4.6.6-5 3-.3 1.9-1.4 3.2-3 3.5 2.6 1.9 7.4 1.6 8.9-1.4.9-1.8.4-3.9-.9-5.1z" fill="currentColor"/>',
  ),
  resetView: svg(
    '<path d="M20 12a8 8 0 11-2.4-5.7"/><path d="M20 4v5h-5"/><path d="M12 8.5l3 1.7v3.6L12 15.5l-3-1.7v-3.6z"/>',
  ),
  hint: svg(
    '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
  ),
  slice: svg('<path d="M4 20L20 4"/><rect x="3" y="3" width="18" height="18" rx="3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  star: svg(
    '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" fill="currentColor" stroke-width="1.4"/>',
  ),
  lock: svg(
    '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  restart: svg('<path d="M4 12a8 8 0 102.4-5.7"/><path d="M4 4v5h5"/>'),
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>'),
  crack: svg('<path d="M12 2l-2 6 4 3-3 5 2 6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  ad: svg(
    '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
  ),
} as const;
