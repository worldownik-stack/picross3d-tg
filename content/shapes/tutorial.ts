import { box, cell, fromLayers, Sculpture } from '../../src/core/dsl';
import type { ShapeDef } from './types';

/**
 * Обучение (§4): 5 маленьких фигур на сетке 3–5. Рисунки — слои снизу вверх,
 * в каждом слое строки идут от дальнего ряда (z = Z−1) к ближнему (z = 0).
 */

/** 1. Ступенька: ноль и полная линия. */
export function tutSteps(): ShapeDef {
  const s = fromLayers(
    [
      ['###', '###'],
      ['##.', '##.'],
      ['#..', '#..'],
    ],
    { '#': 1 },
  );
  s.paint(box([0, 0, 0], [2, 0, 1]), 2);
  return { sculpture: s, palette: ['#d19a5b', '#a8703f'] };
}

/** 2. Буква «Т»: обычные числа (подсказки вдоль глубины скрыты — работаем с рядами и столбцами). */
export function tutLetterT(): ShapeDef {
  const s = new Sculpture([5, 5, 1]).add(box([0, 4, 0], [4, 4, 0])).add(box([2, 0, 0], [2, 3, 0]));
  return { sculpture: s, palette: ['#2aa99b'], hideAxes: ['z'] };
}

/** 3. Стул: кисть. */
export function tutChair(): ShapeDef {
  const s = new Sculpture([3, 5, 3])
    // Ножки
    .add(cell(0, 0, 0), 2)
    .add(cell(2, 0, 0), 2)
    .add(cell(0, 0, 2), 2)
    .add(cell(2, 0, 2), 2)
    .add(cell(0, 1, 0), 2)
    .add(cell(2, 1, 0), 2)
    .add(cell(0, 1, 2), 2)
    .add(cell(2, 1, 2), 2)
    // Сиденье
    .add(box([0, 2, 0], [2, 2, 2]), 1)
    // Спинка
    .add(box([0, 3, 2], [2, 4, 2]), 1);
  return { sculpture: s, palette: ['#c0392b', '#7a4a2a'] };
}

/** 4. Стол: вращение и срезы. */
export function tutTable(): ShapeDef {
  const s = new Sculpture([5, 3, 4])
    .add(box([0, 2, 0], [4, 2, 3]), 1)
    .add(box([0, 0, 0], [0, 1, 0]), 2)
    .add(box([4, 0, 0], [4, 1, 0]), 2)
    .add(box([0, 0, 3], [0, 1, 3]), 2)
    .add(box([4, 0, 3], [4, 1, 3]), 2);
  return { sculpture: s, palette: ['#c98b52', '#8a5a33'] };
}

/** 5. Домик: кружки и квадраты. */
export function tutHouse(): ShapeDef {
  const s = new Sculpture([5, 5, 4])
    .add(box([0, 0, 0], [4, 2, 3]), 1) // стены
    .add(box([0, 3, 0], [4, 3, 3]), 2) // крыша
    .add(box([1, 4, 0], [3, 4, 3]), 2)
    .remove(box([1, 0, 0], [1, 1, 0])) // дверь
    .add(cell(4, 4, 2), 3) // труба
    .remove(cell(3, 1, 0)) // окно
    .remove(cell(3, 1, 3)); // окно сзади
  s.paint(box([0, 0, 0], [4, 0, 3]), 4);
  return { sculpture: s, palette: ['#f6d49b', '#c8553d', '#7d5a45', '#a8876a'] };
}
