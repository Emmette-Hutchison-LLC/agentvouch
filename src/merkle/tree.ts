// agentvouch — Merkle tree (commit + selective reveal)
// See PROTOCOL.md §Merkle commitment scheme
//
// Domain separation per RFC 6962:
//   leaf hash:     SHA-256(0x00 || leaf_bytes)
//   internal hash: SHA-256(0x01 || left_hash || right_hash)

import type { Hash } from '../types/crypto.js';
import type { MerkleProof } from '../types/submission.js';

// TODO(v0): implement actual Merkle tree + proof generation.
// For W22 scaffolding pass: stubs with type signatures; impl in next session.

export function merkleRoot(_leaves: Uint8Array[]): Hash {
  throw new Error('merkleRoot: not implemented yet (see PROTOCOL.md §Merkle)');
}

export function merkleProof(_leaves: Uint8Array[], _leafIndex: number): MerkleProof {
  throw new Error('merkleProof: not implemented yet (see PROTOCOL.md §Merkle)');
}

export function verifyMerkleProof(
  _leaf: Uint8Array,
  _proof: MerkleProof,
  _expectedRoot: Hash
): boolean {
  throw new Error('verifyMerkleProof: not implemented yet (see PROTOCOL.md §Merkle)');
}
