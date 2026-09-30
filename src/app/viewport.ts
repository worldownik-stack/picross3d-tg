/** Масштаб UI от короткой стороны экрана (§3). */
export function applyUiScale(): void {
  const short = Math.min(window.innerWidth, window.innerHeight);
  const px = Math.max(12, Math.min(20, short / 30));
  document.documentElement.style.fontSize = `${px.toFixed(2)}px`;
}

/** Запрет жестов, прокрутки и контекстного меню (п. 1.6.1.8, 1.10.2). */
export function lockPageGestures(): void {
  const prevent = (e: Event) => e.preventDefault();
  window.addEventListener('contextmenu', prevent);
  // iOS Safari: запрет системного масштабирования жестом.
  document.addEventListener('gesturestart', prevent);
  document.addEventListener('dblclick', prevent);
  // Страница никогда не прокручивается.
  window.addEventListener('scroll', () => window.scrollTo(0, 0));
  document.addEventListener(
    'touchmove',
    (e) => {
      const target = e.target as Element | null;
      if (!target?.closest('.scroll-y')) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('selectstart', prevent);
}
