import type { RgbaImage, TriangleSoup } from '../../tools/voxel/types';

/** Синтетические меши для тестов вокселизатора. */
export interface RawMesh {
  positions: number[];
  uvs: number[];
  indices: number[];
}

export function boxMesh(min: number[], max: number[]): RawMesh {
  const [x0, y0, z0] = min as [number, number, number];
  const [x1, y1, z1] = max as [number, number, number];
  const v = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const f = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [3, 7, 6],
    [3, 6, 2],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
  ];
  return { positions: v.flat(), uvs: v.map(() => [0.5, 0.5]).flat(), indices: f.flat() };
}

/** UV-сфера: u — долгота, v — от 0 (верх) до 1 (низ). */
export function sphereMesh(c: number[], r: number, seg = 32, rings = 20): RawMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const th = v * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const ph = u * Math.PI * 2;
      positions.push(
        c[0]! + r * Math.sin(th) * Math.cos(ph),
        c[1]! + r * Math.cos(th),
        c[2]! + r * Math.sin(th) * Math.sin(ph),
      );
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { positions, uvs, indices };
}

export function merge(...ms: RawMesh[]): RawMesh {
  const out: RawMesh = { positions: [], uvs: [], indices: [] };
  for (const m of ms) {
    const base = out.positions.length / 3;
    out.positions.push(...m.positions);
    out.uvs.push(...m.uvs);
    out.indices.push(...m.indices.map((i) => i + base));
  }
  return out;
}

/** Текстура: верхняя половина (v < 0.5) — top, нижняя — bottom. */
export function twoToneTexture(top: number[], bottom: number[], size = 16): RgbaImage {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = y < size / 2 ? top : bottom;
      data.set([c[0]!, c[1]!, c[2]!, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

export function toSoup(
  m: RawMesh,
  texture: RgbaImage | null = null,
  factor = [1, 1, 1, 1],
): TriangleSoup {
  return {
    positions: Float32Array.from(m.positions),
    uvs: Float32Array.from(m.uvs),
    colors: null,
    indices: Uint32Array.from(m.indices),
    triMaterial: new Uint16Array(m.indices.length / 3),
    materials: [{ factor: factor as [number, number, number, number], texture }],
  };
}
