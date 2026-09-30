import { expect, type Page } from '@playwright/test';

/** Собирает ошибки консоли и страницы; проверяется в конце теста. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export async function openApp(page: Page, query = 'debug=1&lang=ru'): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.waitForFunction(() => 'debug' in window || '__debug' in window);
}

export async function platformLog(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __debug: { platformLog(): string[] } }).__debug.platformLog(),
  );
}

export async function expectNoScroll(page: Page): Promise<void> {
  const pos = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    top: document.scrollingElement?.scrollTop ?? 0,
    bodyH: document.body.scrollHeight,
    winH: window.innerHeight,
  }));
  expect(pos.x).toBe(0);
  expect(pos.y).toBe(0);
  expect(pos.top).toBe(0);
  expect(pos.bodyH).toBeLessThanOrEqual(pos.winH);
}
