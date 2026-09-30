import { NodeIO, type Document, type Material, type Node as GNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { decodeImage } from './image';
import type { MeshMaterial, TriangleSoup } from './types';

type Mat4 = Float64Array;

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function nodeMatrix(n: GNode): Mat4 {
  return Float64Array.from(n.getMatrix());
}

const IDENTITY = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export async function readGlb(bytes: Uint8Array): Promise<Document> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  return io.readBinary(bytes);
}

/** Все треугольные примитивы сцены в мировых координатах. */
export function documentToSoup(doc: Document): TriangleSoup {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const triMaterial: number[] = [];
  const materials: MeshMaterial[] = [];
  const matIndex = new Map<object, number>();
  let anyUv = false;
  let anyColor = false;

  const materialOf = (m: Material | null): number => {
    const key = m ?? matIndex;
    let idx = matIndex.get(key);
    if (idx !== undefined) return idx;
    const factor = (m?.getBaseColorFactor() ?? [1, 1, 1, 1]) as [number, number, number, number];
    const tex = m?.getBaseColorTexture();
    const image = tex?.getImage();
    const texture = tex && image ? decodeImage(image, tex.getMimeType()) : null;
    idx = materials.length;
    materials.push({ factor, texture });
    matIndex.set(key, idx);
    return idx;
  };

  const visit = (node: GNode, parent: Mat4) => {
    const world = mul(parent, nodeMatrix(node));
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue; // только TRIANGLES
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const uv = prim.getAttribute('TEXCOORD_0');
        const col = prim.getAttribute('COLOR_0');
        const base = positions.length / 3;
        const p = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, p);
          const x = p[0]!;
          const y = p[1]!;
          const z = p[2]!;
          positions.push(
            world[0]! * x + world[4]! * y + world[8]! * z + world[12]!,
            world[1]! * x + world[5]! * y + world[9]! * z + world[13]!,
            world[2]! * x + world[6]! * y + world[10]! * z + world[14]!,
          );
          if (uv) {
            const t = [0, 0];
            uv.getElement(i, t);
            uvs.push(t[0]!, t[1]!);
            anyUv = true;
          } else uvs.push(0, 0);
          if (col) {
            const c = [1, 1, 1, 1];
            col.getElement(i, c);
            colors.push(c[0]!, c[1]!, c[2]!);
            anyColor = true;
          } else colors.push(1, 1, 1);
        }
        const mi = materialOf(prim.getMaterial());
        const idx = prim.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        for (let k = 0; k + 2 < count; k += 3) {
          const a = idx ? idx.getScalar(k) : k;
          const b = idx ? idx.getScalar(k + 1) : k + 1;
          const c = idx ? idx.getScalar(k + 2) : k + 2;
          indices.push(base + a, base + b, base + c);
          triMaterial.push(mi);
        }
      }
    }
    for (const child of node.listChildren()) visit(child, world);
  };

  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) throw new Error('GLB has no scene');
  for (const n of scene.listChildren()) visit(n, IDENTITY);
  if (indices.length === 0) throw new Error('GLB has no triangles');
  return {
    positions: Float32Array.from(positions),
    uvs: anyUv ? Float32Array.from(uvs) : null,
    colors: anyColor ? Float32Array.from(colors) : null,
    indices: Uint32Array.from(indices),
    triMaterial: Uint16Array.from(triMaterial),
    materials,
  };
}

export async function loadGlbSoup(bytes: Uint8Array): Promise<TriangleSoup> {
  return documentToSoup(await readGlb(bytes));
}
