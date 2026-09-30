import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decodeBitset,
  decodeRle,
  encodeBitset,
  encodeRle,
} from '../../src/core/codec';
import { mulberry32 } from '../../src/core/rng';

describe('codec', () => {
  it('base64 совпадает с Buffer и обратим', () => {
    const rng = mulberry32(7);
    for (let len = 0; len < 40; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = Math.floor(rng() * 256);
      const s = bytesToBase64(bytes);
      expect(s).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(base64ToBytes(s))).toEqual(Array.from(bytes));
    }
    expect(() => base64ToBytes('A')).toThrow();
    expect(() => base64ToBytes('AB$=')).toThrow();
    expect(() => base64ToBytes('ABЖ=')).toThrow();
  });

  it('RLE обратим, длинные серии через varint', () => {
    const rng = mulberry32(3);
    for (let iter = 0; iter < 50; iter++) {
      const n = Math.floor(rng() * 2000);
      const v = new Uint8Array(n);
      let cur = 0;
      for (let i = 0; i < n; i++) {
        if (rng() < 0.05) cur = Math.floor(rng() * 7);
        v[i] = cur;
      }
      expect(Array.from(decodeRle(encodeRle(v), n))).toEqual(Array.from(v));
    }
    const long = new Uint8Array(1000);
    expect(encodeRle(long).length).toBeLessThan(8);
  });

  it('RLE: ошибки формата', () => {
    const s = encodeRle(Uint8Array.from([1, 1, 2]));
    expect(() => decodeRle(s, 4)).toThrow();
    expect(() => decodeRle(s, 2)).toThrow();
    expect(() => decodeRle(bytesToBase64(Uint8Array.from([0x80])), 1)).toThrow(/truncated/);
    expect(() => decodeRle(bytesToBase64(Uint8Array.from([3])), 3)).toThrow(/truncated/);
    expect(() => decodeRle(bytesToBase64(Uint8Array.from([0, 1])), 3)).toThrow();
  });

  it('битсеты обратимы', () => {
    const rng = mulberry32(11);
    for (let n = 0; n < 70; n++) {
      const f = new Uint8Array(n);
      for (let i = 0; i < n; i++) f[i] = rng() < 0.3 ? 1 : 0;
      expect(Array.from(decodeBitset(encodeBitset(f), n))).toEqual(Array.from(f));
    }
    expect(Array.from(decodeBitset('', 5))).toEqual([0, 0, 0, 0, 0]);
    expect(() => decodeBitset(encodeBitset(new Uint8Array(20)), 5)).toThrow();
  });
});
