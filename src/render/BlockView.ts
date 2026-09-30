import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Vector3,
  type ShaderMaterial,
} from 'three';
import type { Puzzle } from '../core/puzzle';
import type { Axis } from '../core/types';
import { createCubeMaterial, ST_DIM_X, ST_HIDDEN } from './cubeMaterial';
import type { GlyphAtlas } from './glyphAtlas';

/**
 * Все кубы уровня — один InstancedMesh (§7). Атрибуты инстанса:
 * aClue (глифы по осям X, Y, Z), aState (флаги), aColor (цвет раскрытия),
 * aReveal (задержка волны окраски, −1 — нет).
 * Мир: блок стоит на y = 0, по X и Z отцентрирован; ячейка (x, y, z) — куб
 * с центром (x − X/2 + ½, y + ½, z − Z/2 + ½).
 */
export class BlockView {
  readonly group = new Group();
  readonly mesh: InstancedMesh;
  readonly material: ShaderMaterial;
  /** Смещение «мир → пространство сетки». */
  readonly gridOffset: Vector3;
  private readonly flags: Uint16Array;
  private readonly stateAttr: InstancedBufferAttribute;
  private readonly revealAttr: InstancedBufferAttribute;
  private readonly colorAttr: InstancedBufferAttribute;
  private dirty = false;

  constructor(
    readonly puzzle: Puzzle,
    atlas: GlyphAtlas,
    palette: readonly string[],
    cells: Uint8Array,
  ) {
    const grid = puzzle.grid;
    const n = grid.cellCount;
    const geometry = new BoxGeometry(1, 1, 1);
    this.material = createCubeMaterial(atlas.texture);
    this.mesh = new InstancedMesh(geometry, this.material, n);
    this.mesh.frustumCulled = false;
    this.gridOffset = new Vector3(grid.X / 2, 0, grid.Z / 2);

    const m = new Matrix4();
    const clue = new Float32Array(n * 3);
    const color = new Float32Array(n * 3);
    const tmp = new Color();
    const colors = palette.map((c) => new Color(c));
    for (let i = 0; i < n; i++) {
      const [x, y, z] = grid.coords(i);
      m.makeTranslation(x - grid.X / 2 + 0.5, y + 0.5, z - grid.Z / 2 + 0.5);
      this.mesh.setMatrixAt(i, m);
      for (let a = 0 as Axis; a < 3; a = (a + 1) as Axis) {
        const g = grid.globalLineOf(a, i);
        clue[i * 3 + a] = atlas.glyphFor(puzzle.clues[g]!, puzzle.hidden[g] === 1);
      }
      const c = cells[i] ? (colors[cells[i]! - 1] ?? tmp.set('#999999')) : tmp.set('#999999');
      color[i * 3] = c.r;
      color[i * 3 + 1] = c.g;
      color[i * 3 + 2] = c.b;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flags = new Uint16Array(n);
    geometry.setAttribute('aClue', new InstancedBufferAttribute(clue, 3));
    this.colorAttr = new InstancedBufferAttribute(color, 3);
    geometry.setAttribute('aColor', this.colorAttr);
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.stateAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aState', this.stateAttr);
    this.revealAttr = new InstancedBufferAttribute(new Float32Array(n).fill(-1), 1);
    geometry.setAttribute('aReveal', this.revealAttr);
    this.group.add(this.mesh);
  }

  get grid() {
    return this.puzzle.grid;
  }

  hasFlag(i: number, f: number): boolean {
    return (this.flags[i]! & f) !== 0;
  }

  setFlag(i: number, f: number, on: boolean): void {
    const prev = this.flags[i]!;
    const next = on ? prev | f : prev & ~f;
    if (next === prev) return;
    this.flags[i] = next;
    this.dirty = true;
  }

  /** Снять флаг со всех кубов. */
  clearFlag(f: number): void {
    for (let i = 0; i < this.flags.length; i++) {
      if (this.flags[i]! & f) {
        this.flags[i] = this.flags[i]! & ~f;
        this.dirty = true;
      }
    }
  }

  setDim(i: number, axis: Axis, on: boolean): void {
    this.setFlag(i, ST_DIM_X << axis, on);
  }

  isHidden(i: number): boolean {
    return this.hasFlag(i, ST_HIDDEN);
  }

  /** Записать изменения в GPU-атрибут. Возвращает true, если что-то изменилось. */
  flush(): boolean {
    if (!this.dirty) return false;
    const arr = this.stateAttr.array as Float32Array;
    for (let i = 0; i < this.flags.length; i++) arr[i] = this.flags[i]!;
    this.stateAttr.needsUpdate = true;
    this.dirty = false;
    return true;
  }

  /** Центр ячейки в мировых координатах (без трансформации группы). */
  cellCenter(i: number, out: Vector3): Vector3 {
    const g = this.grid;
    return out.set(g.x(i) - g.X / 2 + 0.5, g.y(i) + 0.5, g.z(i) - g.Z / 2 + 0.5);
  }

  /** Запуск волны окраски снизу вверх (§2.9). */
  startReveal(): number {
    const arr = this.revealAttr.array as Float32Array;
    const g = this.grid;
    let maxDelay = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = g.y(i) * 0.12 + ((g.x(i) + g.z(i)) % 3) * 0.02;
      arr[i] = d;
      maxDelay = Math.max(maxDelay, d);
    }
    this.revealAttr.needsUpdate = true;
    this.material.uniforms.uRevealT!.value = 0;
    return maxDelay + 0.35;
  }

  setRevealTime(t: number): void {
    this.material.uniforms.uRevealT!.value = t;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
