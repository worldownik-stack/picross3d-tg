import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import type { Rgb, RgbaImage } from './types';

/** Декодирование PNG/JPEG из байтов GLB (чистый JS, без нативных зависимостей). */
export function decodeImage(bytes: Uint8Array, mime: string): RgbaImage {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (mime === 'image/jpeg' || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  }
  throw new Error(`unsupported texture format ${mime}`);
}

/**
 * Билинейная выборка sRGB-цвета (0..1). UV за пределами [0, 1) повторяются, но соседние
 * тексели у краёв зажимаются: иначе у полюсов подмешивается противоположный край атласа.
 * (0,0) — левый верхний угол.
 */
export function sampleImage(img: RgbaImage, u: number, v: number): Rgb {
  const fu = (u - Math.floor(u)) * img.width - 0.5;
  const fv = (v - Math.floor(v)) * img.height - 0.5;
  const x0 = Math.floor(fu);
  const y0 = Math.floor(fv);
  const tx = fu - x0;
  const ty = fv - y0;
  const out: Rgb = [0, 0, 0];
  for (const [dx, dy, w] of [
    [0, 0, (1 - tx) * (1 - ty)],
    [1, 0, tx * (1 - ty)],
    [0, 1, (1 - tx) * ty],
    [1, 1, tx * ty],
  ] as const) {
    const x = Math.min(img.width - 1, Math.max(0, x0 + dx));
    const y = Math.min(img.height - 1, Math.max(0, y0 + dy));
    const i = (y * img.width + x) * 4;
    out[0] += (img.data[i]! / 255) * w;
    out[1] += (img.data[i + 1]! / 255) * w;
    out[2] += (img.data[i + 2]! / 255) * w;
  }
  return out;
}
