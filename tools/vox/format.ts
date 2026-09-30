/**
 * Формат MagicaVoxel .vox (https://github.com/ephtracy/voxel-model): чтение одной модели
 * и запись. Узлы сцены (nTRN/nGRP/nSHP), материалы и слои игнорируются.
 */

export interface VoxModel {
  /** Размер модели в осях MagicaVoxel: X, Y (глубина), Z (вверх). */
  size: [number, number, number];
  /** Воксели: x, y, z, индекс цвета 1..255. */
  voxels: Array<[number, number, number, number]>;
  /** RGBA палитры: 256 записей, запись k — цвет индекса k + 1. */
  palette: Array<[number, number, number, number]>;
}

const text = (b: Uint8Array, o: number) =>
  String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

export function readVox(buf: Uint8Array): VoxModel {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 8 || text(buf, 0) !== 'VOX ') throw new Error('not a .vox file');
  if (text(buf, 8) !== 'MAIN') throw new Error('.vox: no MAIN chunk');
  const sizes: Array<[number, number, number]> = [];
  const models: Array<Array<[number, number, number, number]>> = [];
  let palette: VoxModel['palette'] | null = null;
  // Дочерние чанки MAIN идут подряд; вложенность глубже в формате не используется.
  let o = 8 + 12 + view.getInt32(12, true);
  while (o + 12 <= buf.length) {
    const id = text(buf, o);
    const n = view.getInt32(o + 4, true);
    const children = view.getInt32(o + 8, true);
    const c = o + 12;
    if (id === 'SIZE') {
      sizes.push([view.getInt32(c, true), view.getInt32(c + 4, true), view.getInt32(c + 8, true)]);
    } else if (id === 'XYZI') {
      const count = view.getInt32(c, true);
      const vox: Array<[number, number, number, number]> = [];
      for (let k = 0; k < count; k++) {
        const p = c + 4 + k * 4;
        vox.push([buf[p]!, buf[p + 1]!, buf[p + 2]!, buf[p + 3]!]);
      }
      models.push(vox);
    } else if (id === 'RGBA') {
      palette = [];
      for (let k = 0; k < 256; k++) {
        const p = c + k * 4;
        palette.push([buf[p]!, buf[p + 1]!, buf[p + 2]!, buf[p + 3]!]);
      }
    }
    o = c + n + children;
  }
  if (models.length === 0) throw new Error('.vox: no model');
  if (models.length > 1) {
    throw new Error(`.vox: ${models.length} моделей — для уровня нужна одна (объедините их)`);
  }
  // Без RGBA MagicaVoxel использует встроенную палитру — не угадываем, просим сохранить заново.
  if (!palette) throw new Error('.vox: нет палитры (RGBA) — пересохраните файл в MagicaVoxel');
  return { size: sizes[0]!, voxels: models[0]!, palette };
}

function chunk(id: string, content: Uint8Array, children = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(12 + content.length + children.length);
  const view = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = id.charCodeAt(k);
  view.setInt32(4, content.length, true);
  view.setInt32(8, children.length, true);
  out.set(content, 12);
  out.set(children, 12 + content.length);
  return out;
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** Запись одной модели (версия 150: SIZE, XYZI, RGBA — открывается любой версией MagicaVoxel). */
export function writeVox(model: VoxModel): Uint8Array {
  const size = new Uint8Array(12);
  const sv = new DataView(size.buffer);
  model.size.forEach((v, k) => sv.setInt32(k * 4, v, true));
  const xyzi = new Uint8Array(4 + model.voxels.length * 4);
  new DataView(xyzi.buffer).setInt32(0, model.voxels.length, true);
  model.voxels.forEach((v, k) => xyzi.set(v, 4 + k * 4));
  const rgba = new Uint8Array(256 * 4);
  model.palette.forEach((c, k) => rgba.set(c, k * 4));
  const main = chunk(
    'MAIN',
    new Uint8Array(0),
    concat([chunk('SIZE', size), chunk('XYZI', xyzi), chunk('RGBA', rgba)]),
  );
  const header = new Uint8Array(8);
  header.set([0x56, 0x4f, 0x58, 0x20]); // "VOX "
  new DataView(header.buffer).setInt32(4, 150, true);
  return concat([header, main]);
}
