import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';

const MAX = 384;

/** Пул частиц разрушения: один draw call, без аллокаций в кадре (§7). */
export class Particles {
  readonly mesh: InstancedMesh;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly rot = new Float32Array(MAX * 4); // ось (xyz) + угол
  private readonly spin = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly color = new Float32Array(MAX * 3);
  private count = 0;
  private floorY = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly axis = new Vector3();
  private readonly c = new Color();
  private readonly colorAttr: InstancedBufferAttribute;

  constructor() {
    const mat = new MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.colorAttr = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.colorAttr.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = this.colorAttr;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  setFloor(y: number): void {
    this.floorY = y;
  }

  get active(): number {
    return this.count;
  }

  /** Осколки куба с центром в (x, y, z). */
  burst(x: number, y: number, z: number, hex: string, n = 7, power = 1): void {
    this.c.set(hex);
    for (let k = 0; k < n; k++) {
      if (this.count >= MAX) this.kill(0);
      const i = this.count++;
      const rnd = Math.random;
      this.pos[i * 3] = x + (rnd() - 0.5) * 0.6;
      this.pos[i * 3 + 1] = y + (rnd() - 0.5) * 0.6;
      this.pos[i * 3 + 2] = z + (rnd() - 0.5) * 0.6;
      const ang = rnd() * Math.PI * 2;
      const sp = (1.6 + rnd() * 2.2) * power;
      this.vel[i * 3] = Math.cos(ang) * sp;
      this.vel[i * 3 + 1] = (2.5 + rnd() * 3) * power;
      this.vel[i * 3 + 2] = Math.sin(ang) * sp;
      this.axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      this.rot[i * 4] = this.axis.x;
      this.rot[i * 4 + 1] = this.axis.y;
      this.rot[i * 4 + 2] = this.axis.z;
      this.rot[i * 4 + 3] = rnd() * Math.PI;
      this.spin[i] = (rnd() - 0.5) * 14;
      this.maxLife[i] = 0.55 + rnd() * 0.35;
      this.life[i] = this.maxLife[i]!;
      this.size[i] = 0.16 + rnd() * 0.16;
      const shade = 0.88 + rnd() * 0.16;
      this.color[i * 3] = this.c.r * shade;
      this.color[i * 3 + 1] = this.c.g * shade;
      this.color[i * 3 + 2] = this.c.b * shade;
    }
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[last * 3 + k]!;
      this.vel[i * 3 + k] = this.vel[last * 3 + k]!;
      this.color[i * 3 + k] = this.color[last * 3 + k]!;
    }
    for (let k = 0; k < 4; k++) this.rot[i * 4 + k] = this.rot[last * 4 + k]!;
    this.spin[i] = this.spin[last]!;
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.size[i] = this.size[last]!;
  }

  /** Шаг симуляции. Возвращает true, пока есть живые частицы. */
  update(dt: number): boolean {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) this.kill(i);
    }
    const col = this.colorAttr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      this.vel[i * 3 + 1]! -= 16 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k]! += this.vel[i * 3 + k]! * dt;
      if (this.pos[i * 3 + 1]! < this.floorY + 0.1) {
        this.pos[i * 3 + 1] = this.floorY + 0.1;
        this.vel[i * 3 + 1] = -this.vel[i * 3 + 1]! * 0.35;
        this.vel[i * 3]! *= 0.7;
        this.vel[i * 3 + 2]! *= 0.7;
      }
      this.rot[i * 4 + 3]! += this.spin[i]! * dt;
      const k = this.life[i]! / this.maxLife[i]!;
      const sc = this.size[i]! * Math.min(1, k * 2.5);
      this.axis.set(this.rot[i * 4]!, this.rot[i * 4 + 1]!, this.rot[i * 4 + 2]!);
      this.q.setFromAxisAngle(this.axis, this.rot[i * 4 + 3]!);
      this.v.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
      this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      col[i * 3] = this.color[i * 3]!;
      col[i * 3 + 1] = this.color[i * 3 + 1]!;
      col[i * 3 + 2] = this.color[i * 3 + 2]!;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    return this.count > 0;
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }
}
