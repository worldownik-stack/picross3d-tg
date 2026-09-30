import { expect, test } from '@playwright/test';
import { expectNoScroll, openApp, platformLog, trackErrors } from './helpers';

test('загрузка: меню интерактивно, ready вызван один раз, ошибок нет', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await expect(page.getByTestId('menu-play')).toBeVisible();
  const log = await platformLog(page);
  expect(log.filter((x) => x === 'ready')).toHaveLength(1);
  await expectNoScroll(page);
  expect(errors).toEqual([]);
});

test('навигация по пустым экранам и назад', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('screen-packs')).toHaveClass(/active/);
  await expect(page.getByTestId('pack-food')).toBeVisible();
  await page.getByTestId('pack-tut').click();
  await expect(page.getByTestId('screen-levels')).toHaveClass(/active/);
  await page.locator('[data-testid=screen-levels] [data-testid=back]').click();
  await expect(page.getByTestId('screen-packs')).toHaveClass(/active/);
  await page.locator('[data-testid=screen-packs] [data-testid=back]').click();
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);

  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('screen-settings')).toHaveClass(/active/);
  const row = page.getByTestId('setting-vibration');
  await expect(row).toHaveAttribute('aria-checked', 'true');
  await row.click();
  await expect(row).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);

  await page.getByTestId('menu-collection').click();
  await expect(page.getByTestId('screen-collection')).toHaveClass(/active/);
  await expectNoScroll(page);
  expect(errors).toEqual([]);
});

test('страница не прокручивается жестами', async ({ page }, info) => {
  await openApp(page);
  if (info.project.use.hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    for (const [y0, y1] of [
      [200, 700],
      [700, 100],
    ]) {
      await cdp.send('Input.synthesizeScrollGesture', {
        x: 150,
        y: Math.min(y0, 380),
        yDistance: Math.min(y1, 380) - Math.min(y0, 380),
        speed: 2000,
        gestureSourceType: 'touch',
      });
    }
  } else {
    await page.mouse.wheel(0, 800);
  }
  await expectNoScroll(page);
});
