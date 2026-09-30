import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/** Скриншоты всех экранов во всех ориентациях (§10): artifacts/screens/<проект>/. */
async function shot(page: Page, name: string, project: string, wait = 350): Promise<void> {
  await page.waitForTimeout(wait);
  // Дождаться окончания CSS-анимаций (появление модалок и т. п.).
  // Бесконечные декоративные анимации (кубики в меню) не ждём.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
  await page.screenshot({ path: `artifacts/screens/${project}/${name}.png` });
}

type Ctl = {
  grid: { size: number[] };
  session: { puzzle: { classes: Uint8Array }; marked: Uint8Array; status: string };
  setSlice(s: object): void;
};
type Dbg = {
  go(id: string, p?: object): Promise<void>;
  level(): unknown;
  solve(): unknown;
  hammer(i: number): void;
  brush(i: number): void;
  app: { router: { currentScreen: { currentController: Ctl } } };
};
const go = (page: Page, packId: string, levelId: string) =>
  page.evaluate(
    ([p, l]) =>
      (window as unknown as { __debug: Dbg }).__debug.go('game', { packId: p, levelId: l }),
    [packId, levelId],
  );

test('скриншоты экранов', async ({ page }, info) => {
  test.setTimeout(120_000);
  const project = info.project.name.replace(/^screens-/, '');
  await openApp(page, 'debug=1&lang=ru');
  await page.addStyleTag({ content: '.debug-panel{display:none!important}' });
  await shot(page, '01-menu', project);

  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('screen-packs')).toHaveClass(/active/);
  await shot(page, '02-packs', project);

  await page.getByTestId('pack-tut').click();
  await expect(page.getByTestId('screen-levels')).toHaveClass(/active/);
  await shot(page, '03-levels', project);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('screen-settings')).toHaveClass(/active/);
  await shot(page, '04-settings', project);

  await page.keyboard.press('Escape');
  await page.getByTestId('menu-collection').click();
  await expect(page.getByTestId('screen-collection')).toHaveClass(/active/);
  await shot(page, '05-collection', project);

  // Уровень: обучение 1, свежий.
  await go(page, 'tut', 'tut_01');
  await expect(page.getByTestId('screen-game')).toHaveClass(/active/);
  await shot(page, '06-level-tut01', project, 800);

  // 10×10×10 в процессе: сломанные, помеченные, промах, срез.
  await go(page, 'test', 'test_03');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const d = (window as unknown as { __debug: Dbg }).__debug;
    const ctl = d.app.router.currentScreen.currentController;
    const sol: Uint8Array = ctl.session.puzzle.classes;
    const [X, Y, Z] = ctl.grid.size;
    let k = 0;
    for (let i = 0; i < X! * Y! * Z!; i++) {
      const z = Math.floor(i / (X! * Y!));
      if (!sol[i] && z >= Z! - 3 && k++ % 2 === 0) d.hammer(i);
    }
    let m = 0;
    for (let i = 0; i < sol.length && m < 20; i++) {
      if (sol[i] && i % 5 === 0) {
        d.brush(i);
        m++;
      }
    }
    for (let i = sol.length - 1; i >= 0; i--)
      if (sol[i] && !ctl.session.marked[i]) {
        d.hammer(i);
        break;
      }
    ctl.setSlice({ axis: 1, side: 1, depth: 2 });
  });
  await shot(page, '07-level-10x10x10', project, 1500);

  // Пауза.
  await page.getByTestId('game-pause').click();
  await expect(page.getByTestId('pause-modal')).toBeVisible();
  await shot(page, '08-pause', project);
  await page.getByTestId('pause-resume').click();

  // Поражение.
  await page.evaluate(() => {
    const d = (window as unknown as { __debug: Dbg }).__debug;
    const ctl = d.app.router.currentScreen.currentController;
    const sol: Uint8Array = ctl.session.puzzle.classes;
    for (let i = 0; i < sol.length && ctl.session.status === 'playing'; i++) {
      if (sol[i] && !ctl.session.marked[i]) d.hammer(i);
    }
  });
  await expect(page.getByTestId('fail-modal')).toBeVisible();
  await shot(page, '09-fail', project);

  // Победа.
  await go(page, 'tut', 'tut_05');
  await page.waitForTimeout(600);
  await page.evaluate(() => (window as unknown as { __debug: Dbg }).__debug.solve());
  await expect(page.getByTestId('result-sheet')).toBeVisible({ timeout: 15000 });
  await shot(page, '10-win', project, 1200);
});
