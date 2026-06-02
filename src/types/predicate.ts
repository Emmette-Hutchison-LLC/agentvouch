// agentvouch — Predicate adapter interface
// See PROTOCOL.md §Predicate adapters

import type { PredicateResult } from './claim.js';

/**
 * What an adapter returns: the pass/fail outcome and an optional human-readable
 * detail. The adapter does NOT set `predicateIndex` — it has no knowledge of its
 * position in `Contract.predicates`; the evaluator stamps that when assembling
 * the VerifierClaim.
 */
export type PredicateOutcome = Omit<PredicateResult, 'predicateIndex'>;

export interface PredicateAdapter<Spec, Evidence = PredicateEvidence> {
  predicateType: string;
  flavor: 'revealing' | 'deterministic';
  parseSpec(rawSpec: unknown): Spec;
  evaluate(spec: Spec, evidence: Evidence): PredicateOutcome;
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
