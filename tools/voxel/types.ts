/** Декодированная текстура RGBA8. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface MeshMaterial {
  /** baseColorFactor (линейный множитель как в glTF, RGBA 0..1). */
  factor: [number, number, number, number];
  texture: RgbaImage | null;
}

/**
 * «Суп треугольников» модели в мировых координатах: общий массив вершин,
 * индексы по три, UV и цвета вершин (если есть), материал на треугольник.
 */
export interface TriangleSoup {
  positions: Float32Array;
  uvs: Float32Array | null;
  colors: Float32Array | null;
  indices: Uint32Array;
  triMaterial: Uint16Array;
  materials: MeshMaterial[];
}

export type Rgb = [number, number, number];
