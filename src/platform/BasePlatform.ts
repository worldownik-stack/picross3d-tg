import type { Platform, SaveBlob } from './types';

/** Минимальный интервал между полноэкранными показами, мс (§8). */
export const FULLSCREEN_AD_COOLDOWN_MS = 60_000;

/**
 * Общие гарантии для всех реализаций: `ready` один раз, без двойных
 * `start`/`stop`, кулдаун полноэкранной рекламы, пауза по скрытию вкладки.
 */
export abstract class BasePlatform implements Platform {
  abstract readonly kind: 'telegram' | 'mock';
  abstract readonly hasAds: boolean;
  abstract readonly rawLang: string;

  private readyCalled = false;
  private gameplayActive = false;
  private lastFullscreenAt = -Infinity;
  private adShowing = false;
  private readonly pauseReasons = new Set<string>();
  private readonly pauseCbs: Array<() => void> = [];
  private readonly resumeCbs: Array<() => void> = [];

  protected constructor(private readonly now: () => number = () => performance.now()) {
    if (typeof document !== 'undefined') {
      const sync = () => this.setPaused('hidden', document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', sync);
    }
  }

  loadingReady(): void {
    if (this.readyCalled) return;
    this.readyCalled = true;
    this.doLoadingReady();
  }

  gameplayStart(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.doGameplayStart();
  }

  gameplayStop(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.doGameplayStop();
  }

  get isGameplayActive(): boolean {
    return this.gameplayActive;
  }

  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  get isExternallyPaused(): boolean {
    return this.pauseReasons.size > 0;
  }

  /**
   * Внешняя пауза с причиной (`sdk`, `hidden`, `ad`). Колбэки вызываются
   * только при переходе «нет причин» ↔ «есть причины».
   */
  protected setPaused(reason: string, paused: boolean): void {
    const before = this.pauseReasons.size > 0;
    if (paused) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    const after = this.pauseReasons.size > 0;
    if (before === after) return;
    for (const cb of after ? this.pauseCbs : this.resumeCbs) cb();
  }

  async showFullscreenAd(): Promise<void> {
    const t = this.now();
    if (this.adShowing || t - this.lastFullscreenAt < FULLSCREEN_AD_COOLDOWN_MS) return;
    this.adShowing = true;
    this.lastFullscreenAt = t;
    const wasActive = this.gameplayActive;
    this.gameplayStop();
    this.setPaused('ad', true);
    try {
      await this.doShowFullscreenAd();
    } catch (e) {
      console.warn('fullscreen ad failed', e);
    } finally {
      this.adShowing = false;
      this.setPaused('ad', false);
      if (wasActive) this.gameplayStart();
    }
  }

  async showRewardedAd(): Promise<boolean> {
    if (this.adShowing) return false;
    this.adShowing = true;
    const wasActive = this.gameplayActive;
    this.gameplayStop();
    this.setPaused('ad', true);
    try {
      return await this.doShowRewardedAd();
    } catch (e) {
      console.warn('rewarded ad failed', e);
      return false;
    } finally {
      this.adShowing = false;
      this.setPaused('ad', false);
      if (wasActive) this.gameplayStart();
    }
  }

  abstract loadData(): Promise<SaveBlob | null>;
  abstract saveData(data: SaveBlob, flush: boolean): Promise<void>;
  abstract isAuthorized(): boolean;
  abstract login(): Promise<boolean>;

  protected abstract doLoadingReady(): void;
  protected abstract doGameplayStart(): void;
  protected abstract doGameplayStop(): void;
  protected abstract doShowFullscreenAd(): Promise<void>;
  protected abstract doShowRewardedAd(): Promise<boolean>;
}
