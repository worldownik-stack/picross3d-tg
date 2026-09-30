import ru from './ru.json';
import en from './en.json';

export type Lang = 'ru' | 'en';
export type StringKey = keyof typeof ru;
export type LocalizedText = Partial<Record<Lang, string>> & { en: string };

const tables: Record<Lang, Record<StringKey, string>> = { ru, en };

/** Языки окружения, для которых показываем русский. Всё остальное — английский (§8). */
const RU_LANGS = new Set(['ru']);

let current: Lang = 'en';
const listeners = new Set<() => void>();

export function resolveLang(raw: string | null | undefined): Lang {
  const code = (raw ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return RU_LANGS.has(code) ? 'ru' : 'en';
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const cb of listeners) cb();
}

export function getLang(): Lang {
  return current;
}

export function onLangChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Строка интерфейса по ключу с подстановкой `{name}`. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s = tables[current][key] ?? tables.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** Текст из данных (например, название уровня) на текущем языке. */
export function tx(text: LocalizedText): string {
  return text[current] ?? text.en;
}

export const i18nTables = tables;
