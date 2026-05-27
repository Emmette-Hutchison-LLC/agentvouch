// Merkle tree — commit + selective reveal + proof verification.
// See PROTOCOL.md §Merkle commitment scheme.
//
// Domain separation per RFC 6962:
//   leaf hash:     SHA-256(0x00 || leaf_bytes)
//   internal hash: SHA-256(0x01 || left_hash || right_hash)
//
// Padding: empty leaves are 32 zero bytes (0x00...00), padded to the next power
// of 2 above the leaf count. Padded leaves go through the same LeafHash as real
// leaves — they are NOT pre-hashed.

import type { Hash } from '../types/crypto.js';
import type { MerkleProof } from '../types/submission.js';
import { sha256 } from '../util/hash.js';
import { bytesToHex, hexToBytes, concatBytes } from '../util/hex.js';

const LEAF_PREFIX = new Uint8Array([0x00]);
const INTERNAL_PREFIX = new Uint8Array([0x01]);

const HASH_BYTES = 32;
const EMPTY_LEAF: Uint8Array = new Uint8Array(HASH_BYTES);

function leafHash(leaf: Uint8Array): Uint8Array {
  return sha256(concatBytes(LEAF_PREFIX, leaf));
}

function internalHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concatBytes(INTERNAL_PREFIX, left, right));
}

function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return 1 << Math.ceil(Math.log2(n));
}

function padLeavesToPowerOf2(leaves: Uint8Array[]): Uint8Array[] {
  const target = nextPowerOf2(leaves.length);
  if (target === leaves.length) return leaves;
  const padded = [...leaves];
  while (padded.length < target) padded.push(EMPTY_LEAF);
  return padded;
}

/**
 * Compute the Merkle root over the given leaves.
 *
 * Special case: empty leaf array returns SHA-256 of empty input (RFC 6962 §2.1).
 * One-leaf case: returns the leaf hash directly.
 *
 * Returns 0x-prefixed hex string (66 chars).
 */
export function merkleRoot(leaves: Uint8Array[]): Hash {
  if (leaves.length === 0) {
    // RFC 6962 §2.1: MTH({}) = SHA-256(empty)
    return bytesToHex(sha256(new Uint8Array(0)));
  }

  const padded = padLeavesToPowerOf2(leaves);
  let level: Uint8Array[] = padded.map(leafHash);

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(internalHash(level[i], level[i + 1]));
    }
    level = next;
  }

  return bytesToHex(level[0]);
}

/**
 * Compute an inclusion proof for the leaf at `leafIndex`.
 *
 * Returned proof: { leafIndex, siblings[] } where `siblings` is ordered from
 * the leaf upward to (but excluding) the root.
 */
export function merkleProof(leaves: Uint8Array[], leafIndex: number): MerkleProof {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`merkleProof: leafIndex ${leafIndex} out of range [0, ${leaves.length})`);
  }

  const padded = padLeavesToPowerOf2(leaves);
  let level: Uint8Array[] = padded.map(leafHash);
  const siblings: Hash[] = [];
  let index = leafIndex;

  while (level.length > 1) {
    const siblingIdx = index ^ 1; // flip the low bit
    siblings.push(bytesToHex(level[siblingIdx]));

    // Compute next level up
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(internalHash(level[i], level[i + 1]));
    }
    level = next;
    index = index >> 1;
  }

  return { leafIndex, siblings };
}

/**
 * Verify an inclusion proof: does the given `leaf` belong to the tree with `expectedRoot`,
 * at the position recorded in `proof.leafIndex`?
 *
 * Returns true if the proof reconstructs `expectedRoot` from the leaf and siblings.
 */
export function verifyMerkleProof(
  leaf: Uint8Array,
  proof: MerkleProof,
  expectedRoot: Hash
): boolean {
  if (proof.leafIndex < 0) return false;

  let current = leafHash(leaf);
  let index = proof.leafIndex;

  for (const siblingHex of proof.siblings) {
    const sibling = hexToBytes(siblingHex);
    if (sibling.length !== HASH_BYTES) return false;

    // index is even → current is left child; odd → current is right child
    if ((index & 1) === 0) {
      current = internalHash(current, sibling);
    } else {
      current = internalHash(sibling, current);
    }
    index = index >> 1;
  }

  return bytesToHex(current) === expectedRoot;
}
