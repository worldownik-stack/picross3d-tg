import { expect, test, type Page } from '@playwright/test';
import { openApp, trackErrors } from './helpers';

const SAVE_KEY = 'cube-sculptor/mock-cloud';

type Dbg = {
  go(id: string, p?: object): Promise<void>;
  level(): { status: string } | null;
  solve(): { status: string };
};

const goMenu = async (page: Page, query: string) => {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
};

test('прогресс: победа сохраняется и виден в уровнях и коллекции после перезагрузки', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.evaluate(() =>
    (window as unknown as { __debug: Dbg }).__debug.go('game', {
      packId: 'tut',
      levelId: 'tut_01',
    }),
  );
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await page.evaluate(() => (window as unknown as { __debug: Dbg }).__debug.solve());
  await expect(page.getByTestId('result-sheet')).toBeVisible({ timeout: 8000 });

  const saved = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  const progress = (JSON.parse(saved!) as { progress: { levels: Record<string, unknown> } })
    .progress;
  expect(Object.keys(progress.levels)).toEqual(['tut_01']);

  await page.reload();
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.getByTestId('menu-play').click();
  await page.getByTestId('pack-tut').click();
  const card = page.getByTestId('level-tut_01');
  await expect(card).toHaveClass(/solved/);
  await expect(card.locator('.stars .on').first()).toBeVisible();
  await expect(page.getByTestId('level-tut_02')).not.toHaveClass(/solved/);

  await page.locator('[data-testid=screen-levels] [data-testid=back]').click();
  await expect(page.getByTestId('pack-tut')).toContainText('1');
  await page.locator('[data-testid=screen-packs] [data-testid=back]').click();
  await page.getByTestId('menu-collection').click();
  await expect(page.getByTestId('collection-tut_01')).toBeVisible();
  expect(errors).toEqual([]);
});

test('прогресс: набор закрыт, пока не решено нужное число уровней предыдущего', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await goMenu(page, 'lang=ru');
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('pack-food')).toBeEnabled();
  await expect(page.getByTestId('pack-home')).toBeDisabled();
  await expect(page.getByTestId('pack-home')).toContainText('7');

  // Сохранение, где решено 7 уровней набора «food».
  const levels = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [
      `food_${String(i + 1).padStart(2, '0')}`,
      { stars: 3, time: 30 },
    ]),
  );
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [SAVE_KEY, JSON.stringify({ v: 1, settings: {}, progress: { v: 1, levels } })],
  );
  await page.reload();
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('pack-home')).toBeEnabled();
  await expect(page.getByTestId('pack-food')).toContainText('7');
  expect(errors).toEqual([]);
});

test('прогресс: «Сбросить прогресс» очищает решённые уровни', async ({ page }) => {
  await goMenu(page, 'lang=ru');
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [
      SAVE_KEY,
      JSON.stringify({
        v: 1,
        settings: {},
        progress: { v: 1, levels: { tut_01: { stars: 2, time: 9 } } },
      }),
    ],
  );
  await page.reload();
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('settings-reset').click();
  await page.getByTestId('confirm-yes').click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
      return Object.keys(JSON.parse(raw!).progress.levels).length;
    })
    .toBe(0);
  await page.locator('[data-testid=screen-settings] [data-testid=back]').click();
  await page.getByTestId('menu-collection').click();
  await expect(page.getByTestId('screen-collection')).toContainText('Решённые');
});
