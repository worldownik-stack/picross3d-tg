import type { Vector4 } from 'three';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Size3 } from '../core/types';

export const DEFAULT_AZ = MathUtils.degToRad(35);
export const DEFAULT_PITCH = MathUtils.degToRad(27);
const MIN_PITCH = MathUtils.degToRad(-60);
const MAX_PITCH = MathUtils.degToRad(80);
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.2;
const FOV = 38;

/** Ручки срезов: вынос за конец ребра в покое и отступ от ребра (в кубах). */
export const KNOB_REST_OUT = 0.6;
export const KNOB_PAD = 0.35;
/** Радиус ручки на экране с запасом, px. */
const KNOB_RADIUS_PX = 28;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Орбитальная камера вокруг центра блока (§3): ограничение наклона −60…+80°,
 * автокадрирование в свободную от UI область, плавный сброс вида, тряска.
 * Метод update() не аллоцирует.
 */
export class OrbitCamera {
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 400);
  az = DEFAULT_AZ;
  pitch = DEFAULT_PITCH;
  zoom = 1;
  readonly target = new Vector3();
  private radius = 3;
  private bounds: Size3 = [1, 1, 1];
  private width = 1;
  private height = 1;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private fitDistance = 10;
  /** Угловая скорость от клавиш, рад/с. */
  readonly keyVelocity = { az: 0, pitch: 0 };
  private tween: {
    from: [number, number, number];
    to: [number, number, number];
    t: number;
  } | null = null;
  private shakeT = 0;
  private shakeAmp = 0;
  private readonly tmp = new Vector3();

  setBounds(size: Size3): void {
    const [X, Y, Z] = size;
    this.bounds = [X, Y, Z];
    this.target.set(0, Y / 2, 0);
    this.radius = 0.5 * Math.sqrt(X * X + Y * Y + Z * Z);
    this.refit();
  }

  setViewport(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.camera.aspect = this.width / this.height;
    this.refit();
  }

  setInsets(insets: Insets): void {
    this.insets = insets;
    this.refit();
  }

  private refit(): void {
    const w = Math.max(40, this.width - this.insets.left - this.insets.right);
    const h = Math.max(40, this.height - this.insets.top - this.insets.bottom);
    const m = this.margins();
    this.fitDistance = this.fitFor(w - m.l - m.r, h - m.t - m.b);
    // Центр проекции — в центр свободной области за вычетом полей под ручки.
    const cx = this.insets.left + m.l + (w - m.l - m.r) / 2;
    const cy = this.insets.top + m.t + (h - m.t - m.b) / 2;
    this.camera.setViewOffset(
      this.width,
      this.height,
      this.width / 2 - cx,
      this.height / 2 - cy,
      this.width,
      this.height,
    );
  }

  /** Поля (px) вокруг блока: слева и снизу — место под ручки срезов. */
  private margins(): { l: number; r: number; t: number; b: number } {
    const [X, Y, Z] = this.bounds;
    const knob = KNOB_RADIUS_PX * 2;
    return {
      l: Y > 1 ? knob : 12,
      r: 12,
      t: Y > 1 ? KNOB_RADIUS_PX : 12,
      b: X > 1 || Z > 1 ? knob : 12,
    };
  }

  /**
   * Расстояние, на котором блок (8 углов) целиком помещается в область w×h
   * с полями, при ракурсах по умолчанию (азимут 0° и 45° — самый широкий силуэт).
   * Вызывается только при смене размера/отступов, не в кадре.
   */
  private fitFor(w: number, h: number): number {
    const [X, Y, Z] = this.bounds;
    const k = this.height / 2 / Math.tan(MathUtils.degToRad(FOV / 2)); // px на единицу tan
    // Углы блока должны целиком помещаться в область w×h.
    const pts: Array<[number, number, number]> = [];
    for (const x of [-X / 2, X / 2]) {
      for (const y of [0, Y]) for (const z of [-Z / 2, Z / 2]) pts.push([x, y, z]);
    }
    const fits = (d: number, az: number, pitch: number): boolean => {
      const cp = Math.cos(pitch);
      const dir = [cp * Math.sin(az), Math.sin(pitch), cp * Math.cos(az)];
      const pos = [
        this.target.x + d * dir[0]!,
        this.target.y + d * dir[1]!,
        this.target.z + d * dir[2]!,
      ];
      const fwd = [-dir[0]!, -dir[1]!, -dir[2]!];
      // right = fwd × up(0,1,0), up2 = right × fwd
      let rx = -fwd[2]!;
      let rz = fwd[0]!;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl;
      rz /= rl;
      const ux = -rz * fwd[1]!;
      const uy = rz * fwd[0]! - rx * fwd[2]!;
      const uz = rx * fwd[1]!;
      for (const c of pts) {
        const vx = c[0] - pos[0]!;
        const vy = c[1] - pos[1]!;
        const vz = c[2] - pos[2]!;
        const depth = vx * fwd[0]! + vy * fwd[1]! + vz * fwd[2]!;
        if (depth <= 0.1) return false;
        const sx = ((vx * rx + vz * rz) / depth) * k;
        const sy = ((vx * ux + vy * uy + vz * uz) / depth) * k;
        if (Math.abs(sx) > w / 2 || Math.abs(sy) > h / 2) return false;
      }
      return true;
    };
    let best = 0;
    for (const az of [DEFAULT_AZ, Math.PI / 4]) {
      let lo = 0.5;
      let hi = 400;
      for (let it = 0; it < 30; it++) {
        const mid = (lo + hi) / 2;
        if (fits(mid, az, DEFAULT_PITCH)) hi = mid;
        else lo = mid;
      }
      best = Math.max(best, hi);
    }
    return best;
  }

  rotate(dAz: number, dPitch: number): void {
    this.tween = null;
    this.az += dAz;
    this.pitch = MathUtils.clamp(this.pitch + dPitch, MIN_PITCH, MAX_PITCH);
  }

  zoomBy(factor: number): void {
    this.tween = null;
    this.zoom = MathUtils.clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  /** Плавно вернуть вид по умолчанию. */
  reset(az = DEFAULT_AZ, pitch = DEFAULT_PITCH, zoom = 1): void {
    // Кратчайший путь по азимуту.
    const twoPi = Math.PI * 2;
    let from = this.az % twoPi;
    if (from < 0) from += twoPi;
    let to = az % twoPi;
    if (to - from > Math.PI) to -= twoPi;
    if (from - to > Math.PI) to += twoPi;
    this.az = from;
    this.tween = { from: [from, this.pitch, this.zoom], to: [to, pitch, zoom], t: 0 };
  }

  shake(amount = 0.12): void {
    this.shakeT = 0.28;
    this.shakeAmp = amount;
  }

  /** Анимации камеры. Возвращает true, пока что-то движется. */
  update(dt: number): boolean {
    let active = false;
    if (this.keyVelocity.az !== 0 || this.keyVelocity.pitch !== 0) {
      this.rotate(this.keyVelocity.az * dt, this.keyVelocity.pitch * dt);
      active = true;
    }
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 0.45);
      const k = 1 - Math.pow(1 - tw.t, 3);
      this.az = tw.from[0] + (tw.to[0] - tw.from[0]) * k;
      this.pitch = tw.from[1] + (tw.to[1] - tw.from[1]) * k;
      this.zoom = tw.from[2] + (tw.to[2] - tw.from[2]) * k;
      if (tw.t >= 1) this.tween = null;
      active = true;
    }
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      active = true;
    }
    this.apply();
    return active;
  }

  apply(): void {
    const d = this.fitDistance * this.zoom;
    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    cam.position.set(
      this.target.x + d * cp * Math.sin(this.az),
      this.target.y + d * Math.sin(this.pitch),
      this.target.z + d * cp * Math.cos(this.az),
    );
    if (this.shakeT > 0) {
      const a = this.shakeAmp * (this.shakeT / 0.28);
      const t = this.shakeT * 90;
      cam.position.x += Math.sin(t * 1.3) * a;
      cam.position.y += Math.cos(t * 1.7) * a * 0.6;
    }
    cam.near = Math.max(0.1, d - this.radius * 3);
    cam.far = d + this.radius * 4 + 20;
    cam.lookAt(this.target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /**
   * Базис для глифов на гранях ±Y (§7): «вправо» и «вверх» экрана,
   * спроецированные на XZ и привязанные к осям с шагом 90°.
   */
  topBasis(out: Vector4): Vector4 {
    const rx = Math.cos(this.az);
    const rz = -Math.sin(this.az);
    const fx = -Math.sin(this.az);
    const fz = -Math.cos(this.az);
    const snap = (x: number, z: number): [number, number] =>
      Math.abs(x) >= Math.abs(z) ? [Math.sign(x), 0] : [0, Math.sign(z)];
    const r = snap(rx, rz);
    const f = snap(fx, fz);
    return out.set(r[0], r[1], f[0], f[1]);
  }

  /** Направление взгляда (от камеры к цели), без аллокаций. */
  viewDir(out: Vector3): Vector3 {
    return out.copy(this.target).sub(this.camera.position).normalize();
  }

  /** Сторона оси, обращённая к камере: +1 или −1. */
  nearSide(axis: 0 | 1 | 2): 1 | -1 {
    const d = this.tmp.copy(this.camera.position).sub(this.target);
    const v = axis === 0 ? d.x : axis === 1 ? d.y : d.z;
    return v >= 0 ? 1 : -1;
  }
}
