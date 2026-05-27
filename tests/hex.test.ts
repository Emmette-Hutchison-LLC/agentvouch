// Hex encoding tests

import { describe, it, expect } from 'vitest';
import { bytesToHex, hexToBytes, concatBytes } from '../src/util/hex.js';

describe('bytesToHex', () => {
  it('empty array → "0x"', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('0x');
  });

  it('single byte 0xab', () => {
    expect(bytesToHex(new Uint8Array([0xab]))).toBe('0xab');
  });

  it('preserves leading zeros', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x01, 0x02]))).toBe('0x000102');
  });

  it('32-byte hash produces 66-char string', () => {
    const bytes = new Uint8Array(32);
    expect(bytesToHex(bytes)).toHaveLength(66);
  });
});

describe('hexToBytes', () => {
  it('accepts 0x prefix', () => {
    expect(Array.from(hexToBytes('0xab'))).toEqual([0xab]);
  });

  it('accepts no prefix', () => {
    expect(Array.from(hexToBytes('ab'))).toEqual([0xab]);
  });

  it('round-trips with bytesToHex', () => {
    const original = new Uint8Array([0x00, 0x7f, 0xff, 0xa5, 0x5a]);
    const hex = bytesToHex(original);
    const back = hexToBytes(hex);
    expect(Array.from(back)).toEqual(Array.from(original));
  });

  it('throws on odd-length hex', () => {
    expect(() => hexToBytes('0xabc')).toThrow(/odd-length/);
  });

  it('throws on non-hex characters', () => {
    expect(() => hexToBytes('0xzz')).toThrow(/non-hex/);
  });
});

describe('concatBytes', () => {
  it('concatenates multiple arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5]);
    expect(Array.from(concatBytes(a, b, c))).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles empty arrays', () => {
    expect(Array.from(concatBytes(new Uint8Array(0)))).toEqual([]);
    expect(Array.from(concatBytes(new Uint8Array(0), new Uint8Array([1])))).toEqual([1]);
  });
});
