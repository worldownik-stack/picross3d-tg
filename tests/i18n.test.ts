import { describe, expect, it } from 'vitest';
import { i18nTables, resolveLang, setLang, t, tx } from '../src/i18n';

describe('i18n', () => {
  it('ru и en содержат одинаковые ключи и непустые строки', () => {
    const ru = Object.keys(i18nTables.ru).sort();
    const en = Object.keys(i18nTables.en).sort();
    expect(en).toEqual(ru);
    for (const table of [i18nTables.ru, i18nTables.en]) {
      for (const [k, v] of Object.entries(table)) expect(v.trim(), k).not.toBe('');
    }
  });

  it('плейсхолдеры совпадают между языками', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(i18nTables.ru) as Array<keyof typeof i18nTables.ru>) {
      expect(ph(i18nTables.en[key]), key).toEqual(ph(i18nTables.ru[key]));
    }
  });

  it('язык окружения: ru → ru, всё остальное → en', () => {
    expect(resolveLang('ru')).toBe('ru');
    expect(resolveLang('ru-RU')).toBe('ru');
    expect(resolveLang('en')).toBe('en');
    expect(resolveLang('tr')).toBe('en');
    expect(resolveLang('de')).toBe('en');
    expect(resolveLang('')).toBe('en');
    expect(resolveLang(undefined)).toBe('en');
  });

  it('подстановка параметров и тексты данных', () => {
    setLang('ru');
    expect(t('packs.progress', { solved: 3, total: 10 })).toBe('3 из 10');
    expect(tx({ ru: 'Кит', en: 'Whale' })).toBe('Кит');
    setLang('en');
    expect(t('packs.progress', { solved: 3, total: 10 })).toBe('3 of 10');
    expect(tx({ ru: 'Кит', en: 'Whale' })).toBe('Whale');
  });
});
