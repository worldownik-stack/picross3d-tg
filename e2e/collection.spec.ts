import { expect, test } from '@playwright/test';
import { expectNoScroll, openApp, trackErrors } from './helpers';

type Dbg = {
  go(id: string, p?: object): Promise<void>;
  level(): { status: string } | null;
  solve(): { status: string };
};

test('победа → прогресс, открытие следующего уровня и фигура в коллекции', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);

  // До победы: второй уровень обучения закрыт, «Дом» закрыт, коллекция пуста.
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('pack-home')).toHaveClass(/locked/);
  await page.getByTestId('pack-tut').click();
  await expect(page.getByTestId('level-tut_02')).toHaveClass(/locked/);

  await page.getByTestId('level-tut_01').click();
  await expect(page.getByTestId('screen-game')).toHaveClass(/active/);
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await page.evaluate(() => (window as unknown as { __debug: Dbg }).__debug.solve());
  await expect(page.getByTestId('result-sheet')).toBeVisible();

  // «В коллекцию»: фигура решена, миниатюра появилась, фокус на ней.
  await page.getByTestId('result-collection').click();
  await expect(page.getByTestId('screen-collection')).toHaveClass(/active/);
  const slot = page.getByTestId('slot-tut_01');
  await expect(slot).toHaveClass(/solved/);
  await expect(slot).toHaveClass(/focus/);
  await expect(slot.locator('.slot-figure')).toHaveAttribute('style', /data:image\/png/);
  await expect(page.getByTestId('slot-tut_02')).not.toHaveClass(/solved/);
  await expect(page.getByTestId('collection-count')).toContainText('1');

  // Крупный просмотр: открывается, вращается на своём canvas, закрывается Escape.
  await slot.click();
  await expect(page.getByTestId('collection-viewer')).toBeVisible();
  await expect(page.locator('[data-testid=viewer-stage] canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('collection-viewer')).toHaveCount(0);
  await expect(page.locator('[data-testid=viewer-stage] canvas')).toHaveCount(0);

  // Прогресс переживает перезагрузку: второй уровень открыт, у первого звёзды.
  await page.reload();
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('pack-tut')).toContainText('1');
  await page.getByTestId('pack-tut').click();
  await expect(page.getByTestId('level-tut_02')).not.toHaveClass(/locked/);
  await expect(page.getByTestId('level-tut_01')).toHaveClass(/solved/);
  await expectNoScroll(page);
  expect(errors).toEqual([]);
});

test('сброс прогресса в настройках', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const d = (window as unknown as { __debug: Dbg }).__debug;
    await d.go('game', { packId: 'tut', levelId: 'tut_01' });
  });
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await page.evaluate(() => (window as unknown as { __debug: Dbg }).__debug.solve());
  await expect(page.getByTestId('result-sheet')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('settings-reset').click();
  await page.getByTestId('confirm-yes').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-collection').click();
  await expect(page.getByTestId('slot-tut_01')).not.toHaveClass(/solved/);
});
