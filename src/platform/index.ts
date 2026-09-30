import { MockPlatform } from './MockPlatform';
import { TelegramPlatform, loadTelegramWebApp, looksLikeTelegram } from './TelegramPlatform';
import type { Platform } from './types';

export type { Platform, SaveBlob, HapticKind } from './types';

/**
 * Выбор реализации: внутри Telegram Mini App — TelegramPlatform,
 * в обычном браузере (dev, тесты) — Mock. `?platform=mock` принудительно включает Mock.
 * Вкладка браузера (visibilitychange) ставит игру на паузу в любой реализации.
 */
export async function createPlatform(): Promise<Platform> {
  const params = new URLSearchParams(location.search);
  if (params.get('platform') !== 'mock' && looksLikeTelegram()) {
    try {
      const tg = await loadTelegramWebApp();
      if (tg) {
        const env = import.meta.env;
        return new TelegramPlatform(tg, {
          rewardedBlockId: env.VITE_ADSGRAM_REWARDED_BLOCK_ID || undefined,
          interstitialBlockId: env.VITE_ADSGRAM_INTERSTITIAL_BLOCK_ID || undefined,
          fullscreen: env.VITE_TG_FULLSCREEN === '1',
        });
      }
    } catch (e) {
      console.warn('telegram platform init failed, falling back to mock', e);
    }
  }
  return new MockPlatform({ lang: params.get('lang') ?? navigator.language ?? 'ru' });
}
