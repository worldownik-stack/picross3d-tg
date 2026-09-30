import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { trackErrors } from './helpers';

/** Автономный HTML открывается с file:// и играется (npm run release:preview). */
const FILE = resolve('artifacts/release/cube-sculptor.html');

test.skip(!existsSync(FILE), 'нет автономной сборки');

test('автономная сборка: меню, наборы, уровень, удар', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto(`file://${FILE}`);
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('pack-test')).toBeVisible();
  await page.getByTestId('pack-tut').click();
  await page.getByTestId('level-tut_01').click();
  await expect(page.getByTestId('screen-game')).toHaveClass(/active/);
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.waitForTimeout(800);
  // Тап в центр холста — по кубу (что-то сломается или будет промах).
  const box = (await page.getByTestId('game-canvas').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
  if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `artifacts/release/check-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
