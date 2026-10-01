import type { SaveBlob } from '../platform';

type Writer = (blob: SaveBlob, flush: boolean) => Promise<void>;

/**
 * Сохранение игрока целиком (§8): разделы (`progress`, `settings`, …) пишутся по отдельности,
 * но на платформу уходит весь объект — разделы не затирают друг друга. Незнакомые ключи
 * (из будущих версий) сохраняются как есть.
 */
export class SaveStore {
  private data: SaveBlob = {};

  constructor(private readonly write?: Writer) {}

  load(blob: SaveBlob | null): void {
    this.data = blob && typeof blob === 'object' && !Array.isArray(blob) ? { ...blob } : {};
  }

  get(key: string): unknown {
    return this.data[key];
  }

  /** Обновить раздел и сохранить; `flush` — в логических точках (победа, сброс). */
  set(key: string, value: unknown, flush: boolean): void {
    this.data = { ...this.data, [key]: value };
    this.write?.(this.data, flush).catch((e: unknown) => console.error('save failed', e));
  }

  snapshot(): SaveBlob {
    return { ...this.data };
  }
}
