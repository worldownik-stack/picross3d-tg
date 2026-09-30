/** Кодеки формата уровней: base64, RLE, битсеты (§5.1). Без зависимостей от среды. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[(n >> 18) & 63]! +
      ALPHABET[(n >> 12) & 63]! +
      ALPHABET[(n >> 6) & 63]! +
      ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  if (clean.length % 4 === 1) throw new Error('bad base64 length');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    let n = 0;
    const chunk = Math.min(4, clean.length - i);
    for (let j = 0; j < 4; j++) {
      let v = 0;
      if (j < chunk) {
        const c = clean.charCodeAt(i + j);
        v = c < 128 ? LOOKUP[c]! : -1;
        if (v < 0) throw new Error(`bad base64 char at ${i + j}`);
      }
      n = (n << 6) | v;
    }
    out[o++] = (n >> 16) & 255;
    if (chunk > 2) out[o++] = (n >> 8) & 255;
    if (chunk > 3) out[o++] = n & 255;
  }
  return out;
}

/** RLE: последовательность пар (varint длины серии, байт значения) → base64. */
export function encodeRle(values: Uint8Array): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i]!;
    let run = 1;
    while (i + run < values.length && values[i + run] === v) run++;
    let r = run;
    while (r >= 0x80) {
      bytes.push((r & 0x7f) | 0x80);
      r >>>= 7;
    }
    bytes.push(r);
    bytes.push(v);
    i += run;
  }
  return bytesToBase64(Uint8Array.from(bytes));
}

export function decodeRle(s: string, length: number): Uint8Array {
  const bytes = base64ToBytes(s);
  const out = new Uint8Array(length);
  let o = 0;
  let p = 0;
  while (p < bytes.length) {
    let run = 0;
    let shift = 0;
    for (;;) {
      if (p >= bytes.length) throw new Error('truncated RLE');
      const b = bytes[p++]!;
      run |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    if (p >= bytes.length) throw new Error('truncated RLE');
    const v = bytes[p++]!;
    if (run === 0 || o + run > length) throw new Error('RLE length mismatch');
    out.fill(v, o, o + run);
    o += run;
  }
  if (o !== length) throw new Error(`RLE decoded ${o} of ${length} cells`);
  return out;
}

/** Битсет (LSB первым) из флагов 0/1 → base64. */
export function encodeBitset(flags: ArrayLike<number>): string {
  const bytes = new Uint8Array(Math.ceil(flags.length / 8));
  for (let i = 0; i < flags.length; i++) if (flags[i]) bytes[i >> 3]! |= 1 << (i & 7);
  return bytesToBase64(bytes);
}

export function decodeBitset(s: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (!s) return out;
  const bytes = base64ToBytes(s);
  if (bytes.length !== Math.ceil(length / 8)) throw new Error('bitset length mismatch');
  for (let i = 0; i < length; i++) out[i] = (bytes[i >> 3]! >> (i & 7)) & 1;
  return out;
}
