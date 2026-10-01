import { Group, Mesh, MeshLambertMaterial, type Material, type MeshStandardMaterial } from 'three';
import type { Size3 } from '../core/types';

const URL = './models/plinth.glb';
/** Площадка — 3/4 от ширины фигуры плюс запас: края фигуры могут свешиваться. */
const COVER = 0.75;
const MARGIN = 0.3;

/** Что постамент занимает под полом: глубина и радиус основания (для кадра). */
export interface PlinthBounds {
  depth: number;
  radius: number;
}

/**
 * Постамент коллекции из Meshy (Приложение А.3, `npm run props`). Модель нормализована:
 * верх на y = 0, радиус 1; размеры площадки и высоты — в `userData` (`topRadius`, `height`).
 * Грузится лениво, загрузчик — отдельным чанком.
 */
export class Plinth {
  readonly group = new Group();
  /** Значения по умолчанию — из сборки, чтобы кадр не прыгал при загрузке. */
  private top = 0.52;
  private height = 0.83;
  private disposed = false;

  constructor(private readonly onReady: () => void) {
    void this.load().catch((e: unknown) => console.warn('plinth', e));
  }

  private async load(): Promise<void> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(URL);
    if (this.disposed) {
      disposeTree(gltf.scene);
      return;
    }
    gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const src = o.material as MeshStandardMaterial;
      o.material = new MeshLambertMaterial({ map: src.map, color: src.color });
      src.dispose();
      const d = o.userData as { topRadius?: number; height?: number };
      if (d.topRadius) this.top = d.topRadius;
      if (d.height) this.height = d.height;
    });
    this.group.add(gltf.scene);
    this.onReady();
  }

  /**
   * Подогнать под фигуру размера `size`. Высота растёт медленнее ширины, иначе под
   * широкой низкой фигурой (самолёт) постамент заслоняет её.
   */
  fit(size: Size3): PlinthBounds {
    const [X, Y, Z] = size;
    const wide = Math.max(X, Z);
    const s = ((wide / 2) * COVER + MARGIN) / this.top;
    const depth = 0.4 + 0.12 * wide + 0.1 * Y;
    this.group.scale.set(s, depth / this.height, s);
    return { depth, radius: s };
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}

function disposeTree(root: Group): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    const m = o.material as Material & { map?: { dispose(): void } | null };
    m.map?.dispose();
    m.dispose();
  });
}
