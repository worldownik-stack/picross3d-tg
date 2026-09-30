import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

/** Подставной Telegram WebApp: пишет вызовы в window.__tg. */
async function fakeTelegram(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: string[] = [];
    let backCb: (() => void) | null = null;
    const store: Record<string, string> = {};
    const w = window as unknown as Record<string, unknown>;
    w.__tg = { calls, back: () => backCb?.(), store };
    w.Telegram = {
      WebApp: {
        initData: 'query_id=test',
        initDataUnsafe: { user: { id: 7, language_code: 'en' } },
        version: '8.0',
        platform: 'android',
        isVersionAtLeast: () => true,
        ready: () => calls.push('ready'),
        expand: () => calls.push('expand'),
        close: () => {},
        disableVerticalSwipes: () => {},
        enableClosingConfirmation: () => calls.push('confirm:on'),
        disableClosingConfirmation: () => calls.push('confirm:off'),
        setHeaderColor: () => {},
        setBackgroundColor: () => {},
        onEvent: () => {},
        offEvent: () => {},
        CloudStorage: {
          setItem: (k: string, v: string, cb?: (e: null, ok: boolean) => void) => {
            store[k] = v;
            cb?.(null, true);
          },
          getItems: (keys: string[], cb: (e: null, v: Record<string, string>) => void) =>
            cb(null, Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]!]))),
          removeItems: () => {},
        },
        BackButton: {
          isVisible: false,
          show: () => calls.push('back:show'),
          hide: () => calls.push('back:hide'),
          onClick: (cb: () => void) => (backCb = cb),
          offClick: () => (backCb = null),
        },
        HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
      },
    };
  });
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tg: { calls: string[] } }).__tg.calls);

test('Telegram: платформа подхватывает WebApp, язык, ready и кнопку «назад»', async ({ page }) => {
  const errors = trackErrors(page);
  await fakeTelegram(page);
  await page.goto('/#tgWebAppData=query_id%3Dtest&tgWebAppPlatform=android');
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  // Язык из Telegram (en).
  await expect(page.getByTestId('menu-play')).toContainText('Play');
  expect((await calls(page)).filter((c) => c === 'ready')).toHaveLength(1);
  expect(await calls(page)).toContain('expand');
  // В меню «назад» скрыта, на вложенном экране — показана и работает.
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('screen-packs')).toHaveClass(/active/);
  expect(await calls(page)).toContain('back:show');
  await page.evaluate(() => (window as unknown as { __tg: { back(): void } }).__tg.back());
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  expect((await calls(page)).at(-1)).toBe('back:hide');
  expect(errors).toEqual([]);
});

test('Telegram: настройки сохраняются в CloudStorage и восстанавливаются', async ({ page }) => {
  await fakeTelegram(page);
  await page.goto('/#tgWebAppData=x&tgWebAppPlatform=android');
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('setting-vibration').click();
  await expect(page.getByTestId('setting-vibration')).toHaveAttribute('aria-checked', 'false');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys((window as unknown as { __tg: { store: object } }).__tg.store),
      ),
    )
    .toContain('save_meta');
  const store = await page.evaluate(
    () => (window as unknown as { __tg: { store: object } }).__tg.store,
  );
  // Новая загрузка с тем же облачным хранилищем.
  await page.addInitScript((s) => {
    Object.assign((window as unknown as { __tg: { store: object } }).__tg?.store ?? {}, s);
  }, store);
  // Локальная копия стёрта — значение должно прийти именно из CloudStorage.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('setting-vibration')).toHaveAttribute('aria-checked', 'false');
});

test('вне Telegram остаётся Mock без ошибок', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?debug=1&lang=ru');
  await expect(page.getByTestId('screen-menu')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});
