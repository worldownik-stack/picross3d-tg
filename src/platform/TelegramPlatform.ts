import { BasePlatform } from './BasePlatform';
import type { HapticKind, SaveBlob } from './types';

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
const ADSGRAM_URL = 'https://sad.adsgram.ai/js/sad.min.js';
const SDK_TIMEOUT_MS = 4000;

/** Цвет фона приложения (совпадает с index.html / styles.css). */
const BG = '#f3e9d8';

/** CloudStorage: значение ≤ 4096 символов, блоб режется на куски. */
const CHUNK = 3500;
const META_KEY = 'save_meta';
const chunkKey = (i: number) => `save_${i}`;
const LOCAL_KEY = 'cube-sculptor/tg-save';

export interface TelegramOptions {
  rewardedBlockId?: string;
  interstitialBlockId?: string;
  fullscreen?: boolean;
}

/** Запущено ли приложение внутри Telegram (по параметрам запуска в URL/сессии). */
export function looksLikeTelegram(): boolean {
  try {
    if (/tgWebApp(Data|Platform)=/.test(location.hash)) return true;
    return sessionStorage.getItem('__telegram__initParams') !== null;
  } catch {
    return false;
  }
}

function loadScript(src: string, timeoutMs: number): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const el = document.createElement('script');
    const timer = setTimeout(() => done(false), timeoutMs);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    el.src = src;
    el.async = true;
    el.onload = () => done(true);
    el.onerror = () => done(false);
    document.head.append(el);
  });
}

/** Подключает SDK и возвращает WebApp, либо `null`, если это не настоящий Mini App. */
export async function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (!window.Telegram?.WebApp) await loadScript(SDK_URL, SDK_TIMEOUT_MS);
  const app = window.Telegram?.WebApp;
  return app && app.initData ? app : null;
}

/**
 * Платформа Telegram Mini Apps: WebApp SDK, CloudStorage для сохранений,
 * HapticFeedback, BackButton и (опционально) реклама Adsgram.
 */
export class TelegramPlatform extends BasePlatform {
  readonly kind = 'telegram' as const;
  readonly rawLang: string;
  private rewarded: AdsgramController | null = null;
  private interstitial: AdsgramController | null = null;
  private backHandler: (() => void) | null = null;
  private writing = false;
  private pending: SaveBlob | null = null;

  constructor(
    private readonly tg: TelegramWebApp,
    private readonly opts: TelegramOptions = {},
  ) {
    super();
    this.rawLang = tg.initDataUnsafe.user?.language_code ?? navigator.language ?? 'ru';
    this.setupWebApp();
  }

  get hasAds(): boolean {
    return Boolean(this.opts.rewardedBlockId);
  }

  private setupWebApp(): void {
    const tg = this.tg;
    tg.expand();
    if (this.opts.fullscreen && ['android', 'ios'].includes(tg.platform)) {
      try {
        tg.requestFullscreen?.();
      } catch {
        /* Bot API < 8.0 — остаёмся в обычном режиме. */
      }
    }
    tg.disableVerticalSwipes?.();
    for (const apply of [
      () => tg.setHeaderColor(BG),
      () => tg.setBackgroundColor(BG),
      () => tg.setBottomBarColor?.(BG),
    ]) {
      try {
        apply();
      } catch {
        /* Старые клиенты не знают эти методы. */
      }
    }
    // Свёрнутое/неактивное окно (Bot API 8.0) — внешняя пауза.
    tg.onEvent('deactivated', () => this.setPaused('tg', true));
    tg.onEvent('activated', () => this.setPaused('tg', false));
    if (this.opts.rewardedBlockId || this.opts.interstitialBlockId) void this.initAds();
  }

  private async initAds(): Promise<void> {
    if (!(await loadScript(ADSGRAM_URL, 8000)) || !window.Adsgram) return;
    const { rewardedBlockId, interstitialBlockId } = this.opts;
    if (rewardedBlockId) this.rewarded = window.Adsgram.init({ blockId: rewardedBlockId });
    if (interstitialBlockId) {
      this.interstitial = window.Adsgram.init({ blockId: interstitialBlockId });
    }
  }

  protected doLoadingReady(): void {
    this.tg.ready();
  }

  // Подтверждение закрытия — пока идёт партия, чтобы не потерять прогресс случайным свайпом.
  protected doGameplayStart(): void {
    this.tg.enableClosingConfirmation();
  }
  protected doGameplayStop(): void {
    this.tg.disableClosingConfirmation();
  }

  protected async doShowFullscreenAd(): Promise<void> {
    if (!this.interstitial) return;
    await this.interstitial.show().catch(() => undefined);
  }

  protected async doShowRewardedAd(): Promise<boolean> {
    // Рекламная сеть не настроена — продолжение выдаётся бесплатно.
    if (!this.opts.rewardedBlockId) return true;
    if (!this.rewarded) return false;
    try {
      return (await this.rewarded.show()).done;
    } catch {
      return false;
    }
  }

  haptic(kind: HapticKind): void {
    try {
      const h = this.tg.HapticFeedback;
      if (kind === 'miss') h.impactOccurred('medium');
      else h.notificationOccurred(kind === 'win' ? 'success' : 'error');
    } catch {
      /* HapticFeedback появился в Bot API 6.1. */
    }
  }

  setBackButton(visible: boolean, onClick: () => void): void {
    const b = this.tg.BackButton;
    if (this.backHandler) b.offClick(this.backHandler);
    this.backHandler = onClick;
    b.onClick(onClick);
    if (visible) b.show();
    else b.hide();
  }

  // --- Сохранения: CloudStorage (Bot API 6.9+), запасной вариант — localStorage. ---

  private get cloudOk(): boolean {
    return this.tg.isVersionAtLeast('6.9');
  }

  async loadData(): Promise<SaveBlob | null> {
    if (this.cloudOk) {
      try {
        const cloud = await this.readCloud();
        if (cloud) return cloud;
      } catch (e) {
        console.warn('cloud load failed', e);
      }
    }
    return readLocal();
  }

  async saveData(data: SaveBlob, _flush: boolean): Promise<void> {
    writeLocal(data);
    if (!this.cloudOk) return;
    // Последняя запись побеждает; одновременно идёт не больше одной.
    this.pending = data;
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.pending) {
        const next = this.pending;
        this.pending = null;
        await this.writeCloud(next);
      }
    } catch (e) {
      console.warn('cloud save failed', e);
    } finally {
      this.writing = false;
    }
  }

  private getItems(keys: string[]): Promise<Record<string, string>> {
    return new Promise((resolve, reject) =>
      this.tg.CloudStorage.getItems(keys, (err, values) =>
        err ? reject(new Error(err)) : resolve(values ?? {}),
      ),
    );
  }

  private setItem(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) =>
      this.tg.CloudStorage.setItem(key, value, (err) => (err ? reject(new Error(err)) : resolve())),
    );
  }

  private async readCloud(): Promise<SaveBlob | null> {
    const metaRaw = (await this.getItems([META_KEY]))[META_KEY];
    if (!metaRaw) return null;
    const { n } = JSON.parse(metaRaw) as { n: number };
    const keys = Array.from({ length: n }, (_, i) => chunkKey(i));
    const parts = await this.getItems(keys);
    const json = keys.map((k) => parts[k] ?? '').join('');
    return JSON.parse(json) as SaveBlob;
  }

  private async writeCloud(data: SaveBlob): Promise<void> {
    const json = JSON.stringify(data);
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
    // Сначала куски, затем meta: оборванная запись не ломает прежний сейв.
    await Promise.all(chunks.map((c, i) => this.setItem(chunkKey(i), c)));
    await this.setItem(META_KEY, JSON.stringify({ n: chunks.length }));
  }

  // Telegram сам идентифицирует игрока — отдельная авторизация не нужна.
  isAuthorized(): boolean {
    return Boolean(this.tg.initDataUnsafe.user);
  }

  async login(): Promise<boolean> {
    return this.isAuthorized();
  }
}

function readLocal(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SaveBlob) : null;
  } catch {
    return null;
  }
}

function writeLocal(data: SaveBlob): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* хранилище недоступно */
  }
}
