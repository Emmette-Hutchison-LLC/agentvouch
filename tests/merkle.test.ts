// Merkle tree tests
// See PROTOCOL.md §Merkle commitment scheme

import { describe, it, expect } from 'vitest';
import { merkleRoot, merkleProof, verifyMerkleProof } from '../src/merkle/tree.js';
import { sha256 } from '../src/util/hash.js';
import { bytesToHex, concatBytes } from '../src/util/hex.js';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

// Helpers that mirror the implementation, for hand-computed test vectors
const leafHash = (leaf: Uint8Array) => sha256(concatBytes(new Uint8Array([0x00]), leaf));
const internalHash = (l: Uint8Array, r: Uint8Array) => sha256(concatBytes(new Uint8Array([0x01]), l, r));

describe('merkleRoot', () => {
  it('empty input returns SHA-256 of empty (RFC 6962 §2.1)', () => {
    const expected = bytesToHex(sha256(new Uint8Array(0)));
    expect(merkleRoot([])).toBe(expected);
  });

  it('one leaf returns its leaf hash', () => {
    const leaf = utf8('hello');
    const expected = bytesToHex(leafHash(leaf));
    expect(merkleRoot([leaf])).toBe(expected);
  });

  it('two leaves: InternalHash(LeafHash(a), LeafHash(b))', () => {
    const a = utf8('a');
    const b = utf8('b');
    const expected = bytesToHex(internalHash(leafHash(a), leafHash(b)));
    expect(merkleRoot([a, b])).toBe(expected);
  });

  it('three leaves pad to 4 with empty leaf, then build', () => {
    const a = utf8('a');
    const b = utf8('b');
    const c = utf8('c');
    const empty = new Uint8Array(32);
    const expected = bytesToHex(
      internalHash(
        internalHash(leafHash(a), leafHash(b)),
        internalHash(leafHash(c), leafHash(empty))
      )
    );
    expect(merkleRoot([a, b, c])).toBe(expected);
  });

  it('four leaves: a balanced tree', () => {
    const a = utf8('a');
    const b = utf8('b');
    const c = utf8('c');
    const d = utf8('d');
    const expected = bytesToHex(
      internalHash(
        internalHash(leafHash(a), leafHash(b)),
        internalHash(leafHash(c), leafHash(d))
      )
    );
    expect(merkleRoot([a, b, c, d])).toBe(expected);
  });

  it('different leaves produce different roots', () => {
    expect(merkleRoot([utf8('a')])).not.toBe(merkleRoot([utf8('b')]));
  });

  it('same leaves in different order produce different roots', () => {
    const a = utf8('a');
    const b = utf8('b');
    expect(merkleRoot([a, b])).not.toBe(merkleRoot([b, a]));
  });
});

describe('merkleProof + verifyMerkleProof', () => {
  it('proof for the only leaf has zero siblings', () => {
    const leaves = [utf8('hello')];
    const proof = merkleProof(leaves, 0);
    expect(proof.leafIndex).toBe(0);
    expect(proof.siblings).toHaveLength(0);
    expect(verifyMerkleProof(leaves[0], proof, merkleRoot(leaves))).toBe(true);
  });

  it('proof for index 0 of 2 leaves has one sibling (leaf 1)', () => {
    const leaves = [utf8('a'), utf8('b')];
    const proof = merkleProof(leaves, 0);
    expect(proof.siblings).toHaveLength(1);
    expect(verifyMerkleProof(leaves[0], proof, merkleRoot(leaves))).toBe(true);
  });

  it('round-trips for every leaf at every tree size 1..8', () => {
    for (let n = 1; n <= 8; n++) {
      const leaves = Array.from({ length: n }, (_, i) => utf8(`leaf-${i}`));
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        const proof = merkleProof(leaves, i);
        expect(verifyMerkleProof(leaves[i], proof, root)).toBe(true);
      }
    }
  });

  it('verify rejects when the wrong leaf is supplied', () => {
    const leaves = [utf8('a'), utf8('b'), utf8('c'), utf8('d')];
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 0);
    expect(verifyMerkleProof(utf8('not-a'), proof, root)).toBe(false);
  });

  it('verify rejects when the proof is for the wrong index', () => {
    const leaves = [utf8('a'), utf8('b'), utf8('c'), utf8('d')];
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 0);
    // Use leaf 0's proof but claim it's at index 1
    const tampered = { ...proof, leafIndex: 1 };
    expect(verifyMerkleProof(leaves[0], tampered, root)).toBe(false);
  });

  it('verify rejects when a sibling is tampered with', () => {
    const leaves = [utf8('a'), utf8('b'), utf8('c'), utf8('d')];
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 0);
    const tampered = {
      ...proof,
      siblings: [
        '0x' + '00'.repeat(32),
        ...proof.siblings.slice(1),
      ],
    };
    expect(verifyMerkleProof(leaves[0], tampered, root)).toBe(false);
  });

  it('verify rejects against the wrong root', () => {
    const leaves = [utf8('a'), utf8('b')];
    const proof = merkleProof(leaves, 0);
    const wrongRoot = '0x' + 'ff'.repeat(32);
    expect(verifyMerkleProof(leaves[0], proof, wrongRoot)).toBe(false);
  });
});

describe('merkleProof bounds', () => {
  it('throws on negative index', () => {
    expect(() => merkleProof([utf8('a')], -1)).toThrow(/out of range/);
  });

  it('throws on index >= length', () => {
    expect(() => merkleProof([utf8('a'), utf8('b')], 2)).toThrow(/out of range/);
  });
});
