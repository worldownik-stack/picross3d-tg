import { BasePlatform } from './BasePlatform';
import type { SaveBlob } from './types';

const STORAGE_KEY = 'cube-sculptor/mock-cloud';

export interface MockOptions {
  lang?: string;
  /** Задержка «показа» рекламы, мс. */
  adDelayMs?: number;
  /** Выдавать ли награду за rewarded. */
  rewarded?: boolean;
  now?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** Локальная реализация для разработки и тестов. Ведёт журнал вызовов. */
export class MockPlatform extends BasePlatform {
  readonly kind = 'mock' as const;
  readonly rawLang: string;
  readonly hasAds = true;
  readonly log: string[] = [];
  private authorized = false;
  private readonly adDelayMs: number;
  private readonly rewarded: boolean;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;

  constructor(opts: MockOptions = {}) {
    super(opts.now);
    this.rawLang = opts.lang ?? 'ru';
    this.adDelayMs = opts.adDelayMs ?? 400;
    this.rewarded = opts.rewarded ?? true;
    this.storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  }

  protected doLoadingReady(): void {
    this.log.push('ready');
  }
  protected doGameplayStart(): void {
    this.log.push('start');
  }
  protected doGameplayStop(): void {
    this.log.push('stop');
  }

  /** Для тестов: имитировать событие паузы SDK. */
  simulatePause(): void {
    this.log.push('pause');
    this.setPaused('sdk', true);
  }
  simulateResume(): void {
    this.log.push('resume');
    this.setPaused('sdk', false);
  }

  protected async doShowFullscreenAd(): Promise<void> {
    this.log.push('ad:fullscreen');
    await delay(this.adDelayMs);
  }

  protected async doShowRewardedAd(): Promise<boolean> {
    this.log.push('ad:rewarded');
    await delay(this.adDelayMs);
    return this.rewarded;
  }

  async loadData(): Promise<SaveBlob | null> {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SaveBlob;
    } catch {
      return null;
    }
  }

  async saveData(data: SaveBlob, flush: boolean): Promise<void> {
    this.log.push(flush ? 'save:flush' : 'save');
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  isAuthorized(): boolean {
    return this.authorized;
  }

  async login(): Promise<boolean> {
    this.log.push('login');
    this.authorized = true;
    return true;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
