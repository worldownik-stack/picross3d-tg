import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildContent,
  stringifyIndex,
  stringifyPack,
  type Manifest,
  type VoxelFile,
} from '../content/build';
import { levelPuzzle, parseLevel, type PackJson } from '../src/core/level';
import { GameSession } from '../src/core/game';
import { botPlay } from '../src/core/bot';
import { isLogicSolvable } from '../src/core/solver';

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as Manifest;
const voxels: Record<string, VoxelFile> = {};
for (const f of readdirSync('content/voxels').filter((f) => f.endsWith('.json'))) {
  const v = JSON.parse(readFileSync(`content/voxels/${f}`, 'utf8')) as VoxelFile;
  voxels[v.id] = v;
}
const files = readdirSync('public/levels').filter((f) => f.endsWith('.json') && f !== 'index.json');
const packs = files.map((f) => JSON.parse(readFileSync(`public/levels/${f}`, 'utf8')) as PackJson);
const levels = packs.flatMap((p) => p.levels.map(parseLevel));

describe('уровни', () => {
  it('public/levels совпадает со сборкой из manifest (детерминизм, актуальность)', () => {
    const a = buildContent(manifest, { voxels });
    const b = buildContent(manifest, { voxels });
    for (let i = 0; i < a.packs.length; i++) {
      expect(stringifyPack(a.packs[i]!)).toBe(stringifyPack(b.packs[i]!));
      const p = a.packs[i]!;
      if (!p.levels.length) continue;
      expect(readFileSync(`public/levels/${p.pack}.json`, 'utf8'), 'запустите npm run levels').toBe(
        stringifyPack(p),
      );
    }
    expect(readFileSync('public/levels/index.json', 'utf8')).toBe(stringifyIndex(a.index));
  });

  it('обучение: 5 уровней; кружки и квадраты впервые в 5-м', () => {
    const tut = levels.filter((l) => l.pack === 'tut');
    expect(tut.map((l) => l.id)).toEqual(['tut_01', 'tut_02', 'tut_03', 'tut_04', 'tut_05']);
    tut.forEach((l, k) => {
      for (const s of l.size) expect(s).toBeGreaterThanOrEqual(1);
      expect(Math.max(...l.size)).toBeLessThanOrEqual(5);
      const p = levelPuzzle(l);
      const special = p.clues.filter((c, g) => !p.hidden[g] && c.parts[0]!.groups > 1);
      if (k < 4) expect(special, l.id).toHaveLength(0);
      else {
        expect(special.some((c) => c.parts[0]!.groups === 2)).toBe(true);
        expect(special.some((c) => c.parts[0]!.groups === 3)).toBe(true);
      }
    });
  });

  it('5 тестовых уровней 10×10×10', () => {
    const test = levels.filter((l) => l.pack === 'test');
    expect(test).toHaveLength(5);
    for (const l of test) expect(l.size).toEqual([10, 10, 10]);
  });

  // §5.4: бот проходит каждый уровень через игровой API без промахов.
  for (const level of levels) {
    it(`бот проходит ${level.id} без промахов`, () => {
      const p = levelPuzzle(level);
      expect(isLogicSolvable(p)).toBe(true);
      const session = new GameSession(p, level.id, level.targetTime);
      const report = botPlay(session);
      expect(report.mistakes).toBe(0);
      expect(report.won).toBe(true);
      expect(session.stars()).toBe(3);
    });
  }
});
