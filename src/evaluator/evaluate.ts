// agentvouch — Evaluator
// See PROTOCOL.md §Conceptual model + §Wire protocol §Sequence

import type { Contract } from '../types/contract.js';
import type { Submission, Reveal } from '../types/submission.js';
import type { VerifierClaim } from '../types/claim.js';
import type { KeyPair } from '../signing/ed25519.js';

export interface EvaluateOptions {
  /**
   * Callback the evaluator uses to request selective reveals from the provider.
   * For local use (single-process), this is a direct function call. For HTTP
   * or A2A transports, this wraps the network round-trip.
   */
  requestReveal: (predicateIndex: number, leafIndices: number[]) => Promise<Reveal>;
}

// TODO(v0): implement the evaluate function.
// For W22 scaffolding pass: signature only; impl in next session.

export async function evaluate(
  _contract: Contract,
  _submission: Submission,
  _evaluatorKeyPair: KeyPair,
  _options: EvaluateOptions
): Promise<VerifierClaim> {
  throw new Error('evaluate: not implemented yet (see PROTOCOL.md §Wire protocol)');
}
