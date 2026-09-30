import {
  box,
  cylinder,
  ellipsoid,
  intersect,
  Sculpture,
  sphere,
  subtract,
  union,
} from '../../src/core/dsl';
import type { ShapeDef } from './types';

/** Тестовые уровни 10×10×10 (фаза 1): нагрузка на решатель, рендер и UI. */

/** Шар с поясом. */
export function testBall(): ShapeDef {
  const s = new Sculpture([10, 10, 10]).add(sphere([4.5, 4.5, 4.5], 4.7), 1);
  s.paint(box([0, 4, 0], [9, 5, 9]), 2);
  return { sculpture: s, palette: ['#e8b04a', '#c8553d'] };
}

/** Ступенчатая пирамида с дверью. */
export function testPyramid(): ShapeDef {
  const s = new Sculpture([10, 10, 10]);
  for (let y = 0; y < 5; y++) s.add(box([y, y * 2, y], [9 - y, y * 2 + 1, 9 - y]), y % 2 ? 2 : 1);
  s.remove(box([4, 0, 0], [5, 2, 1]));
  return { sculpture: s, palette: ['#d9b77e', '#b98b4e'] };
}

/** Кружка с ручкой. */
export function testMug(): ShapeDef {
  const body = cylinder('y', [4, 4.5], 3.6, 0, 8);
  const hollow = cylinder('y', [4, 4.5], 2.4, 2, 8);
  const handle = subtract(
    intersect(cylinder('z', [7.6, 4.5], 2.4, 3, 6), box([8, 0, 0], [9, 9, 9])),
    cylinder('z', [7.6, 4.5], 1.2, 0, 9),
  );
  const s = new Sculpture([10, 10, 10]).add(union(subtract(body, hollow), handle), 1);
  s.paint(box([0, 7, 0], [9, 8, 9]), 2);
  return { sculpture: s, palette: ['#3b6fb6', '#f2efe6'] };
}

/** Бублик, лежащий плашмя. */
export function testDonut(): ShapeDef {
  const R = 3.2;
  const r = 1.7;
  const torus = (x: number, y: number, z: number) => {
    const dx = x - 4.5;
    const dz = z - 4.5;
    const q = Math.sqrt(dx * dx + dz * dz) - R;
    const dy = y - 2;
    return q * q + dy * dy <= r * r;
  };
  const s = new Sculpture([10, 10, 10]).add(torus, 1);
  s.paint((x, y, z) => torus(x, y, z) && y >= 3, 2);
  return { sculpture: s, palette: ['#d9a066', '#e78fb3'] };
}

/** Гриб. */
export function testMushroom(): ShapeDef {
  const s = new Sculpture([10, 10, 10])
    .add(cylinder('y', [4.5, 4.5], 1.8, 0, 5), 2)
    .add(intersect(ellipsoid([4.5, 5.5, 4.5], [4.9, 4, 4.9]), box([0, 5, 0], [9, 9, 9])), 1);
  s.paint(sphere([2, 8, 4.5], 1.1), 3);
  s.paint(sphere([7, 7.5, 2.5], 1.1), 3);
  return { sculpture: s, palette: ['#c8373b', '#efe4cf', '#fbf6ee'] };
}
