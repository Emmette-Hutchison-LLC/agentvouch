// agentvouch — Predicate adapter interface
// See PROTOCOL.md §Predicate adapters

import type { PredicateResult } from './claim.js';

export interface PredicateAdapter<Spec, Evidence = PredicateEvidence> {
  predicateType: string;
  flavor: 'revealing' | 'deterministic';
  parseSpec(rawSpec: unknown): Spec;
  evaluate(spec: Spec, evidence: Evidence): PredicateResult;
}

export interface PredicateEvidence {
  /**
   * For revealing predicates: the bytes revealed by the provider
   * (selected leaves from the Merkle tree). For deterministic predicates:
   * the committed merkle root + any bounded re-execution context.
   */
  revealedLeaves?: Uint8Array[];
  leafIndices?: number[];
  merkleRoot?: Uint8Array;
}
