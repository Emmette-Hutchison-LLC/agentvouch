// Canonical JSON tests
// See PROTOCOL.md §Signing scheme §Canonical serialization

import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalizeBytes } from '../src/util/canonical.js';

describe('canonicalize — primitive values', () => {
  it('null', () => expect(canonicalize(null)).toBe('null'));
  it('true', () => expect(canonicalize(true)).toBe('true'));
  it('false', () => expect(canonicalize(false)).toBe('false'));
  it('integer', () => expect(canonicalize(42)).toBe('42'));
  it('negative integer', () => expect(canonicalize(-7)).toBe('-7'));
  it('float', () => expect(canonicalize(1.5)).toBe('1.5'));
  it('zero', () => expect(canonicalize(0)).toBe('0'));
  it('string', () => expect(canonicalize('hello')).toBe('"hello"'));
  it('string with quote', () => expect(canonicalize('he said "hi"')).toBe('"he said \\"hi\\""'));
  it('string with newline', () => expect(canonicalize('a\nb')).toBe('"a\\nb"'));
  it('empty string', () => expect(canonicalize('')).toBe('""'));
});

describe('canonicalize — arrays', () => {
  it('empty array', () => expect(canonicalize([])).toBe('[]'));
  it('flat array', () => expect(canonicalize([1, 2, 3])).toBe('[1,2,3]'));
  it('array preserves order (not sorted)', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });
  it('nested array', () => {
    expect(canonicalize([1, [2, 3], 4])).toBe('[1,[2,3],4]');
  });
});

describe('canonicalize — objects (keys sorted)', () => {
  it('empty object', () => expect(canonicalize({})).toBe('{}'));

  it('single key', () => {
    expect(canonicalize({ a: 1 })).toBe('{"a":1}');
  });

  it('multiple keys sorted alphabetically', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('nested object — inner keys also sorted', () => {
    expect(canonicalize({ z: { b: 2, a: 1 }, a: 1 })).toBe('{"a":1,"z":{"a":1,"b":2}}');
  });

  it('mixed types within object', () => {
    expect(canonicalize({ list: [3, 1], val: 'x', flag: true })).toBe(
      '{"flag":true,"list":[3,1],"val":"x"}'
    );
  });
});

describe('canonicalize — error cases', () => {
  it('throws on NaN', () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/);
  });

  it('throws on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/);
  });

  it('throws on undefined', () => {
    expect(() => canonicalize(undefined)).toThrow(/unserializable/);
  });

  it('throws on function', () => {
    expect(() => canonicalize(() => 1)).toThrow(/unserializable/);
  });
});

describe('canonicalize — determinism (same value → same output)', () => {
  it('two objects with keys in different insertion order produce identical output', () => {
    const a = canonicalize({ x: 1, y: 2, z: 3 });
    const b = canonicalize({ z: 3, y: 2, x: 1 });
    const c = canonicalize({ y: 2, z: 3, x: 1 });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('canonicalizeBytes', () => {
  it('produces UTF-8 Uint8Array of canonical string', () => {
    const bytes = canonicalizeBytes({ b: 2, a: 1 });
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('{"a":1,"b":2}');
  });

  it('handles non-ASCII strings (UTF-8 encoding)', () => {
    const bytes = canonicalizeBytes({ greeting: 'héllo' });
    // 'héllo' has é = 0xC3 0xA9 in UTF-8
    expect(bytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes)).toContain('héllo');
  });
});
