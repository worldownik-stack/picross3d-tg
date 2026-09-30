import type { LocalizedText } from '../i18n';

/** Описание набора в индексе `levels/index.json`. */
export interface PackInfo {
  id: string;
  title: LocalizedText;
  /** Уровни набора по порядку. */
  levels: LevelInfo[];
  /** Сколько решённых в предыдущем наборе нужно для открытия (§4). */
  unlockAfter: number;
  /** Только для отладки (не показывается игроку). */
  debugOnly?: boolean;
}

export interface LevelInfo {
  id: string;
  title: LocalizedText;
  size: [number, number, number];
  difficulty: number;
}

export interface ContentIndex {
  version: number;
  packs: PackInfo[];
}

/**
 * Контент, встроенный в страницу (автономная сборка без сервера):
 * `<script id="embedded-levels" type="application/json">{index, packs}</script>`.
 */
export interface EmbeddedContent {
  index: ContentIndex;
  packs: Record<string, unknown>;
}

let embedded: EmbeddedContent | null | undefined;

export function embeddedContent(): EmbeddedContent | null {
  if (embedded === undefined) {
    const el = typeof document === 'undefined' ? null : document.getElementById('embedded-levels');
    embedded = el?.textContent ? (JSON.parse(el.textContent) as EmbeddedContent) : null;
  }
  return embedded;
}

/** Загружает индекс контента. Сами наборы грузятся лениво. */
export async function loadContentIndex(): Promise<ContentIndex> {
  const emb = embeddedContent();
  if (emb) return emb.index;
  const res = await fetch('./levels/index.json');
  if (!res.ok) throw new Error(`levels/index.json: ${res.status}`);
  return (await res.json()) as ContentIndex;
}
