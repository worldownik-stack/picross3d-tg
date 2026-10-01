/**
 * `npm run props`: реквизит из Meshy (Приложение А.3) — content/meshy/raw/<id>.glb →
 * public/<out> по content/meshy/props.json.
 *
 * Нормализация: центр по X/Z, верх на y = 0 (на нём стоит фигура), радиус по X/Z = 1.
 * Радиус верхней площадки пишется в extras узла (`topRadius`, в three — `userData`).
 * Затем упрощение до `maxTriangles`, текстура 512 px WebP (или ровный `color` вместо неё), квантование вершин
 * (KHR_mesh_quantization — three читает без декодера).
 */
import { NodeIO, getBounds, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join,
  prune,
  quantize,
  simplify,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

interface Prop {
  out: string;
  maxTriangles: number;
  /** Ровный цвет вместо текстуры Meshy (например, без прожилок мрамора), #rrggbb. */
  color?: string;
}

const TEXTURE = 512;
/** Верхняя площадка — вершины в верхних TOP_BAND высоты модели. */
const TOP_BAND = 0.04;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

type Mat4 = number[];

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}

/** Запечь `m` поверх мировых матриц в вершины; узлы — единичные. */
function bake(doc: Document, m: Mat4): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    transformMesh(mesh, mul(m, node.getWorldMatrix() as unknown as Mat4) as never);
    node.setMatrix(IDENTITY as never);
  }
}

function triangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives())
      n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3;
  return n;
}

/** Наибольшее расстояние от оси Y среди вершин у верха модели. */
function topRadius(doc: Document, height: number): number {
  let r = 0;
  const v = [0, 0, 0];
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION')!;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        if (v[1]! >= -height * TOP_BAND) r = Math.max(r, Math.hypot(v[0]!, v[2]!));
      }
    }
  return r;
}

const props = JSON.parse(readFileSync('content/meshy/props.json', 'utf8')) as Record<string, Prop>;
const only = new Set(process.argv.slice(2));
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let failed = false;
for (const [id, prop] of Object.entries(props)) {
  if (only.size && !only.has(id)) continue;
  const raw = `content/meshy/raw/${id}.glb`;
  if (!existsSync(raw)) {
    console.error(`${id}: нет ${raw}`);
    failed = true;
    continue;
  }
  const doc = await io.readBinary(new Uint8Array(readFileSync(raw)));
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  await doc.transform(flatten());
  bake(doc, IDENTITY);
  const b = getBounds(scene);
  const s = 2 / Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  bake(doc, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -cx * s, -b.max[1] * s, -cz * s, 1]);
  const height = (b.max[1] - b.min[1]) * s;
  const before = triangles(doc);
  if (prop.color) {
    const n = parseInt(prop.color.slice(1), 16);
    const lin = (v: number) => ((v / 255 + 0.055) / 1.055) ** 2.4;
    for (const m of doc.getRoot().listMaterials()) {
      m.setBaseColorTexture(null);
      m.setBaseColorFactor([lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255), 1]);
    }
  }
  await doc.transform(
    dedup(),
    join(),
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: Math.min(1, prop.maxTriangles / before),
      error: 0.005,
    }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE, TEXTURE] }),
    prune({ keepAttributes: false }),
  );
  const top = topRadius(doc, height);
  for (const node of doc.getRoot().listNodes())
    if (node.getMesh()) node.setExtras({ topRadius: +top.toFixed(4), height: +height.toFixed(4) });
  await doc.transform(quantize());
  const out = `public/${prop.out}`;
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  const tris = triangles(doc);
  const kb = statSync(out).size / 1024;
  console.log(
    `${id}: ${Math.round(before)} → ${Math.round(tris)} треуг., высота ${height.toFixed(2)}, площадка r ${top.toFixed(2)}, ${kb.toFixed(0)} КБ`,
  );
  if (tris > prop.maxTriangles) failed = true;
}
if (failed) process.exitCode = 1;
