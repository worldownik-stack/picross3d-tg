import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Camera,
} from 'three';

/** Длительность взмаха, удержания и затухания, с. */
const SWING = 0.12;
const HOLD = 0.07;
const FADE = 0.12;

/**
 * Молоток и кисть у куба (Приложение А.3: анимация удара и пометки). Процедурные модели
 * поверх блока (без теста глубины), видны только во время анимации.
 */
export class ToolFx {
  readonly group = new Group();
  private readonly hammer = new Group();
  private readonly brush = new Group();
  private readonly mats: MeshLambertMaterial[] = [];
  private active: Group | null = null;
  private t = 0;
  private from = 0;
  private to = 0;
  /** Ориентация «лицом к камере» на момент взмаха. */
  private readonly facing = new Quaternion();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  constructor() {
    const mat = (color: number) => {
      const m = new MeshLambertMaterial({ color, depthTest: false, transparent: true });
      this.mats.push(m);
      return m;
    };
    const wood = mat(0xc28b55);
    const handle = new Mesh(new CylinderGeometry(0.07, 0.08, 1.05, 10), wood);
    handle.position.y = 0.5;
    const head = new Mesh(new BoxGeometry(0.62, 0.3, 0.3), mat(0x8d8a85));
    head.position.y = 1.05;
    this.hammer.add(handle, head);

    const bHandle = new Mesh(new CylinderGeometry(0.06, 0.07, 0.8, 10), wood);
    bHandle.position.y = 0.4;
    const ferrule = new Mesh(new CylinderGeometry(0.1, 0.08, 0.16, 10), mat(0xc9c4bb));
    ferrule.position.y = 0.86;
    const bristles = new Mesh(new CylinderGeometry(0.03, 0.11, 0.22, 10), mat(0x2aa99b));
    bristles.position.y = 1.04;
    this.brush.add(bHandle, ferrule, bristles);

    for (const g of [this.hammer, this.brush]) {
      g.visible = false;
      g.traverse((o) => (o.renderOrder = 10));
      this.group.add(g);
    }
  }

  /**
   * Взмах инструмента у куба `cell` (мир): рукоять справа снизу от куба на экране,
   * к концу взмаха верх инструмента приходит в куб.
   */
  play(kind: 'hammer' | 'brush', cell: Vector3, camera: Camera): void {
    const g = kind === 'hammer' ? this.hammer : this.brush;
    if (this.active && this.active !== g) this.active.visible = false;
    this.active = g;
    this.facing.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.facing);
    this.up.set(0, 1, 0).applyQuaternion(this.facing);
    const reach = kind === 'hammer' ? 1.05 : 1.1;
    const hit = Math.atan2(0.8, 0.6);
    g.position
      .copy(cell)
      .addScaledVector(this.right, reach * Math.sin(hit))
      .addScaledVector(this.up, -reach * Math.cos(hit));
    this.to = hit;
    this.from = kind === 'hammer' ? hit - 1.25 : hit - 0.35;
    this.orient(g, this.from);
    g.visible = true;
    this.t = 0;
    for (const m of this.mats) m.opacity = 1;
  }

  /** Шаг анимации; false — закончилась. */
  update(dt: number): boolean {
    const g = this.active;
    if (!g) return false;
    this.t += dt;
    const k = Math.min(1, this.t / SWING);
    this.orient(g, this.from + (this.to - this.from) * k * k);
    if (this.t > SWING + HOLD) {
      const f = Math.min(1, (this.t - SWING - HOLD) / FADE);
      for (const m of this.mats) m.opacity = 1 - f;
      if (f >= 1) {
        g.visible = false;
        this.active = null;
        return false;
      }
    }
    return true;
  }

  /** Лицом к камере плюс поворот на `angle` вокруг оси взгляда (влево — к кубу). */
  private orient(g: Group, angle: number): void {
    g.quaternion.copy(this.facing);
    g.rotateZ(angle);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}
