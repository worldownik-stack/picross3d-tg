import type { Platform, SaveBlob } from '../platform';
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings';
import { parseProgress, type ProgressData, type ProgressStore } from './progress';

/** Версия схемы сохранения. При смене формата добавьте миграцию в `parseSave`. */
export const SAVE_VERSION = 1;

export interface LoadedSave {
  settings: Partial<Settings>;
  progress: ProgressData;
}

/** Разбор блоба платформы: неизвестные и некорректные поля отбрасываются. */
export function parseSave(blob: SaveBlob | null): LoadedSave {
  const rawSettings = (blob?.settings ?? {}) as Record<string, unknown>;
  const settings: Partial<Settings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    if (typeof rawSettings[key] === 'boolean') settings[key] = rawSettings[key];
  }
  return { settings, progress: parseProgress(blob?.progress) };
}

export interface SaveOptions {
  /** Пауза перед записью после изменения, мс: частые правки склеиваются в одну запись. */
  debounceMs?: number;
}

/**
 * Сохранение настроек и прогресса через платформу. Изменения записываются с задержкой,
 * итог уровня и уход в фон — сразу (`flush`).
 */
export class SaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    private readonly platform: Platform,
    private readonly settings: SettingsStore,
    private readonly progress: ProgressStore,
    private readonly opts: SaveOptions = {},
  ) {}

  /** Загружает сохранение и подписывается на изменения. */
  async start(): Promise<void> {
    const loaded = parseSave(await this.platform.loadData().catch(() => null));
    this.settings.replace(loaded.settings);
    this.progress.merge(loaded.progress);
    this.settings.subscribe(() => this.schedule());
    this.progress.subscribe(() => this.schedule());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void this.flush();
      });
    }
  }

  private schedule(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => void this.flush(), this.opts.debounceMs ?? 1000);
  }

  /** Записывает несохранённые изменения немедленно. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    const blob: SaveBlob = {
      v: SAVE_VERSION,
      settings: { ...this.settings.get() },
      progress: this.progress.toJSON(),
    };
    try {
      await this.platform.saveData(blob, true);
    } catch (e) {
      this.dirty = true;
      console.warn('save failed', e);
    }
  }
}
