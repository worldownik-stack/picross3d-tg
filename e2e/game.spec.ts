import { expect, test, type Page } from '@playwright/test';
import { expectNoScroll, openApp, platformLog, trackErrors } from './helpers';

interface LevelState {
  id: string;
  status: string;
  mistakes: number;
  remaining: number;
  tool: string;
  slice: { axis: number | null; depth: number; side: number };
  locked: boolean;
  size: number[];
  broken: number[];
  marked: number[];
}

type Dbg = {
  go(id: string, p?: object): Promise<void>;
  level(): LevelState | null;
  faceScreen(cell: number, axis: number, sign: number): { x: number; y: number } | null;
  solve(): LevelState;
};

const dbg = <T>(page: Page, fn: (d: Dbg) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__debug)`) as Promise<T>;

async function openLevel(page: Page, packId: string, levelId: string): Promise<void> {
  await dbg(page, () => 0);
  await page.evaluate(
    ([p, l]) =>
      (window as unknown as { __debug: Dbg }).__debug.go('game', { packId: p, levelId: l }),
    [packId, levelId],
  );
  await expect(page.getByTestId('screen-game')).toHaveClass(/active/);
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await page.waitForTimeout(300);
}

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __debug: Dbg }).__debug.level()!);

async function face(page: Page, x: number, y: number, z: number, axis = 2, sign = 1) {
  return page.evaluate(
    ([x, y, z, axis, sign]) => {
      const d = (window as unknown as { __debug: Dbg }).__debug;
      const s = d.level()!.size;
      const i = x! + s[0]! * (y! + s[1]! * z!);
      return { i, p: d.faceScreen(i, axis!, sign!)! };
    },
    [x, y, z, axis, sign],
  );
}

/** Тап/клик по грани куба с учётом типа устройства. */
async function tapAt(page: Page, x: number, y: number, touch: boolean): Promise<void> {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.waitForTimeout(touch ? 250 : 80);
}

/** Протяжка пальцем через CDP (в Playwright нет touch-move). */
async function touchDrag(page: Page, pts: Array<{ x: number; y: number }>): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
    });
  await send('touchStart', pts[0]);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    for (let s = 1; s <= 6; s++) {
      await send('touchMove', { x: a.x + ((b.x - a.x) * s) / 6, y: a.y + ((b.y - a.y) * s) / 6 });
      await page.waitForTimeout(16);
    }
  }
  await send('touchEnd');
  await page.waitForTimeout(100);
}

test.describe('уровень', () => {
  test('молоток, промах, кисть, протяжка, срез, победа', async ({ page }, info) => {
    const touch = !!info.project.use.hasTouch;
    const errors = trackErrors(page);
    await openApp(page);
    await openLevel(page, 'tut', 'tut_01');
    expect((await platformLog(page)).at(-1)).toBe('start');

    // Ступенька 3×3×2: пусто в (2,1,*), (1,2,*), (2,2,*).
    const empty = await face(page, 2, 2, 1);
    await tapAt(page, empty.p.x, empty.p.y, touch);
    let s = await state(page);
    expect(s.broken[empty.i]).toBe(1);
    expect(s.mistakes).toBe(0);

    // Промах по кубу фигуры: трещина, пометка, счётчик.
    const solid = await face(page, 0, 2, 1);
    await tapAt(page, solid.p.x, solid.p.y, touch);
    s = await state(page);
    expect(s.mistakes).toBe(1);
    expect(s.marked[solid.i]).toBe(1);
    await expect(page.locator('.hud-mistakes .pip.on')).toHaveCount(1);

    // Кисть: ПКМ на десктопе, переключатель инструмента на телефоне.
    const keep = await face(page, 1, 1, 1);
    if (touch) {
      await page.getByTestId('tool-brush').click();
      await tapAt(page, keep.p.x, keep.p.y, true);
      await page.getByTestId('tool-hammer').click();
    } else {
      await page.mouse.click(keep.p.x, keep.p.y, { button: 'right' });
      await page.waitForTimeout(80);
    }
    s = await state(page);
    expect(s.marked[keep.i]).toBe(1);
    // Помеченный куб молотком не ломается («бонк»).
    await tapAt(page, keep.p.x, keep.p.y, touch);
    s = await state(page);
    expect(s.broken[keep.i]).toBe(0);
    expect(s.mistakes).toBe(1);

    // Протяжка молотком вдоль линии: (2,1,1) → (2,1,0) по оси Z (грань +X).
    const a = await face(page, 2, 1, 1, 0, 1);
    const b = await face(page, 2, 1, 0, 0, 1);
    if (touch) {
      await touchDrag(page, [a.p, b.p]);
    } else {
      await page.mouse.move(a.p.x, a.p.y);
      await page.mouse.down();
      await page.mouse.move((a.p.x + b.p.x) / 2, (a.p.y + b.p.y) / 2, { steps: 5 });
      await page.mouse.move(b.p.x, b.p.y, { steps: 5 });
      await page.mouse.up();
    }
    s = await state(page);
    expect(s.broken[a.i]).toBe(1);
    expect(s.broken[b.i]).toBe(1);

    // Срез: кнопка «+» срезает слой по текущей оси (Y), «−» возвращает.
    await page.getByTestId('slice-more').click();
    s = await state(page);
    expect(s.slice.axis).toBe(1);
    expect(s.slice.depth).toBe(1);
    await page.getByTestId('slice-less').click();
    s = await state(page);
    expect(s.slice.depth).toBe(0);

    // Остальное решает бот через debug-API → победа.
    await page.evaluate(() => (window as unknown as { __debug: Dbg }).__debug.solve());
    s = await state(page);
    expect(s.status).toBe('won');
    expect(s.locked).toBe(true);
    await expect(page.getByTestId('result-sheet')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('win-title')).toHaveText('Ступенька');
    await expect(page.locator('.result-sheet .stars .on')).toHaveCount(2);
    expect((await platformLog(page)).at(-1)).toBe('stop');
    await expectNoScroll(page);
    expect(errors).toEqual([]);

    // «Далее» → следующий уровень обучения.
    await page.getByTestId('result-next').click();
    await page.waitForFunction(
      () => (window as unknown as { __debug: Dbg }).__debug.level()?.id === 'tut_02',
      null,
      { timeout: 8000 },
    );
  });

  test('пауза и возврат, клавиши', async ({ page }, info) => {
    const errors = trackErrors(page);
    await openApp(page);
    await openLevel(page, 'test', 'test_01');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-modal')).toBeVisible();
    expect((await platformLog(page)).at(-1)).toBe('stop');
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('pause-modal')).toHaveCount(0);
    expect((await platformLog(page)).at(-1)).toBe('start');
    if (!info.project.use.hasTouch) {
      await page.keyboard.press('Digit2');
      expect((await state(page)).tool).toBe('brush');
      await page.keyboard.press('Digit1');
      await page.keyboard.down('Space');
      expect((await state(page)).tool).toBe('brush');
      await page.keyboard.up('Space');
      expect((await state(page)).tool).toBe('hammer');
      await page.keyboard.press('KeyR'); // Y → Z
      await page.keyboard.press('KeyE');
      await page.keyboard.press('KeyE');
      const s = await state(page);
      expect(s.slice).toMatchObject({ axis: 2, depth: 2 });
      await page.keyboard.press('KeyQ');
      expect((await state(page)).slice.depth).toBe(1);
    }
    // Пауза → меню.
    await page.getByTestId('game-pause').click();
    await page.getByTestId('pause-menu').click();
    await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
    expect((await platformLog(page)).at(-1)).not.toBe('start');
    await expectNoScroll(page);
    expect(errors).toEqual([]);
  });

  test('5 промахов → поражение, продолжение за рекламу', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await openLevel(page, 'test', 'test_01');
    await page.evaluate(() => {
      const d = (window as unknown as { __debug: Dbg & { hammer(i: number): void; app: unknown } })
        .__debug;
      const s = d.level()!;
      // Кубы фигуры в центре шара.
      const n = s.size[0]!;
      for (let k = 0; k < 5; k++) d.hammer(4 + n * (4 + n * (2 + k)));
    });
    await expect(page.getByTestId('fail-modal')).toBeVisible();
    await page.getByTestId('fail-continue').click();
    await expect(page.getByTestId('fail-modal')).toHaveCount(0, { timeout: 5000 });
    const s = await state(page);
    expect(s.status).toBe('playing');
    expect(s.mistakes).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('камера', () => {
  test('вращение по пустому месту, зум, ховер', async ({ page }, info) => {
    const touch = !!info.project.use.hasTouch;
    const errors = trackErrors(page);
    await openApp(page);
    await openLevel(page, 'tut', 'tut_03');
    const cam0 = (await state(page)) as unknown as {
      camera: { az: number; pitch: number; zoom: number };
    };
    const vp = page.viewportSize()!;
    // Пустое место canvas (не куб и не ручка среза); жест идёт в пределах ±60 px.
    const spot = await page.evaluate(() =>
      (
        window as unknown as { __debug: { emptySpot(): { x: number; y: number } } }
      ).__debug.emptySpot(),
    );
    expect(spot).not.toBeNull();
    const ex = spot.x - 50;
    const ey = spot.y;
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      const tp = (pts: Array<[number, number]>) => pts.map(([x, y], id) => ({ x, y, id }));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: tp([[ex, ey]]),
      });
      for (let k = 1; k <= 8; k++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: tp([[ex + k * 12, ey]]),
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // Pinch: два пальца расходятся — приближение.
      const cx = vp.width / 2;
      const cy = vp.height / 2;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: tp([
          [cx - 40, cy],
          [cx + 40, cy],
        ]),
      });
      for (let k = 1; k <= 8; k++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: tp([
            [cx - 40 - k * 10, cy],
            [cx + 40 + k * 10, cy],
          ]),
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(ex, ey);
      await page.mouse.down();
      await page.mouse.move(ex + 100, ey, { steps: 8 });
      await page.mouse.up();
      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.wheel(0, -300);
    }
    await page.waitForTimeout(150);
    const cam1 = (await state(page)) as unknown as {
      camera: { az: number; zoom: number };
      broken: number[];
    };
    expect(cam1.camera.az).toBeLessThan(cam0.camera.az - 0.3);
    expect(cam1.camera.zoom).toBeLessThan(cam0.camera.zoom);
    // Ни один куб не сломан жестами камеры.
    expect(cam1.broken.every((b) => b === 0)).toBe(true);
    if (!touch) {
      const f = await face(page, 1, 4, 2, 2, 1);
      await page.mouse.move(f.p.x, f.p.y);
      await page.waitForTimeout(100);
      const s = (await state(page)) as unknown as { hover: number };
      expect(s.hover).toBe(f.i);
    }
    // Сброс вида.
    await page.getByTestId('reset-view').click();
    await page.waitForFunction(
      () =>
        Math.abs(
          (
            window as unknown as { __debug: { level(): { camera: { zoom: number } } } }
          ).__debug.level().camera.zoom - 1,
        ) < 0.01,
      null,
      { timeout: 20000 },
    );
    expect(errors).toEqual([]);
  });
});
