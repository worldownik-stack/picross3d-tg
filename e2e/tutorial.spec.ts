import { expect, test, type Page } from '@playwright/test';
import { openApp, trackErrors } from './helpers';

type Dbg = { go(id: string, p?: object): Promise<void>; level(): { status: string } | null };

async function openLevel(page: Page, levelId: string): Promise<void> {
  await page.evaluate(
    (l) =>
      (window as unknown as { __debug: Dbg }).__debug.go('game', { packId: 'tut', levelId: l }),
    levelId,
  );
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await expect(page.getByTestId('tutorial-text')).toBeVisible();
  await page.waitForTimeout(600);
}

/** Клик в кончик пальца руки (рука может быть развёрнута у нижнего края). */
async function tapHand(page: Page): Promise<void> {
  const hand = page.getByTestId('tutorial-hand');
  const box = (await hand.boundingBox())!;
  const flip = await hand.evaluate((el) => el.classList.contains('flip'));
  const tx = (flip ? 48 - 20.5 : 20.5) / 48;
  const ty = flip ? 1 - 5 / 48 : 5 / 48;
  await page.mouse.click(box.x + box.width * tx, box.y + box.height * ty);
}

test('обучение: рука указывает на нужное, шаги идут по действиям игрока', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);

  // Ступенька: рука на кубе с нулём — удар ломает его, шаг меняется.
  await openLevel(page, 'tut_01');
  const text = page.getByTestId('tutorial-text');
  const first = await text.textContent();
  await tapHand(page);
  await expect(text).not.toHaveText(first!);

  // Стул: рука на кнопке кисти → кисть выбрана → пометка → молоток.
  await openLevel(page, 'tut_03');
  await tapHand(page);
  await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-checked', 'true');
  const markStep = await text.textContent();
  await page.waitForTimeout(400);
  await tapHand(page);
  await expect(text).not.toHaveText(markStep!);
  await page.waitForTimeout(400);
  await tapHand(page);
  await expect(page.getByTestId('tool-hammer')).toHaveAttribute('aria-checked', 'true');

  // Решённый уровень обучения при повторе подсказок не показывает.
  await page.evaluate(() =>
    (window as unknown as { __debug: { solve(): unknown } }).__debug.solve(),
  );
  await expect(page.getByTestId('result-sheet')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __debug: Dbg }).__debug.go('game', {
      packId: 'tut',
      levelId: 'tut_03',
    }),
  );
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await expect(page.getByTestId('tutorial-text')).toHaveCount(0);
  expect(errors).toEqual([]);
});
