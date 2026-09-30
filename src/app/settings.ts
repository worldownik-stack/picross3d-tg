export interface Settings {
  music: boolean;
  sound: boolean;
  vibration: boolean;
  lineHighlight: boolean;
  dimCompleted: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  music: true,
  sound: true,
  vibration: true,
  lineHighlight: true,
  dimCompleted: true,
};

/** Раздел настроек в сохранении (`SaveStore`). */
export const SETTINGS_KEY = 'settings';

export type SettingsListener = (s: Readonly<Settings>, key: keyof Settings | null) => void;

/** Настройки игрока; хранятся в разделе `settings` сохранения. */
export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(initial?: Partial<Settings>) {
    this.value = { ...DEFAULT_SETTINGS, ...initial };
  }

  get(): Readonly<Settings> {
    return this.value;
  }

  set<K extends keyof Settings>(key: K, v: Settings[K]): void {
    if (this.value[key] === v) return;
    this.value = { ...this.value, [key]: v };
    for (const cb of this.listeners) cb(this.value, key);
  }

  /** Применить сохранённые настройки: берутся только известные ключи с булевыми значениями. */
  loadSaved(saved: unknown): void {
    if (!saved || typeof saved !== 'object') return;
    const next: Partial<Settings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      const v = (saved as Record<string, unknown>)[key];
      if (typeof v === 'boolean') next[key] = v;
    }
    this.value = { ...DEFAULT_SETTINGS, ...next };
  }

  replace(next: Partial<Settings>): void {
    this.value = { ...DEFAULT_SETTINGS, ...next };
    for (const cb of this.listeners) cb(this.value, null);
  }

  subscribe(cb: SettingsListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
