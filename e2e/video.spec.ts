import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Видео прохождения обучения (§10, контрольные точки). Запуск:
 * npx playwright test --project=video-desktop --project=video-phone
 * Результат — artifacts/videos/<проект>.webm.
 */

type Dbg = {
  go(id: string, p?: object): Promise<void>;
  level(): { id: string; status: string; size: number[] } | null;
  faceScreen(cell: number, axis: number, sign: number): { x: number; y: number } | null;
  solveStep(): number;
};

const CURSOR = `
(() => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;' +
    'background:rgba(255,255,255,.55);border:3px solid rgba(60,40,25,.85);box-shadow:0 2px 6px rgba(0,0,0,.3);' +
    'z-index:99999;pointer-events:none;transition:transform .08s ease, background .08s ease;display:none';
  const mount = () => document.body && !dot.isConnected && document.body.appendChild(dot);
  const move = (e) => { mount(); dot.style.display = 'block'; dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; };
  addEventListener('pointermove', move, true);
  addEventListener('pointerdown', (e) => { move(e); dot.style.transform = 'scale(.7)'; dot.style.background = 'rgba(42,169,155,.8)'; }, true);
  addEventListener('pointerup', () => { dot.style.transform = ''; dot.style.background = 'rgba(255,255,255,.55)'; }, true);
})();`;

const d = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { __debug: Dbg }).__debug);

async function cellFace(page: Page, x: number, y: number, z: number, axis = 2, sign = 1) {
  return page.evaluate(
    ([x, y, z, axis, sign]) => {
      const dbg = (window as unknown as { __debug: Dbg }).__debug;
      const s = dbg.level()!.size;
      return dbg.faceScreen(x! + s[0]! * (y! + s[1]! * z!), axis!, sign!)!;
    },
    [x, y, z, axis, sign],
  );
}

async function glide(page: Page, x: number, y: number, touch: boolean): Promise<void> {
  if (!touch) await page.mouse.move(x, y, { steps: 12 });
}

async function tap(
  page: Page,
  p: { x: number; y: number },
  touch: boolean,
  right = false,
): Promise<void> {
  if (touch) {
    await page.touchscreen.tap(p.x, p.y);
  } else {
    await glide(page, p.x, p.y, false);
    await page.mouse.down({ button: right ? 'right' : 'left' });
    await page.waitForTimeout(90);
    await page.mouse.up({ button: right ? 'right' : 'left' });
  }
  await page.waitForTimeout(450);
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  touch: boolean,
) {
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: y!, id: 1 }],
      });
    await send('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) {
      await send(
        'touchMove',
        from.x + ((to.x - from.x) * k) / 20,
        from.y + ((to.y - from.y) * k) / 20,
      );
      await page.waitForTimeout(25);
    }
    await send('touchEnd');
  } else {
    await glide(page, from.x, from.y, false);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 20 });
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
}

test('видео: обучение, уровень 1 → 2', async ({ page }, info) => {
  test.setTimeout(180_000);
  const touch = !!info.project.use.hasTouch;
  await page.addInitScript(CURSOR);
  await page.goto('/?debug=1&lang=ru');
  await page.addStyleTag({ content: '.debug-panel{display:none!important}' });
  await expect(page.getByTestId('menu-play')).toBeVisible();
  await page.waitForTimeout(800);

  // Меню → наборы → обучение → уровень 1.
  const click = async (id: string) => {
    const box = (await page.getByTestId(id).boundingBox())!;
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, touch);
  };
  await click('menu-play');
  await click('pack-tut');
  await click('level-tut_01');
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level() !== null,
  );
  await page.waitForTimeout(900);

  // Осмотреться: вращение за пустое место.
  const spot = await page.evaluate(() =>
    (
      window as unknown as { __debug: { emptySpot(): { x: number; y: number } } }
    ).__debug.emptySpot(),
  );
  const empty = { x: spot.x - 50, y: spot.y };
  await drag(page, empty, { x: empty.x + 100, y: empty.y + 30 }, touch);
  await drag(page, { x: empty.x + 100, y: empty.y + 30 }, empty, touch);

  // Ховер (мышь) и удары по нулям.
  if (!touch) {
    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [2, 2],
    ] as const) {
      await glide(
        page,
        ...(Object.values(await cellFace(page, x, y, 1)) as [number, number]),
        false,
      );
      await page.waitForTimeout(350);
    }
  }
  await tap(page, await cellFace(page, 2, 2, 1), touch);
  await tap(page, await cellFace(page, 1, 2, 1), touch);
  // Протяжка по линии вдоль Z по грани +X.
  await drag(page, await cellFace(page, 2, 1, 1, 0, 1), await cellFace(page, 2, 1, 0, 0, 1), touch);

  // Кисть: пометить куб, который точно остаётся.
  if (touch) await click('tool-brush');
  await tap(page, await cellFace(page, 0, 2, 1), touch, !touch);
  if (touch) await click('tool-hammer');
  // Удар по помеченному — «бонк», без штрафа.
  await tap(page, await cellFace(page, 0, 2, 1), touch);
  // Промах: трещина и тряска.
  await tap(page, await cellFace(page, 1, 1, 1), touch);
  await page.waitForTimeout(500);

  // Срез ручкой по оси взгляда (она одна) — тянем к блоку — и обратно.
  const knob = (await page.locator('.slice-knob:visible').boundingBox())!;
  const kc = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
  const mid = await cellFace(page, 1, 1, 1);
  await drag(page, kc, { x: (kc.x + mid.x) / 2, y: (kc.y + mid.y) / 2 }, touch);
  await page.waitForTimeout(700);
  await click('slice-less');
  await click('slice-less');
  await page.waitForTimeout(400);

  // Остаток — бот через debug-API, по шагу.
  for (let k = 0; k < 20; k++) {
    const acted = await page.evaluate(() =>
      (window as unknown as { __debug: Dbg }).__debug.solveStep(),
    );
    await page.waitForTimeout(600);
    if (!acted) break;
  }
  await expect(page.getByTestId('result-sheet')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await click('result-next');
  await page.waitForFunction(
    () => (window as unknown as { __debug: Dbg }).__debug.level()?.id === 'tut_02',
  );
  await page.waitForTimeout(1500);
  void d;

  mkdirSync('artifacts/videos', { recursive: true });
  const video = page.video();
  await page.close();
  await video?.saveAs(`artifacts/videos/${info.project.name}.webm`);
});
