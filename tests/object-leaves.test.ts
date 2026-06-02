// Object → Merkle-leaf encoding tests
// See PROTOCOL.md §Merkle commitment scheme: "leaves are the top-level entries
// in object-key-sorted order".

import { describe, it, expect } from 'vitest';
import { objectToLeaves, leavesToObject } from '../src/merkle/object-leaves.js';
import { canonicalize } from '../src/util/canonical.js';

const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('objectToLeaves', () => {
  it('emits one leaf per top-level entry, in key-sorted order', () => {
    const { leaves, keys } = objectToLeaves({ summary: 'hi', approved: true, wordCount: 4 });
    expect(keys).toEqual(['approved', 'summary', 'wordCount']);
    expect(leaves).toHaveLength(3);
  });

  it('encodes each leaf as canonical([key, value])', () => {
    const { leaves } = objectToLeaves({ b: 2, a: 1 });
    expect(decode(leaves[0])).toBe(canonicalize(['a', 1]));
    expect(decode(leaves[1])).toBe(canonicalize(['b', 2]));
  });

  it('handles an empty object as zero leaves', () => {
    const { leaves, keys } = objectToLeaves({});
    expect(leaves).toEqual([]);
    expect(keys).toEqual([]);
  });
});

describe('leavesToObject', () => {
  it('round-trips an object through encode → decode', () => {
    const original = { summary: 'a concise summary', wordCount: 4, approved: true };
    const { leaves } = objectToLeaves(original);
    expect(leavesToObject(leaves)).toEqual(original);
  });

  it('round-trips nested values', () => {
    const original = { tags: ['x', 'y'], meta: { score: 3 } };
    const { leaves } = objectToLeaves(original);
    expect(leavesToObject(leaves)).toEqual(original);
  });

  it('reconstructs a partial object from a subset of leaves (selective disclosure)', () => {
    const { leaves } = objectToLeaves({ a: 1, b: 2, c: 3 });
    // reveal only leaves 0 and 2 (keys "a" and "c")
    expect(leavesToObject([leaves[0], leaves[2]])).toEqual({ a: 1, c: 3 });
  });

  it('throws on a malformed leaf (not a [key, value] tuple)', () => {
    const bad = new TextEncoder().encode(canonicalize({ not: 'a tuple' }));
    expect(() => leavesToObject([bad])).toThrow(/leaf/i);
  });

  it('throws on a leaf whose key is not a string', () => {
    const bad = new TextEncoder().encode(canonicalize([1, 'value']));
    expect(() => leavesToObject([bad])).toThrow(/key/i);
  });

  it('rejects dangerous prototype-manipulating keys', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const bad = new TextEncoder().encode(canonicalize([key, { polluted: true }]));
      expect(() => leavesToObject([bad])).toThrow(/unsafe|proto|key/i);
    }
    // And confirm no global pollution occurred as a side effect.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
