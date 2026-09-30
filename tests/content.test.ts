import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildContent, type Manifest, type VoxelFile } from '../content/build';
import { MAX_PROMPT, previewPrompt, texturePrompt } from '../content/meshy';
import { encodeRle } from '../src/core/codec';
import { levelPuzzle, parseLevel } from '../src/core/level';
import { isLogicSolvable } from '../src/core/solver';
import { voxelize } from '../tools/voxel/voxelize';
import { sphereMesh, toSoup, twoToneTexture } from './voxel/meshes';

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as Manifest;

describe('manifest: объекты Приложения А', () => {
  const meshy = manifest.packs.flatMap((p) => p.levels.filter((l) => l.source.kind === 'meshy'));
  // Объект Приложения А делается в Meshy или вручную в MagicaVoxel.
  const isObject = (k: string) => k === 'meshy' || k === 'vox';
  const objects = manifest.packs.flatMap((p) => p.levels.filter((l) => isObject(l.source.kind)));

  it('10 наборов по 10 уровней, id по префиксу набора, сетки заданы', () => {
    const packs = manifest.packs.filter((p) => p.levels.some((l) => isObject(l.source.kind)));
    expect(packs).toHaveLength(10);
    for (const p of packs) {
      expect(p.levels).toHaveLength(10);
      expect(p.maxSize).toBeGreaterThanOrEqual(5);
      p.levels.forEach((l, k) => expect(l.id).toBe(`${p.id}_${String(k + 1).padStart(2, '0')}`));
    }
    expect(objects).toHaveLength(100);
    expect(manifest.reserve?.length).toBe(15);
  });

  it('промты на английском и не длиннее 800 символов', () => {
    const all = [
      ...meshy.map((l) => l.source),
      ...(manifest.reserve ?? []).map((r) => ({ kind: 'meshy', ...r })),
    ];
    for (const s of all) {
      if (s.kind !== 'meshy') continue;
      const a = previewPrompt(s.object);
      const b = texturePrompt(s.colors);
      for (const p of [a, b]) {
        expect(p.length).toBeLessThanOrEqual(MAX_PROMPT);
        expect(p).toMatch(/^[\x20-\x7e]+$/);
      }
      expect(a).toContain(s.object);
    }
    expect(() => previewPrompt('x'.repeat(800))).toThrow();
    expect(() => texturePrompt('x'.repeat(800))).toThrow();
  });
});

describe('сборка уровня из вокселей', () => {
  it('воксели → решаемый уровень; без вокселей — пропуск', () => {
    const r = voxelize(
      toSoup(sphereMesh([0, 0, 0], 1, 40, 24), twoToneTexture([200, 55, 59], [79, 154, 62])),
      {
        maxSize: 6,
      },
    );
    const vox: VoxelFile = {
      id: 'food_01',
      size: r.size,
      palette: r.palette,
      cells: encodeRle(r.cells),
    };
    const one: Manifest = {
      version: 1,
      packs: [
        {
          ...manifest.packs.find((p) => p.id === 'food')!,
          levels: manifest.packs.find((p) => p.id === 'food')!.levels.slice(0, 2),
        },
      ],
    };
    const built = buildContent(one, { voxels: { food_01: vox } });
    expect(built.skipped).toEqual(['food_02']);
    expect(built.levels).toHaveLength(1);
    const lvl = parseLevel(built.packs[0]!.levels[0]!);
    expect(lvl.size).toEqual([6, 6, 6]);
    expect(lvl.palette).toEqual(r.palette);
    expect(isLogicSolvable(levelPuzzle(lvl))).toBe(true);
    expect(built.index.packs[0]!.levels.map((l) => l.id)).toEqual(['food_01']);
  });
});
