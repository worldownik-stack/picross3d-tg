/**
 * Глобальный обработчик ошибок (§10, п. 1.14): ни одно исключение не должно
 * «уронить» игру. Ошибки пишутся в консоль и счётчик (для e2e).
 */
export const errorLog: string[] = [];

export function installErrorHandlers(onError?: (msg: string) => void): void {
  window.addEventListener('error', (ev) => {
    const msg =
      ev.error instanceof Error ? (ev.error.stack ?? ev.error.message) : String(ev.message);
    errorLog.push(msg);
    onError?.(msg);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r: unknown = ev.reason;
    const msg = r instanceof Error ? (r.stack ?? r.message) : String(r);
    errorLog.push(msg);
    ev.preventDefault();
    console.error('Unhandled rejection:', r);
    onError?.(msg);
  });
}
