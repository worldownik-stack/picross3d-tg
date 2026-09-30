import { describe, expect, it } from 'vitest';
import {
  box,
  cell,
  cylinder,
  ellipsoid,
  fromLayers,
  intersect,
  Sculpture,
  sphere,
  subtract,
  union,
} from '../../src/core/dsl';

describe('DSL', () => {
  it('box, remove, paint, count', () => {
    const s = new Sculpture([4, 3, 2]).add(box([0, 0, 0], [3, 0, 1]), 2);
    expect(s.count()).toBe(8);
    s.remove(box([0, 0, 0], [0, 0, 1]));
    expect(s.count()).toBe(6);
    s.paint(box([3, 0, 0], [3, 2, 1]), 5);
    expect(s.get(3, 0, 0)).toBe(5);
    expect(s.get(3, 1, 0)).toBe(0); // paint не добавляет кубы
    expect(s.get(9, 0, 0)).toBe(0);
  });

  it('sphere, ellipsoid, cylinder по трём осям', () => {
    expect(new Sculpture([5, 5, 5]).add(sphere([2, 2, 2], 1)).count()).toBe(7);
    expect(new Sculpture([5, 5, 5]).add(ellipsoid([2, 2, 2], [2, 0.5, 0.5])).count()).toBe(5);
    expect(new Sculpture([5, 5, 5]).add(cylinder('y', [2, 2], 1, 0, 4)).count()).toBe(25);
    expect(new Sculpture([5, 5, 5]).add(cylinder(0, [2, 2], 0, 1, 3)).count()).toBe(3);
    const z = new Sculpture([5, 5, 5]).add(cylinder('z', [1, 3], 0, 0, 4));
    expect(z.get(1, 3, 0) && z.get(1, 3, 4)).toBeTruthy();
    expect(z.count()).toBe(5);
  });

  it('mirrorX и комбинаторы областей', () => {
    const s = new Sculpture([5, 1, 1])
      .add(cell(0, 0, 0))
      .add(cell(1, 0, 0), 3)
      .mirrorX();
    expect(Array.from(s.cells())).toEqual([1, 3, 0, 3, 1]);
    const u = union(cell(0, 0, 0), cell(1, 0, 0));
    const i = intersect(box([0, 0, 0], [1, 0, 0]), cell(1, 0, 0));
    const d = subtract(box([0, 0, 0], [2, 0, 0]), cell(1, 0, 0));
    expect([u(1, 0, 0), u(2, 0, 0), i(0, 0, 0), i(1, 0, 0), d(1, 0, 0), d(2, 0, 0)]).toEqual([
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
  });

  it('fromLayers: слои снизу вверх, дальний ряд сверху', () => {
    const s = fromLayers(
      [
        ['ab', '..'],
        ['.a', 'a.'],
      ],
      { a: 1, b: 2 },
    );
    expect(s.size).toEqual([2, 2, 2]);
    expect(s.get(0, 0, 1)).toBe(1);
    expect(s.get(1, 0, 1)).toBe(2);
    expect(s.get(0, 0, 0)).toBe(0);
    expect(s.get(1, 1, 1)).toBe(1);
    expect(s.get(0, 1, 0)).toBe(1);
    expect(() => fromLayers([['ab', 'a']], { a: 1, b: 2 })).toThrow();
    expect(() => fromLayers([['ab'], ['ab', 'ab']], { a: 1, b: 2 })).toThrow();
    expect(() => fromLayers([['ax']], { a: 1 })).toThrow(/unknown/);
  });
});
