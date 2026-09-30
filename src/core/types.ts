/** Общие типы ядра. Ядро — чистый TS без зависимостей от рендера и UI. */

export type Axis = 0 | 1 | 2;
export const AXES: readonly Axis[] = [0, 1, 2];
export const AXIS_NAMES = ['x', 'y', 'z'] as const;
export type AxisName = (typeof AXIS_NAMES)[number];

export type Size3 = readonly [number, number, number];

/** Текст на нескольких языках (en обязателен как запасной). */
export type LocalizedText = { en: string } & Partial<Record<'ru' | 'en' | 'tr', string>>;

/** Набор правил уровня: классика (Round 1) или двухцветный (задел под Round 2). */
export type Ruleset = 'classic' | 'dual';

/** Анимация «оживления» фигуры после победы. */
export type RevealAnim = 'bob' | 'spin' | 'hop' | 'wobble';
export const REVEAL_ANIMS: readonly RevealAnim[] = ['bob', 'spin', 'hop', 'wobble'];

/**
 * Знание о ячейке — битовое множество допустимых классов:
 * бит 0 — «пусто» (куб ломается), бит c ≥ 1 — «куб класса c остаётся».
 * В classic классов два, поэтому состояния — UNKNOWN / KEEP / BREAK.
 */
export const CONTRADICTION = 0;
export const BREAK = 0b01;
export const KEEP = 0b10;
export const UNKNOWN = 0b11;
export type CellKnowledge = number;
