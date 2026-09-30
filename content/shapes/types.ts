import type { Sculpture } from '../../src/core/dsl';

/** Фигура, заданная вручную через DSL (§5.5). */
export interface ShapeDef {
  sculpture: Sculpture;
  /** Цвета палитры фигуры: индекс ячейки 1 → palette[0] и т. д. */
  palette: string[];
  /** Принудительно скрытые подсказки: ось целиком. */
  hideAxes?: Array<'x' | 'y' | 'z'>;
}
