import { describe, expect, it } from 'vitest';
import { levelPuzzle, parseLevel, serializeLevel, type LevelJson } from '../../src/core/level';
import { Sculpture, sphere } from '../../src/core/dsl';
import { encodeRle } from '../../src/core/codec';
import { isLogicSolvable } from '../../src/core/solver';

function sample(): LevelJson {
  const cells = new Sculpture([5, 4, 3])
    .add(sphere([2, 1.5, 1], 1.8), 1)
    .paint(sphere([2, 3, 1], 1), 2)
    .cells();
  return {
    id: 'test_01',
    pack: 'test',
    title: { ru: 'Шар', en: 'Ball' },
    size: [5, 4, 3],
    ruleset: 'classic',
    cells: encodeRle(cells),
    palette: ['#ff0000', '#00ff00'],
    hidden: { x: '', y: 'AQA=', z: '' },
    difficulty: 2,
    targetTime: 60,
    anim: 'bob',
  };
}

describe('level format', () => {
  it('parse → serialize → parse без потерь', () => {
    const j = sample();
    const l = parseLevel(j);
    expect(l.size).toEqual([5, 4, 3]);
    expect(l.hidden.reduce((a, b) => a + b, 0)).toBe(1);
    expect(l.hidden[12]).toBe(1); // первая Y-линия: смещение Y·Z = 12
    const j2 = serializeLevel(l);
    expect(j2).toEqual(j);
    const withReveal = serializeLevel({ ...l, reveal: 'models/test_01.glb' });
    expect(parseLevel(withReveal).reveal).toBe('models/test_01.glb');
  });

  it('головоломка уровня: classic = cells > 0', () => {
    const p = levelPuzzle(parseLevel(sample()));
    expect(p.classes.every((c) => c <= 1)).toBe(true);
    expect(isLogicSolvable(p)).toBeTypeOf('boolean');
    expect(() => levelPuzzle({ ...parseLevel(sample()), ruleset: 'dual' })).toThrow();
  });

  it('валидация', () => {
    const bad = (patch: Partial<LevelJson>) => () => parseLevel({ ...sample(), ...patch });
    expect(bad({ id: '' })).toThrow();
    expect(bad({ size: [5, 4] as unknown as [number, number, number] })).toThrow();
    expect(bad({ size: [5, 4, 0] })).toThrow();
    expect(bad({ size: [5, 4, 99] })).toThrow();
    expect(bad({ ruleset: 'x' as 'classic' })).toThrow();
    expect(bad({ palette: [] })).toThrow();
    expect(bad({ anim: 'dance' as 'bob' })).toThrow();
    expect(bad({ palette: ['#fff'] })).toThrow(/palette index/);
    expect(bad({ cells: encodeRle(new Uint8Array(3)) })).toThrow();
  });
});
