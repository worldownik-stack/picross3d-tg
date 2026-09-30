import { describe, expect, it, vi } from 'vitest';
import { TelegramPlatform } from '../src/platform/TelegramPlatform';

type Cb = () => void;

function fakeWebApp(version = '8.0') {
  const store = new Map<string, string>();
  const handlers = new Map<string, Cb>();
  const calls: string[] = [];
  const setCalls: string[] = [];
  const app = {
    initData: 'query_id=x',
    initDataUnsafe: { user: { id: 1, language_code: 'ru' } },
    version,
    platform: 'android',
    isVersionAtLeast: (v: string) => parseFloat(version) >= parseFloat(v),
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    close: () => {},
    disableVerticalSwipes: () => calls.push('noswipe'),
    enableClosingConfirmation: () => calls.push('confirm:on'),
    disableClosingConfirmation: () => calls.push('confirm:off'),
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    onEvent: (e: string, cb: Cb) => handlers.set(e, cb),
    offEvent: () => {},
    CloudStorage: {
      setItem: (k: string, v: string, cb?: (e: string | null, ok?: boolean) => void) => {
        expect(v.length).toBeLessThanOrEqual(4096);
        store.set(k, v);
        setCalls.push(k);
        cb?.(null, true);
      },
      getItems: (keys: string[], cb: (e: string | null, v?: Record<string, string>) => void) =>
        cb(
          null,
          Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)!])),
        ),
      removeItems: () => {},
    },
    BackButton: {
      isVisible: false,
      show: () => calls.push('back:show'),
      hide: () => calls.push('back:hide'),
      onClick: () => {},
      offClick: () => {},
    },
    HapticFeedback: {
      impactOccurred: (s: string) => calls.push(`impact:${s}`),
      notificationOccurred: (t: string) => calls.push(`notify:${t}`),
    },
  };
  return { app: app as unknown as TelegramWebApp, calls, store, handlers, setCalls };
}

describe('TelegramPlatform', () => {
  it('настраивает WebApp, язык и авторизацию из Telegram', () => {
    const { app, calls } = fakeWebApp();
    const p = new TelegramPlatform(app);
    expect(p.rawLang).toBe('ru');
    expect(p.isAuthorized()).toBe(true);
    expect(calls).toEqual(expect.arrayContaining(['expand', 'noswipe']));
    p.loadingReady();
    p.loadingReady();
    expect(calls.filter((c) => c === 'ready')).toHaveLength(1);
  });

  it('включает подтверждение закрытия только во время партии', () => {
    const { app, calls } = fakeWebApp();
    const p = new TelegramPlatform(app);
    p.gameplayStart();
    p.gameplayStop();
    expect(calls.filter((c) => c.startsWith('confirm'))).toEqual(['confirm:on', 'confirm:off']);
  });

  it('ставит паузу по activated/deactivated', () => {
    const { app, handlers } = fakeWebApp();
    const p = new TelegramPlatform(app);
    const pause = vi.fn();
    const resume = vi.fn();
    p.onPause(pause);
    p.onResume(resume);
    handlers.get('deactivated')!();
    handlers.get('activated')!();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('без рекламной сети продолжение бесплатно, полноэкранной рекламы нет', async () => {
    const { app } = fakeWebApp();
    const p = new TelegramPlatform(app);
    expect(p.hasAds).toBe(false);
    expect(await p.showRewardedAd()).toBe(true);
    await expect(p.showFullscreenAd()).resolves.toBeUndefined();
  });

  it('с рекламной сетью, но без загруженного SDK награда не выдаётся', async () => {
    const { app } = fakeWebApp();
    const p = new TelegramPlatform(app, { rewardedBlockId: '123' });
    // initAds не отработал (нет DOM) — контроллера нет.
    expect(p.hasAds).toBe(true);
    expect(await p.showRewardedAd()).toBe(false);
  });

  it('сохраняет и читает блоб из CloudStorage кусками ≤ 4096', async () => {
    const { app, setCalls } = fakeWebApp();
    const p = new TelegramPlatform(app);
    const big = { v: 1, data: 'я'.repeat(9000) };
    await p.saveData(big, true);
    expect(setCalls.filter((k) => k.startsWith('save_') && k !== 'save_meta').length).toBe(
      Math.ceil(JSON.stringify(big).length / 3500),
    );
    expect(setCalls.at(-1)).toBe('save_meta');
    expect(await p.loadData()).toEqual(big);
  });

  it('на старом клиенте (<6.9) CloudStorage не трогает', async () => {
    const { app, setCalls } = fakeWebApp('6.0');
    const p = new TelegramPlatform(app);
    await p.saveData({ a: 1 }, false);
    expect(setCalls).toEqual([]);
  });

  it('haptic: промах — impact, победа/поражение — notification', () => {
    const { app, calls } = fakeWebApp();
    const p = new TelegramPlatform(app);
    p.haptic('miss');
    p.haptic('win');
    p.haptic('fail');
    expect(calls.filter((c) => /^(impact|notify)/.test(c))).toEqual([
      'impact:medium',
      'notify:success',
      'notify:error',
    ]);
  });
});
