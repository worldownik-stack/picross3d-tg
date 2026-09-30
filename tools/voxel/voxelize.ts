import { sampleImage } from './image';
import { Palette, reduceColors } from './palette';
import type { Rgb, TriangleSoup } from './types';

export interface VoxelizeOptions {
  /** Длинная сторона сетки (§6.2). */
  maxSize: number;
  /** Доля «внутренних» выборок для заполнения ячейки, по умолчанию 0,4. */
  threshold?: number;
  /** Поворот модели (градусы, XYZ), чтобы «лицо» смотрело в +Z. */
  rotation?: [number, number, number];
  /** Выборок на ячейку по оси (4 → 4×4×4). */
  samples?: number;
  /**
   * Тонкие оболочки: выборки, через которые проходит поверхность, тоже заполнены. Для
   * предметов без объёма (абажур, зонт, стенки кружки), иначе они пропадают.
   */
  shell?: boolean;
  maxColors?: number;
  palette?: Palette;
  edits?: VoxelEdits;
}

export interface VoxelBox {
  min: [number, number, number];
  max: [number, number, number];
  /** Цвет для add (hex из палитры игры); по умолчанию — ближайший соседний. */
  color?: string;
}

export interface VoxelEdits {
  add?: VoxelBox[];
  remove?: VoxelBox[];
  /** Перекрасить только заполненные кубы коробки (цвет обязателен); после add. */
  paint?: VoxelBox[];
}

export interface VoxelResult {
  size: [number, number, number];
  /** Индекс цвета фигуры (1..k), 0 — пусто. */
  cells: Uint8Array;
  /** Цвета фигуры (hex), по частоте. */
  palette: string[];
  /** Доля заполнения каждой ячейки до порога (для отладки). */
  stats: { filled: number; removedIsolated: number; filledHoles: number };
}

const DEG = Math.PI / 180;

/** Поворот вершин (Эйлер XYZ, градусы). Возвращает новый массив. */
export function rotatePositions(pos: Float32Array, rot: [number, number, number]): Float32Array {
  const [ax, ay, az] = rot.map((d) => d * DEG) as [number, number, number];
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i]!;
    let y = pos[i + 1]!;
    let z = pos[i + 2]!;
    // X
    let t = y * cx - z * sx;
    z = y * sx + z * cx;
    y = t;
    // Y
    t = x * cy + z * sy;
    z = -x * sy + z * cy;
    x = t;
    // Z
    t = x * cz - y * sz;
    y = x * sz + y * cz;
    x = t;
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  }
  return out;
}

interface GridSpec {
  size: [number, number, number];
  origin: [number, number, number];
  cell: [number, number, number];
}

/** Сетка: длинная сторона = maxSize, кубические ячейки; тонкая сторона — не меньше 2 (§6.2). */
export function gridFor(pos: Float32Array, maxSize: number): GridSpec {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a]!, pos[i + a]!);
      max[a] = Math.max(max[a]!, pos[i + a]!);
    }
  }
  const ext = [0, 1, 2].map((a) => max[a]! - min[a]!);
  const long = Math.max(...ext);
  if (!(long > 0)) throw new Error('degenerate mesh');
  const s = long / maxSize;
  const size = [0, 0, 0] as [number, number, number];
  const cell = [s, s, s] as [number, number, number];
  const origin = [0, 0, 0] as [number, number, number];
  for (let a = 0; a < 3; a++) {
    let n = Math.max(1, Math.min(maxSize, Math.round(ext[a]! / s)));
    if (n < 2) {
      n = 2;
      cell[a] = Math.max(ext[a]!, s * 0.5) / 2; // растягиваем тонкую ось до двух ячеек
    }
    size[a] = n;
    const center = (min[a]! + max[a]!) / 2;
    origin[a] = center - (n * cell[a]!) / 2;
  }
  return { size, origin, cell };
}

/**
 * Заполнение: в каждой ячейке S×S×S выборок «точка внутри меша». Для каждой оси
 * через выборки проводятся лучи, считается чётность пересечений; точка внутри,
 * если так считают хотя бы две оси из трёх (устойчиво к дыркам в меше).
 * С `shell` выборки, через которые проходит поверхность, тоже считаются заполненными.
 */
export function fillFractions(
  soup: TriangleSoup,
  pos: Float32Array,
  g: GridSpec,
  S: number,
  shell = false,
): Float32Array {
  const N = [g.size[0] * S, g.size[1] * S, g.size[2] * S];
  const votes = new Uint8Array(N[0]! * N[1]! * N[2]!);
  const step = [g.cell[0] / S, g.cell[1] / S, g.cell[2] / S];
  const sidx = (x: number, y: number, z: number) => x + N[0]! * (y + N[1]! * z);
  const tri = soup.indices;
  for (let A = 0; A < 3; A++) {
    const B = (A + 1) % 3;
    const C = (A + 2) % 3;
    const nb = N[B]!;
    const nc = N[C]!;
    const lines: Array<number[] | undefined> = new Array(nb * nc);
    // Смещение от точных позиций, чтобы лучи не шли через вершины и рёбра.
    const jb = step[B]! * 1.37e-4;
    const jc = step[C]! * 2.71e-4;
    for (let t = 0; t < tri.length; t += 3) {
      const i0 = tri[t]! * 3;
      const i1 = tri[t + 1]! * 3;
      const i2 = tri[t + 2]! * 3;
      const b0 = pos[i0 + B]!;
      const c0 = pos[i0 + C]!;
      const b1 = pos[i1 + B]!;
      const c1 = pos[i1 + C]!;
      const b2 = pos[i2 + B]!;
      const c2 = pos[i2 + C]!;
      const d = (b1 - b0) * (c2 - c0) - (b2 - b0) * (c1 - c0);
      if (Math.abs(d) < 1e-14) continue;
      const bmin = Math.min(b0, b1, b2);
      const bmax = Math.max(b0, b1, b2);
      const cmin = Math.min(c0, c1, c2);
      const cmax = Math.max(c0, c1, c2);
      const ib0 = Math.max(0, Math.ceil((bmin - g.origin[B]!) / step[B]! - 0.5));
      const ib1 = Math.min(nb - 1, Math.floor((bmax - g.origin[B]!) / step[B]! - 0.5));
      const ic0 = Math.max(0, Math.ceil((cmin - g.origin[C]!) / step[C]! - 0.5));
      const ic1 = Math.min(nc - 1, Math.floor((cmax - g.origin[C]!) / step[C]! - 0.5));
      for (let ib = ib0; ib <= ib1; ib++) {
        const b = g.origin[B]! + (ib + 0.5) * step[B]! + jb;
        for (let ic = ic0; ic <= ic1; ic++) {
          const c = g.origin[C]! + (ic + 0.5) * step[C]! + jc;
          const w1 = ((b - b0) * (c2 - c0) - (b2 - b0) * (c - c0)) / d;
          const w2 = ((b1 - b0) * (c - c0) - (b - b0) * (c1 - c0)) / d;
          const w0 = 1 - w1 - w2;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const a = w0 * pos[i0 + A]! + w1 * pos[i1 + A]! + w2 * pos[i2 + A]!;
          const li = ib + nb * ic;
          (lines[li] ??= []).push(a);
        }
      }
    }
    const na = N[A]!;
    const coord = [0, 0, 0];
    for (let ic = 0; ic < nc; ic++) {
      for (let ib = 0; ib < nb; ib++) {
        const hits = lines[ib + nb * ic];
        if (!hits || hits.length < 2) continue;
        hits.sort((x, y) => x - y);
        let h = 0;
        coord[B] = ib;
        coord[C] = ic;
        for (let k = 0; k < na; k++) {
          const a = g.origin[A]! + (k + 0.5) * step[A]!;
          while (h < hits.length && hits[h]! < a) h++;
          if (h % 2 === 1) {
            coord[A] = k;
            votes[sidx(coord[0]!, coord[1]!, coord[2]!)]!++;
          }
        }
      }
    }
  }
  if (shell) markSurface(soup, pos, g, N, step, votes);
  const [X, Y, Z] = g.size;
  const frac = new Float32Array(X * Y * Z);
  const per = S * S * S;
  for (let z = 0; z < Z; z++) {
    for (let y = 0; y < Y; y++) {
      for (let x = 0; x < X; x++) {
        let n = 0;
        for (let sz = 0; sz < S; sz++) {
          for (let sy = 0; sy < S; sy++) {
            for (let sx = 0; sx < S; sx++) {
              if (votes[sidx(x * S + sx, y * S + sy, z * S + sz)]! >= 2) n++;
            }
          }
        }
        frac[x + X * (y + Y * z)] = n / per;
      }
    }
  }
  return frac;
}

/** Отметить выборки, через которые проходит поверхность (голос 3 — «заполнена»). */
function markSurface(
  soup: TriangleSoup,
  pos: Float32Array,
  g: GridSpec,
  N: number[],
  step: number[],
  votes: Uint8Array,
): void {
  const tri = soup.indices;
  const minStep = Math.min(step[0]!, step[1]!, step[2]!);
  const p = [0, 0, 0];
  for (let t = 0; t < tri.length; t += 3) {
    const i0 = tri[t]! * 3;
    const i1 = tri[t + 1]! * 3;
    const i2 = tri[t + 2]! * 3;
    let len = 0;
    for (let a = 0; a < 3; a++) {
      len = Math.max(
        len,
        Math.abs(pos[i1 + a]! - pos[i0 + a]!),
        Math.abs(pos[i2 + a]! - pos[i0 + a]!),
        Math.abs(pos[i2 + a]! - pos[i1 + a]!),
      );
    }
    // Точки треугольника с шагом не больше половины выборки.
    const n = Math.max(1, Math.ceil(len / (minStep * 0.5)));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; i + j <= n; j++) {
        const u = i / n;
        const v = j / n;
        let k = 0;
        for (let a = 0; a < 3; a++) {
          p[a] =
            pos[i0 + a]! + u * (pos[i1 + a]! - pos[i0 + a]!) + v * (pos[i2 + a]! - pos[i0 + a]!);
          // Сетка покрывает рамку меша; точки на дальней грани рамки дают ровно N — зажимаем.
          const c = Math.min(N[a]! - 1, Math.max(0, Math.floor((p[a]! - g.origin[a]!) / step[a]!)));
          k += c * (a === 0 ? 1 : a === 1 ? N[0]! : N[0]! * N[1]!);
        }
        votes[k] = 3;
      }
    }
  }
}

const NB: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Убрать висящие одиночные воксели и заполнить дыры в одну ячейку. */
export function cleanup(
  filled: Uint8Array,
  size: [number, number, number],
): { removed: number; holes: number } {
  const [X, Y, Z] = size;
  const at = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z ? filled[x + X * (y + Y * z)]! : 0;
  let removed = 0;
  let holes = 0;
  const next = filled.slice();
  for (let z = 0; z < Z; z++) {
    for (let y = 0; y < Y; y++) {
      for (let x = 0; x < X; x++) {
        const i = x + X * (y + Y * z);
        const n = NB.reduce((s, [dx, dy, dz]) => s + (at(x + dx, y + dy, z + dz) ? 1 : 0), 0);
        if (filled[i] && n === 0) {
          next[i] = 0;
          removed++;
        } else if (!filled[i] && n === 6) {
          next[i] = 1;
          holes++;
        }
      }
    }
  }
  filled.set(next);
  return { removed, holes };
}

/** Ближайшая точка треугольника к p (Ericson, «Real-Time Collision Detection»). */
function closestOnTri(
  p: Rgb,
  a: Rgb,
  b: Rgb,
  c: Rgb,
): { d2: number; u: number; v: number; w: number } {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (x: number[], y: number[]) => x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!;
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  let bu: number;
  let bv: number;
  let bw: number;
  if (d1 <= 0 && d2 <= 0) {
    [bu, bv, bw] = [1, 0, 0];
  } else {
    const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);
    const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const d5 = dot(ab, cp);
    const d6 = dot(ac, cp);
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) [bu, bv, bw] = [0, 1, 0];
    else if (d6 >= 0 && d5 <= d6) [bu, bv, bw] = [0, 0, 1];
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      [bu, bv, bw] = [1 - v, v, 0];
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      [bu, bv, bw] = [1 - w, 0, w];
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      [bu, bv, bw] = [0, 1 - w, w];
    } else {
      const denom = 1 / (va + vb + vc);
      const v = vb * denom;
      const w = vc * denom;
      [bu, bv, bw] = [1 - v - w, v, w];
    }
  }
  const q = [
    bu * a[0] + bv * b[0] + bw * c[0],
    bu * a[1] + bv * b[1] + bw * c[1],
    bu * a[2] + bv * b[2] + bw * c[2],
  ];
  const e = [p[0] - q[0]!, p[1] - q[1]!, p[2] - q[2]!];
  return { d2: dot(e, e), u: bu, v: bv, w: bw };
}

/** Цвет модели в точке треугольника t с барицентриками (u, v, w). */
function colorAt(soup: TriangleSoup, t: number, u: number, v: number, w: number): Rgb {
  const m = soup.materials[soup.triMaterial[t]!]!;
  const i0 = soup.indices[t * 3]!;
  const i1 = soup.indices[t * 3 + 1]!;
  const i2 = soup.indices[t * 3 + 2]!;
  let rgb: Rgb = [m.factor[0], m.factor[1], m.factor[2]];
  if (m.texture && soup.uvs) {
    const uv = soup.uvs;
    const tu = u * uv[i0 * 2]! + v * uv[i1 * 2]! + w * uv[i2 * 2]!;
    const tv = u * uv[i0 * 2 + 1]! + v * uv[i1 * 2 + 1]! + w * uv[i2 * 2 + 1]!;
    const s = sampleImage(m.texture, tu, tv);
    rgb = [rgb[0] * s[0], rgb[1] * s[1], rgb[2] * s[2]];
  }
  if (soup.colors) {
    const c = soup.colors;
    for (let k = 0; k < 3; k++)
      rgb[k] = rgb[k]! * (u * c[i0 * 3 + k]! + v * c[i1 * 3 + k]! + w * c[i2 * 3 + k]!);
  }
  return rgb;
}

/**
 * Цвет ячеек: для поверхностных — выборки в ближайших точках меша у открытых граней,
 * приведение к палитре и голосование; внутренние получают цвет ближайшей поверхностной.
 */
export function colorize(
  soup: TriangleSoup,
  pos: Float32Array,
  g: GridSpec,
  filled: Uint8Array,
  palette: Palette,
): Uint8Array {
  const [X, Y, Z] = g.size;
  // Корзины треугольников по ячейкам сетки.
  const bins = new Map<number, number[]>();
  const cellOf = (v: number, a: number) => Math.floor((v - g.origin[a]!) / g.cell[a]!);
  const triCount = soup.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) {
      const vi = soup.indices[t * 3 + k]! * 3;
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, cellOf(pos[vi + a]!, a));
        hi[a] = Math.max(hi[a]!, cellOf(pos[vi + a]!, a));
      }
    }
    for (let z = lo[2]!; z <= hi[2]!; z++) {
      for (let y = lo[1]!; y <= hi[1]!; y++) {
        for (let x = lo[0]!; x <= hi[0]!; x++) {
          const key = x + 64 + 256 * (y + 64 + 256 * (z + 64));
          let arr = bins.get(key);
          if (!arr) bins.set(key, (arr = []));
          arr.push(t);
        }
      }
    }
  }
  const vert = (i: number): Rgb => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
  const nearestColor = (p: Rgb): Rgb | null => {
    const cx = cellOf(p[0], 0);
    const cy = cellOf(p[1], 1);
    const cz = cellOf(p[2], 2);
    for (let r = 1; r <= 4; r++) {
      let best: { d2: number; t: number; u: number; v: number; w: number } | null = null;
      const seen = new Set<number>();
      for (let z = cz - r; z <= cz + r; z++) {
        for (let y = cy - r; y <= cy + r; y++) {
          for (let x = cx - r; x <= cx + r; x++) {
            const arr = bins.get(x + 64 + 256 * (y + 64 + 256 * (z + 64)));
            if (!arr) continue;
            for (const t of arr) {
              if (seen.has(t)) continue;
              seen.add(t);
              const i = soup.indices;
              const res = closestOnTri(
                p,
                vert(i[t * 3]!),
                vert(i[t * 3 + 1]!),
                vert(i[t * 3 + 2]!),
              );
              if (!best || res.d2 < best.d2) best = { ...res, t };
            }
          }
        }
      }
      if (best) return colorAt(soup, best.t, best.u, best.v, best.w);
    }
    return null;
  };

  const cells = new Uint8Array(X * Y * Z);
  const idx = (x: number, y: number, z: number) => x + X * (y + Y * z);
  const isFilled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z && filled[idx(x, y, z)] === 1;
  const queue: number[] = [];
  for (let z = 0; z < Z; z++) {
    for (let y = 0; y < Y; y++) {
      for (let x = 0; x < X; x++) {
        if (!filled[idx(x, y, z)]) continue;
        const votes = new Map<number, number>();
        const center: Rgb = [
          g.origin[0] + (x + 0.5) * g.cell[0],
          g.origin[1] + (y + 0.5) * g.cell[1],
          g.origin[2] + (z + 0.5) * g.cell[2],
        ];
        let exposed = false;
        for (const [dx, dy, dz] of NB) {
          if (isFilled(x + dx, y + dy, z + dz)) continue;
          exposed = true;
          // Центр открытой грани и четыре точки вокруг него.
          const n = [dx, dy, dz];
          const ta = [dy !== 0 || dz !== 0 ? 1 : 0, dx !== 0 ? 1 : 0, 0];
          const tb = [
            n[1]! * ta[2]! - n[2]! * ta[1]!,
            n[2]! * ta[0]! - n[0]! * ta[2]!,
            n[0]! * ta[1]! - n[1]! * ta[0]!,
          ];
          for (const [a, b] of [
            [0, 0],
            [0.3, 0.3],
            [-0.3, 0.3],
            [0.3, -0.3],
            [-0.3, -0.3],
          ] as const) {
            const p: Rgb = [0, 0, 0];
            for (let k = 0; k < 3; k++) {
              p[k] = center[k]! + (n[k]! * 0.5 + ta[k]! * a + tb[k]! * b) * g.cell[k]!;
            }
            const col = nearestColor(p);
            if (!col) continue;
            const pi = palette.nearest(col);
            votes.set(pi, (votes.get(pi) ?? 0) + 1);
          }
        }
        if (!exposed || votes.size === 0) continue;
        let best = -1;
        let bestN = -1;
        for (const [pi, n] of votes) {
          if (n > bestN || (n === bestN && pi < best)) {
            best = pi;
            bestN = n;
          }
        }
        cells[idx(x, y, z)] = best + 1;
        queue.push(idx(x, y, z));
      }
    }
  }
  // Внутренние ячейки — цвет ближайшей поверхностной (BFS от поверхности).
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h]!;
    const x = i % X;
    const y = Math.floor(i / X) % Y;
    const z = Math.floor(i / (X * Y));
    for (const [dx, dy, dz] of NB) {
      if (!isFilled(x + dx, y + dy, z + dz)) continue;
      const j = idx(x + dx, y + dy, z + dz);
      if (cells[j]) continue;
      cells[j] = cells[i]!;
      queue.push(j);
    }
  }
  // Изолированные от поверхности (не должно быть) — ближайший цвет палитры к серому.
  for (let i = 0; i < cells.length; i++)
    if (filled[i] && !cells[i]) cells[i] = palette.nearest([0.6, 0.6, 0.6]) + 1;
  return cells;
}

/** Обрезать пустые слои по краям. */
export function crop(
  cells: Uint8Array,
  size: [number, number, number],
): { cells: Uint8Array; size: [number, number, number]; offset: [number, number, number] } {
  const [X, Y, Z] = size;
  const lo = [X, Y, Z];
  const hi = [-1, -1, -1];
  for (let z = 0; z < Z; z++) {
    for (let y = 0; y < Y; y++) {
      for (let x = 0; x < X; x++) {
        if (!cells[x + X * (y + Y * z)]) continue;
        const c = [x, y, z];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a]!, c[a]!);
          hi[a] = Math.max(hi[a]!, c[a]!);
        }
      }
    }
  }
  if (hi[0]! < 0) throw new Error('empty voxel grid');
  const ns: [number, number, number] = [
    hi[0]! - lo[0]! + 1,
    hi[1]! - lo[1]! + 1,
    hi[2]! - lo[2]! + 1,
  ];
  const out = new Uint8Array(ns[0] * ns[1] * ns[2]);
  for (let z = 0; z < ns[2]; z++) {
    for (let y = 0; y < ns[1]; y++) {
      for (let x = 0; x < ns[0]; x++) {
        out[x + ns[0] * (y + ns[1] * z)] = cells[x + lo[0]! + X * (y + lo[1]! + Y * (z + lo[2]!))]!;
      }
    }
  }
  return { cells: out, size: ns, offset: [lo[0]!, lo[1]!, lo[2]!] };
}

/**
 * Ручные правки из manifest (в координатах итоговой сетки). Добавления за её пределами
 * (в том числе с отрицательными координатами) расширяют сетку — так ставятся тонкие детали,
 * которые вокселизация срезала: черешок, уши, антенна.
 */
export function applyEdits(
  src: Uint8Array,
  srcSize: [number, number, number],
  edits: VoxelEdits,
  palette: Palette,
): { cells: Uint8Array; size: [number, number, number] } {
  const lo = [0, 0, 0];
  const hi = [srcSize[0] - 1, srcSize[1] - 1, srcSize[2] - 1];
  for (const b of edits.add ?? []) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, b.min[a]!);
      hi[a] = Math.max(hi[a]!, b.max[a]!);
    }
  }
  const size: [number, number, number] = [
    hi[0]! - lo[0]! + 1,
    hi[1]! - lo[1]! + 1,
    hi[2]! - lo[2]! + 1,
  ];
  const [X, Y, Z] = size;
  let cells = src;
  if (X !== srcSize[0] || Y !== srcSize[1] || Z !== srcSize[2]) {
    cells = new Uint8Array(X * Y * Z);
    for (let z = 0; z < srcSize[2]; z++) {
      for (let y = 0; y < srcSize[1]; y++) {
        for (let x = 0; x < srcSize[0]; x++) {
          cells[x - lo[0]! + X * (y - lo[1]! + Y * (z - lo[2]!))] =
            src[x + srcSize[0] * (y + srcSize[1] * z)]!;
        }
      }
    }
  }
  const shift = (b: VoxelBox): VoxelBox => ({
    ...b,
    min: [b.min[0] - lo[0]!, b.min[1] - lo[1]!, b.min[2] - lo[2]!],
    max: [b.max[0] - lo[0]!, b.max[1] - lo[1]!, b.max[2] - lo[2]!],
  });
  const each = (b: VoxelBox, fn: (i: number, x: number, y: number, z: number) => void) => {
    for (let z = Math.max(0, b.min[2]); z <= Math.min(Z - 1, b.max[2]); z++) {
      for (let y = Math.max(0, b.min[1]); y <= Math.min(Y - 1, b.max[1]); y++) {
        for (let x = Math.max(0, b.min[0]); x <= Math.min(X - 1, b.max[0]); x++)
          fn(x + X * (y + Y * z), x, y, z);
      }
    }
  };
  for (const b of edits.remove ?? []) each(shift(b), (i) => (cells[i] = 0));
  for (const b of edits.add ?? []) {
    const explicit = b.color ? palette.hex.indexOf(b.color) : -1;
    if (b.color && explicit < 0) throw new Error(`color ${b.color} is not in the figure palette`);
    each(shift(b), (i, x, y, z) => {
      if (explicit >= 0) {
        cells[i] = explicit + 1;
        return;
      }
      // Цвет ближайшего непустого соседа.
      for (const [dx, dy, dz] of NB) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= X || ny >= Y || nz >= Z) continue;
        const c = cells[nx + X * (ny + Y * nz)]!;
        if (c) {
          cells[i] = c;
          return;
        }
      }
      if (!cells[i]) cells[i] = 1;
    });
  }
  for (const b of edits.paint ?? []) {
    const c = b.color ? palette.hex.indexOf(b.color) : -1;
    if (c < 0) throw new Error(`paint needs a figure palette color, got ${b.color ?? 'none'}`);
    each(shift(b), (i) => {
      if (cells[i]) cells[i] = c + 1;
    });
  }
  return { cells, size };
}

/** Полный конвейер §6.2: нормализация → сетка → заполнение → чистка → цвет → палитра → правки. */
export function voxelize(soup: TriangleSoup, opts: VoxelizeOptions): VoxelResult {
  const palette = opts.palette ?? new Palette();
  const pos = rotatePositions(soup.positions, opts.rotation ?? [0, 0, 0]);
  const g = gridFor(pos, opts.maxSize);
  const frac = fillFractions(soup, pos, g, opts.samples ?? 4, opts.shell);
  const threshold = opts.threshold ?? 0.4;
  const filled = new Uint8Array(frac.length);
  for (let i = 0; i < frac.length; i++) filled[i] = frac[i]! >= threshold ? 1 : 0;
  const { removed, holes } = cleanup(filled, g.size);
  const colored = colorize(soup, pos, g, filled, palette);
  reduceColors(colored, palette, opts.maxColors ?? 6);
  const cropped = crop(colored, g.size);
  const edited = opts.edits
    ? applyEdits(cropped.cells, cropped.size, opts.edits, palette)
    : cropped;
  const { filled: count, ...fig } = finishFigure(edited.cells, edited.size, palette);
  return { ...fig, stats: { filled: count, removedIsolated: removed, filledHoles: holes } };
}

/**
 * Обрезка пустых слоёв и перенумерация цветов по частоте: `cells` — индекс палитры + 1.
 * Общий финал для вокселизации и импорта MagicaVoxel.
 */
export function finishFigure(
  src: Uint8Array,
  srcSize: [number, number, number],
  palette: Palette,
): { size: [number, number, number]; cells: Uint8Array; palette: string[]; filled: number } {
  const final = crop(src, srcSize);
  const counts = new Map<number, number>();
  for (const c of final.cells) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  const order = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c);
  const remap = new Map(order.map((c, k) => [c, k + 1]));
  const cells = final.cells.map((c) => (c ? remap.get(c)! : 0));
  let filled = 0;
  for (const c of cells) if (c) filled++;
  return { size: final.size, cells, palette: order.map((c) => palette.hex[c - 1]!), filled };
}
