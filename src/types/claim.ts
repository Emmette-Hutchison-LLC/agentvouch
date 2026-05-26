// agentvouch — VerifierClaim type
// See PROTOCOL.md §Types §VerifierClaim

import type { Hash, Signature } from './crypto.js';

export interface VerifierClaim {
  schemaVersion: string;
  contractRef: Hash;
  submissionRef: Hash;
  predicateResults: PredicateResult[];
  passed: boolean;
  evaluatedAt: string;
  signature: Signature;
}

export interface PredicateResult {
  predicateIndex: number;
  passed: boolean;
  detail?: string;
}
