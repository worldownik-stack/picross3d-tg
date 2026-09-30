import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three';
import { GROUPS_MANY, GROUPS_TWO, type CluePart, type LineClue } from '../core/clues';

/**
 * Атлас глифов подсказок (§7): генерируется в рантайме через Canvas2D нашим шрифтом.
 * Статические слоты: пустой глиф, обычные 0–15, в кружке 2–15, в квадрате 3–15,
 * трещина. Остальные слоты выделяются по запросу — для цветных и двойных чисел
 * Round 2 (`glyphFor` с частями других цветов).
 */
export const ATLAS_SIZE = 1024;
export const CELL = 128;
export const COLS = ATLAS_SIZE / CELL;
export const ROWS = ATLAS_SIZE / CELL;
export const MAX_NUMBER = 15;

export const GLYPH_EMPTY = 0;
const PLAIN_BASE = 1; // 1..16  → 0..15
const CIRCLE_BASE = PLAIN_BASE + MAX_NUMBER + 1; // 17..30 → 2..15
const SQUARE_BASE = CIRCLE_BASE + MAX_NUMBER - 1; // 31..43 → 3..15
export const GLYPH_CRACK = SQUARE_BASE + MAX_NUMBER - 2; // 44
const DYNAMIC_BASE = GLYPH_CRACK + 1;

export const INK = '#4b3323';
const FONT = "'Nunito', system-ui, sans-serif";

/** Индекс статического глифа классической подсказки. */
export function classicGlyph(part: CluePart): number {
  const n = Math.min(MAX_NUMBER, part.count);
  if (part.groups === GROUPS_TWO) return CIRCLE_BASE + Math.max(0, n - 2);
  if (part.groups === GROUPS_MANY) return SQUARE_BASE + Math.max(0, n - 3);
  return PLAIN_BASE + n;
}

export class GlyphAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dynamic = new Map<string, number>();
  private nextDynamic = DYNAMIC_BASE;

  constructor(
    anisotropy = 4,
    private readonly colors: readonly string[] = [INK],
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas is unavailable');
    this.ctx = ctx;
    this.drawStatic();
    this.texture = new CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.anisotropy = anisotropy;
    this.texture.colorSpace = NoColorSpace;
  }

  /**
   * Глиф подсказки линии. Классическая (одна часть цвета 1) — статический слот;
   * цветные и двойные — динамический слот (задел под Round 2).
   */
  glyphFor(clue: LineClue, hidden: boolean): number {
    if (hidden) return GLYPH_EMPTY;
    const parts = clue.parts;
    if (parts.length === 1 && parts[0]!.color === 1) return classicGlyph(parts[0]!);
    const key = parts.map((p) => `${p.color}:${p.count}:${p.groups}`).join('|');
    let idx = this.dynamic.get(key);
    if (idx === undefined) {
      if (this.nextDynamic >= COLS * ROWS) return classicGlyph(parts[0]!);
      idx = this.nextDynamic++;
      this.dynamic.set(key, idx);
      this.drawParts(idx, parts);
      this.texture.needsUpdate = true;
    }
    return idx;
  }

  dispose(): void {
    this.texture.dispose();
  }

  private drawStatic(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    for (let n = 0; n <= MAX_NUMBER; n++) this.drawNumber(PLAIN_BASE + n, n, 1, INK);
    for (let n = 2; n <= MAX_NUMBER; n++) this.drawNumber(CIRCLE_BASE + n - 2, n, 2, INK);
    for (let n = 3; n <= MAX_NUMBER; n++) this.drawNumber(SQUARE_BASE + n - 3, n, 3, INK);
    this.drawCrack(GLYPH_CRACK);
  }

  private origin(idx: number): [number, number] {
    return [(idx % COLS) * CELL, Math.floor(idx / COLS) * CELL];
  }

  private drawNumber(
    idx: number,
    n: number,
    groups: number,
    color: string,
    scale = 1,
    cx = 0.5,
    cy = 0.5,
  ): void {
    const ctx = this.ctx;
    const [ox, oy] = this.origin(idx);
    const x = ox + cx * CELL;
    const y = oy + cy * CELL;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    const lw = CELL * 0.07 * scale;
    ctx.lineWidth = lw;
    let fontPx = CELL * 0.66 * scale;
    let maxW = CELL * 0.74 * scale;
    if (groups === 2) {
      ctx.beginPath();
      ctx.arc(x, y, CELL * 0.4 * scale, 0, Math.PI * 2);
      ctx.stroke();
      fontPx = CELL * 0.5 * scale;
      maxW = CELL * 0.52 * scale;
    } else if (groups === 3) {
      const s = CELL * 0.78 * scale;
      roundRect(ctx, x - s / 2, y - s / 2, s, s, CELL * 0.12 * scale);
      ctx.stroke();
      fontPx = CELL * 0.5 * scale;
      maxW = CELL * 0.56 * scale;
    }
    ctx.font = `900 ${fontPx}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = String(n);
    const w = ctx.measureText(text).width;
    const sx = w > maxW ? maxW / w : 1;
    ctx.translate(x, y + fontPx * 0.05);
    ctx.scale(sx, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private drawParts(idx: number, parts: readonly CluePart[]): void {
    const two = parts.length > 1;
    parts.slice(0, 2).forEach((p, k) => {
      const color = this.colors[p.color - 1] ?? INK;
      if (two)
        this.drawNumber(
          idx,
          p.count,
          p.groups,
          color,
          0.55,
          k === 0 ? 0.3 : 0.7,
          k === 0 ? 0.3 : 0.7,
        );
      else this.drawNumber(idx, p.count, p.groups, color);
    });
  }

  private drawCrack(idx: number): void {
    const ctx = this.ctx;
    const [ox, oy] = this.origin(idx);
    const P = (u: number, v: number): [number, number] => [ox + u * CELL, oy + v * CELL];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const paths: Array<Array<[number, number]>> = [
      [P(0.08, 0.3), P(0.3, 0.38), P(0.42, 0.27), P(0.58, 0.5), P(0.74, 0.44), P(0.92, 0.62)],
      [P(0.42, 0.27), P(0.47, 0.06)],
      [P(0.58, 0.5), P(0.52, 0.72), P(0.62, 0.94)],
      [P(0.3, 0.38), P(0.2, 0.62)],
    ];
    // Маска трещины (цвет задаёт шейдер).
    ctx.lineWidth = CELL * 0.07;
    ctx.strokeStyle = '#ffffff';
    for (const path of paths) {
      ctx.beginPath();
      path.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
