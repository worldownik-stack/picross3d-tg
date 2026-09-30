import { describe, expect, it } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import {
  applyEdits,
  cleanup,
  crop,
  fillFractions,
  gridFor,
  rotatePositions,
  voxelize,
} from '../../tools/voxel/voxelize';
import {
  figurePalette,
  hexToRgb,
  Palette,
  reduceColors,
  rgbToHex,
  GAME_PALETTE,
} from '../../tools/voxel/palette';
import { decodeImage, sampleImage } from '../../tools/voxel/image';
import { loadGlbSoup } from '../../tools/voxel/mesh';
import { mulberry32 } from '../../src/core/rng';
import { boxMesh, merge, sphereMesh, toSoup, twoToneTexture } from './meshes';

const RED = [200, 55, 59];
const GREEN = [79, 154, 62];

describe('сетка и нормализация', () => {
  it('длинная сторона = maxSize, тонкая — не меньше 2', () => {
    const s = toSoup(sphereMesh([0, 0, 0], 1));
    expect(gridFor(s.positions, 6).size).toEqual([6, 6, 6]);
    const flat = toSoup(boxMesh([0, 0, 0], [10, 0.1, 5]));
    expect(gridFor(flat.positions, 8).size).toEqual([8, 2, 4]);
  });

  it('поворот вокруг Y переносит длинную ось X в Z', () => {
    const bar = toSoup(boxMesh([-4, 0, -0.5], [4, 1, 0.5]));
    const rotated = rotatePositions(bar.positions, [0, 90, 0]);
    // Тонкие стороны (1 ячейка) растягиваются до двух.
    expect(gridFor(rotated, 8).size).toEqual([2, 2, 8]);
    expect(gridFor(bar.positions, 8).size).toEqual([8, 2, 2]);
  });
});

describe('заполнение (голосование лучей)', () => {
  it('куб по сетке заполнен полностью', () => {
    const s = toSoup(boxMesh([0, 0, 0], [4, 4, 4]));
    const g = gridFor(s.positions, 4);
    const f = fillFractions(s, s.positions, g, 4);
    expect(Math.min(...f)).toBe(1);
  });

  it('шар: доля заполнения ≈ π/6', () => {
    const s = toSoup(sphereMesh([0, 0, 0], 1, 48, 32));
    const r = voxelize(s, { maxSize: 10 });
    const ratio = r.stats.filled / (r.size[0] * r.size[1] * r.size[2]);
    expect(ratio).toBeGreaterThan(0.46);
    expect(ratio).toBeLessThan(0.6);
  });

  it('дырявый меш (−8 % треугольников) почти не меняет результат', () => {
    const whole = sphereMesh([0, 0, 0], 1, 48, 32);
    const rng = mulberry32(5);
    const holed = { ...whole, indices: [] as number[] };
    for (let t = 0; t < whole.indices.length; t += 3) {
      if (rng() > 0.08) holed.indices.push(...whole.indices.slice(t, t + 3));
    }
    const a = voxelize(toSoup(whole), { maxSize: 8 });
    const b = voxelize(toSoup(holed), { maxSize: 8 });
    expect(b.size).toEqual(a.size);
    let diff = 0;
    for (let i = 0; i < a.cells.length; i++) if (!!a.cells[i] !== !!b.cells[i]) diff++;
    expect(diff / a.cells.length).toBeLessThan(0.03);
  });

  it('порог: выше порог — меньше кубов', () => {
    const s = toSoup(sphereMesh([0, 0, 0], 1, 48, 32));
    const lo = voxelize(s, { maxSize: 8, threshold: 0.2 });
    const hi = voxelize(s, { maxSize: 8, threshold: 0.8 });
    expect(hi.stats.filled).toBeLessThan(lo.stats.filled);
  });
});

describe('цвет', () => {
  it('текстура: верх красный, низ зелёный', () => {
    const s = toSoup(sphereMesh([0, 0, 0], 1, 48, 32), twoToneTexture(RED, GREEN));
    const r = voxelize(s, { maxSize: 8 });
    expect([...r.palette].sort()).toEqual(['#4f9a3e', '#c8373b']);
    const [X, Y] = r.size;
    const at = (x: number, y: number, z: number) => r.palette[r.cells[x + X * (y + Y * z)]! - 1];
    const mid = Math.floor(X / 2);
    expect(at(mid, Y - 1, mid)).toBe('#c8373b');
    expect(at(mid, 0, mid)).toBe('#4f9a3e');
    // Внутренние ячейки тоже окрашены.
    for (let i = 0; i < r.cells.length; i++) if (r.cells[i]) expect(r.cells[i]).toBeGreaterThan(0);
  });

  it('baseColorFactor без текстуры', () => {
    const s = toSoup(boxMesh([0, 0, 0], [3, 3, 3]), null, [0.31, 0.53, 0.78, 1]);
    const r = voxelize(s, { maxSize: 3 });
    expect(r.palette).toEqual(['#4f86c6']);
  });

  it('палитра: ближайший цвет, OKLab, сведение к N цветам', () => {
    const p = new Palette();
    expect(p.hex[p.nearest(hexToRgb('#ff0000'))]).toMatch(/^#(c8373b|e0604a)$/);
    expect(rgbToHex(hexToRgb('#4f86c6'))).toBe('#4f86c6');
    expect(GAME_PALETTE.length).toBeGreaterThanOrEqual(30);
    const cells = Uint8Array.from([1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 0]);
    reduceColors(cells, p, 6);
    expect(new Set([...cells].filter(Boolean)).size).toBe(6);
    expect(cells[11]).toBe(0);
  });

  it('декодер PNG и билинейная выборка с повтором', () => {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const img = decodeImage(new Uint8Array(PNG.sync.write(png)), 'image/png');
    expect(img.width).toBe(2);
    expect(sampleImage(img, 0.25, 0.5)[0]).toBeCloseTo(1);
    expect(sampleImage(img, 1.75, 0.5)[2]).toBeCloseTo(1);
    // У края соседний тексель зажимается, а не берётся с противоположной стороны.
    expect(sampleImage(img, 0.01, 0.5)[0]).toBeCloseTo(1);
    expect(() => decodeImage(Uint8Array.from([1, 2, 3]), 'image/gif')).toThrow();
  });
});

describe('чистка и правки', () => {
  it('одиночные воксели удаляются, дыры в одну ячейку заполняются', () => {
    const size: [number, number, number] = [5, 5, 5];
    const f = new Uint8Array(125);
    for (let z = 1; z <= 3; z++)
      for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) f[x + 5 * (y + 5 * z)] = 1;
    f[2 + 5 * (2 + 5 * 2)] = 0; // дыра в центре
    f[0] = 1; // одиночный
    const r = cleanup(f, size);
    expect(r).toEqual({ removed: 1, holes: 1 });
    expect(f[0]).toBe(0);
    expect(f[2 + 5 * (2 + 5 * 2)]).toBe(1);
  });

  it('обрезка пустых слоёв и ручные правки', () => {
    const size: [number, number, number] = [4, 4, 4];
    const cells = new Uint8Array(64);
    cells[1 + 4 * (1 + 4 * 1)] = 2;
    const c = crop(cells, size);
    expect(c.size).toEqual([1, 1, 1]);
    expect(c.offset).toEqual([1, 1, 1]);
    const p = new Palette();
    const grid = new Uint8Array(27);
    grid[0] = 3;
    applyEdits(
      grid,
      [3, 3, 3],
      {
        add: [
          { min: [1, 0, 0], max: [1, 0, 0] },
          { min: [2, 2, 2], max: [2, 2, 2], color: '#4f86c6' },
        ],
      },
      p,
    );
    expect(grid[1]).toBe(3); // цвет соседа
    expect(grid[26]).toBe(p.hex.indexOf('#4f86c6') + 1);
    applyEdits(grid, [3, 3, 3], { remove: [{ min: [0, 0, 0], max: [2, 0, 0] }] }, p);
    expect(grid[0]).toBe(0);
    expect(() =>
      applyEdits(
        grid,
        [3, 3, 3],
        { add: [{ min: [0, 0, 0], max: [0, 0, 0], color: '#123456' }] },
        p,
      ),
    ).toThrow();
    expect(() => crop(new Uint8Array(8), [2, 2, 2])).toThrow();
  });

  it('правки из manifest применяются к итоговой сетке', () => {
    const s = toSoup(boxMesh([0, 0, 0], [3, 3, 3]), null, [0.31, 0.53, 0.78, 1]);
    const r = voxelize(s, { maxSize: 3, edits: { remove: [{ min: [0, 2, 0], max: [2, 2, 2] }] } });
    expect(r.size).toEqual([3, 2, 3]);
  });

  it('добавления за пределами сетки расширяют её (черешок сверху, деталь слева)', () => {
    const p = new Palette();
    const red = p.hex.indexOf('#c8373b') + 1;
    const brown = p.hex.indexOf('#8b5a2b') + 1;
    const grid = new Uint8Array(8).fill(red);
    const r = applyEdits(
      grid,
      [2, 2, 2],
      {
        remove: [{ min: [1, 1, 1], max: [1, 1, 1] }],
        add: [
          { min: [0, 2, 0], max: [0, 2, 0], color: '#8b5a2b' },
          { min: [-1, 0, 0], max: [-1, 0, 0] },
        ],
      },
      p,
    );
    expect(r.size).toEqual([3, 3, 2]);
    const at = (x: number, y: number, z: number) => r.cells[x + 3 * (y + 3 * z)];
    // Старая сетка сдвинута на +1 по X; удаление — в исходных координатах.
    expect(at(1, 0, 0)).toBe(red);
    expect(at(2, 1, 1)).toBe(0);
    expect(at(1, 2, 0)).toBe(brown);
    expect(at(0, 0, 0)).toBe(red); // цвет соседа
    expect(at(0, 1, 0)).toBe(0);
  });

  it('палитра фигуры — подмножество палитры игры', () => {
    const sphere = merge(sphereMesh([0, 0, 0], 1, 24, 16));
    // Оранжевый между двумя оранжевыми палитры: вся палитра даёт один, подмножество — другой.
    const s = toSoup(sphere, null, [0.87, 0.42, 0.2, 1]);
    const all = voxelize(s, { maxSize: 4 });
    const only = voxelize(s, { maxSize: 4, palette: figurePalette(['#f08a3c', '#f7f3ea']) });
    expect(all.palette).not.toEqual(['#f08a3c']);
    expect(only.palette).toEqual(['#f08a3c']);
    expect(() => figurePalette(['#123456'])).toThrow();
    expect(() => figurePalette([])).toThrow();
  });

  it('paint перекрашивает только заполненные кубы', () => {
    const p = new Palette();
    const red = p.hex.indexOf('#c8373b') + 1;
    const blue = p.hex.indexOf('#4f86c6') + 1;
    const grid = new Uint8Array(8);
    grid[0] = red;
    grid[7] = red;
    const r = applyEdits(
      grid,
      [2, 2, 2],
      { paint: [{ min: [0, 0, 0], max: [1, 1, 1], color: '#4f86c6' }] },
      p,
    );
    expect(r.cells.filter((c) => c === blue)).toHaveLength(2);
    expect(r.cells.filter((c) => c === 0)).toHaveLength(6);
    expect(() =>
      applyEdits(grid, [2, 2, 2], { paint: [{ min: [0, 0, 0], max: [0, 0, 0] }] }, p),
    ).toThrow();
  });

  it('тонкая оболочка без объёма заполняется только с shell', () => {
    // Плоский квадрат 4×4: объёма нет, чётность лучей его не видит.
    const quad = {
      positions: [0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4],
      uvs: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      indices: [0, 2, 1, 0, 3, 2],
    };
    const s = toSoup(quad, null, [0.31, 0.53, 0.78, 1]);
    expect(() => voxelize(s, { maxSize: 4 })).toThrow();
    const r = voxelize(s, { maxSize: 4, threshold: 0.2, shell: true });
    // Вся плоскость, включая края на дальних гранях рамки.
    expect(r.size).toEqual([4, 1, 4]);
    expect(r.stats.filled).toBe(16);
  });
});

describe('GLB → воксели', () => {
  it('сфера с PNG-текстурой и трансформацией узла', async () => {
    const doc = new Document();
    const buf = doc.createBuffer();
    const m = merge(sphereMesh([0, 0, 0], 1, 40, 24));
    const pos = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(Float32Array.from(m.positions))
      .setBuffer(buf);
    const uv = doc
      .createAccessor()
      .setType('VEC2')
      .setArray(Float32Array.from(m.uvs))
      .setBuffer(buf);
    const idx = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(Uint32Array.from(m.indices))
      .setBuffer(buf);
    const tex = twoToneTexture(RED, GREEN, 8);
    const png = new PNG({ width: 8, height: 8 });
    png.data.set(tex.data);
    const texture = doc
      .createTexture('tex')
      .setImage(new Uint8Array(PNG.sync.write(png)))
      .setMimeType('image/png');
    const mat = doc.createMaterial('m').setBaseColorTexture(texture);
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', pos)
      .setAttribute('TEXCOORD_0', uv)
      .setIndices(idx)
      .setMaterial(mat);
    const mesh = doc.createMesh('ball').addPrimitive(prim);
    const node = doc.createNode('n').setMesh(mesh).setTranslation([5, 2, -3]).setScale([2, 2, 2]);
    doc.createScene('s').addChild(node);
    const glb = await new NodeIO().writeBinary(doc);
    const soup = await loadGlbSoup(glb);
    expect(soup.positions[1]).toBeCloseTo(4); // y = 2 + 2·1 у полюса
    const r = voxelize(soup, { maxSize: 6 });
    expect(r.size).toEqual([6, 6, 6]);
    expect([...r.palette].sort()).toEqual(['#4f9a3e', '#c8373b']);
  });
});
