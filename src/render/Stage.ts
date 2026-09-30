import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import type { Size3 } from '../core/types';

/**
 * Окружение уровня: поворотный стол мастерской и фейковая тень-блоб под блоком (§7).
 * Процедурная геометрия; модели из Приложения А.3 заменят её в фазе 4/5.
 */
export class Stage {
  readonly group = new Group();
  private readonly top: Mesh;
  private readonly base: Mesh;
  private readonly shadow: Mesh;
  private readonly shadowTex: CanvasTexture;

  constructor() {
    const wood = new MeshLambertMaterial({ color: 0xd9ad7c });
    const woodDark = new MeshLambertMaterial({ color: 0xa8743f });
    this.top = new Mesh(new CylinderGeometry(1, 1, 1, 48), wood);
    this.base = new Mesh(new CylinderGeometry(1, 1, 1, 48), woodDark);
    this.shadowTex = makeBlobTexture();
    this.shadow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        depthWrite: false,
        color: 0x5a3a1e,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    this.group.add(this.base, this.top, this.shadow);
  }

  fit(size: Size3): void {
    const [X, , Z] = size;
    const r = 0.5 * Math.sqrt(X * X + Z * Z) + 0.55;
    this.top.scale.set(r, 0.28, r);
    this.top.position.y = -0.14;
    this.base.scale.set(r * 1.08, 0.3, r * 1.08);
    this.base.position.y = -0.28 - 0.15;
    this.shadow.scale.set(X + 1.4, Z + 1.4, 1);
    this.shadow.position.y = 0.004;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshLambertMaterial).dispose();
      }
    });
    this.shadowTex.dispose();
  }
}

function makeBlobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
