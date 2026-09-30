import type { Axis, Size3 } from './types';

/**
 * Геометрия блока X×Y×Z. Индекс ячейки `i = x + X*(y + Y*z)` (§5.1).
 *
 * Линия вдоль оси A задаётся двумя другими координатами:
 *  - ось X: line = y + Y*z, всего Y·Z;
 *  - ось Y: line = x + X*z, всего X·Z;
 *  - ось Z: line = x + X*y, всего X·Y.
 * Глобальный номер линии: `lineOffset[axis] + line`.
 */
export class Grid {
  readonly size: Size3;
  readonly X: number;
  readonly Y: number;
  readonly Z: number;
  readonly cellCount: number;
  readonly strides: readonly [number, number, number];
  readonly lineCounts: readonly [number, number, number];
  readonly lineOffset: readonly [number, number, number];
  readonly totalLines: number;
  /** Начальная ячейка каждой глобальной линии. */
  readonly lineStart: Int32Array;
  /** Ось каждой глобальной линии. */
  readonly lineAxis: Uint8Array;

  constructor(size: Size3) {
    const [X, Y, Z] = size;
    for (const s of size) {
      if (!Number.isInteger(s) || s < 1) throw new Error(`bad grid size ${size.join('×')}`);
    }
    this.size = [X, Y, Z];
    this.X = X;
    this.Y = Y;
    this.Z = Z;
    this.cellCount = X * Y * Z;
    this.strides = [1, X, X * Y];
    this.lineCounts = [Y * Z, X * Z, X * Y];
    this.lineOffset = [0, Y * Z, Y * Z + X * Z];
    this.totalLines = Y * Z + X * Z + X * Y;
    this.lineStart = new Int32Array(this.totalLines);
    this.lineAxis = new Uint8Array(this.totalLines);
    for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
      for (let l = 0; l < this.lineCounts[a]; l++) {
        const g = this.lineOffset[a] + l;
        this.lineAxis[g] = a;
        this.lineStart[g] = this.startOf(a, l);
      }
    }
  }

  index(x: number, y: number, z: number): number {
    return x + this.X * (y + this.Y * z);
  }

  x(i: number): number {
    return i % this.X;
  }
  y(i: number): number {
    return Math.floor(i / this.X) % this.Y;
  }
  z(i: number): number {
    return Math.floor(i / (this.X * this.Y));
  }

  /** Координата ячейки по оси. */
  coord(i: number, axis: Axis): number {
    return axis === 0 ? this.x(i) : axis === 1 ? this.y(i) : this.z(i);
  }

  coords(i: number): [number, number, number] {
    return [this.x(i), this.y(i), this.z(i)];
  }

  contains(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.X && y < this.Y && z < this.Z;
  }

  /** Длина линий вдоль оси. */
  lineLength(axis: Axis): number {
    return this.size[axis];
  }

  /** Номер линии (внутри оси), проходящей через ячейку. */
  lineOf(axis: Axis, i: number): number {
    if (axis === 0) return Math.floor(i / this.X);
    if (axis === 1) return this.x(i) + this.X * this.z(i);
    return i % (this.X * this.Y);
  }

  /** Глобальный номер линии через ячейку. */
  globalLineOf(axis: Axis, i: number): number {
    return this.lineOffset[axis] + this.lineOf(axis, i);
  }

  /** k-я ячейка линии. */
  lineCell(axis: Axis, line: number, k: number): number {
    return this.startOf(axis, line) + k * this.strides[axis];
  }

  /** Все ячейки линии (аллоцирует; для горячих путей — lineStart/strides). */
  lineCells(axis: Axis, line: number): number[] {
    const n = this.size[axis];
    const s = this.startOf(axis, line);
    const d = this.strides[axis];
    const out = new Array<number>(n);
    for (let k = 0; k < n; k++) out[k] = s + k * d;
    return out;
  }

  private startOf(axis: Axis, line: number): number {
    if (axis === 0) return this.X * line;
    if (axis === 1) {
      const x = line % this.X;
      const z = Math.floor(line / this.X);
      return x + this.X * this.Y * z;
    }
    return line;
  }
}
