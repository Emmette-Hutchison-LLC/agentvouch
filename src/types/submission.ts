// agentvouch — Submission + Reveal types
// See PROTOCOL.md §Types §Submission and §Reveal

import type { Hash, Signature } from './crypto.js';

export interface Submission {
  schemaVersion: string;
  contractRef: Hash;
  merkleRoot: Hash;
  leafCount: number;
  receipt: {
    timestamp: string;
    providerNote?: string;
  };
  signature: Signature;
}

export interface MerkleProof {
  leafIndex: number;
  siblings: Hash[];
}

export interface Reveal {
  submissionRef: Hash;
  predicateIndex: number;
  leafIndices: number[];
  leaves: Uint8Array[];
  proofs: MerkleProof[];
}
