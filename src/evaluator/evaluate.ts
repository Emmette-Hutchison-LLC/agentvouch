// agentvouch — Evaluator
// See PROTOCOL.md §Conceptual model + §Wire protocol §Sequence.
//
// The evaluator takes a (signed) Contract and a (signed) Submission, runs each
// predicate, and emits a signed VerifierClaim. For revealing predicates it asks
// the provider to disclose the relevant Merkle leaves, verifies each disclosure
// against the committed root, then hands the disclosed bytes to the predicate
// adapter. The claim is an AND over all predicate results.

import type { Contract, Predicate, LeafSelector } from '../types/contract.js';
import type { Submission, Reveal } from '../types/submission.js';
import type { VerifierClaim, PredicateResult } from '../types/claim.js';
import type { PredicateAdapter } from '../types/predicate.js';
import type { Hash } from '../types/crypto.js';
import { type KeyPair, sign, verify, signingPayload } from '../signing/ed25519.js';
import { verifyMerkleProof } from '../merkle/tree.js';
import { canonicalizeBytes } from '../util/canonical.js';
import { sha256 } from '../util/hash.js';
import { bytesToHex, hexToBytes } from '../util/hex.js';
import { schemaValidationAdapter } from '../predicates/schema-validation.js';
import { piiAbsenceAdapter } from '../predicates/pii-absence.js';

export interface EvaluateOptions {
  /**
   * Callback the evaluator uses to request selective reveals from the provider.
   * For local use (single-process), this is a direct function call. For HTTP
   * or A2A transports, this wraps the network round-trip.
   */
  requestReveal: (predicateIndex: number, leafIndices: number[]) => Promise<Reveal>;
}

// The protocol version this evaluator implements. The VerifierClaim declares the
// evaluator's own version — it must NOT be inherited from the (provider-supplied)
// Submission, or a provider could make the evaluator attest under a version it
// never implemented. Matches PROTOCOL.md's authoritative version.
const CLAIM_SCHEMA_VERSION = '0.0.1';

/**
 * v0 adapter registry — static import per PROTOCOL.md §Open spec questions #5
 * ("Default: static import for v0; registry-based in v1").
 */
const ADAPTERS: Record<string, PredicateAdapter<unknown>> = {
  [schemaValidationAdapter.predicateType]: schemaValidationAdapter as PredicateAdapter<unknown>,
  [piiAbsenceAdapter.predicateType]: piiAbsenceAdapter as PredicateAdapter<unknown>,
};

/**
 * Run a Contract's predicates against a Submission and emit a signed VerifierClaim.
 *
 * v0 caller responsibility: this function verifies the Submission's signature
 * (against `contract.parties.provider`) but does NOT verify the Contract's own
 * dual signatures. A caller receiving a Contract over an untrusted transport must
 * verify `contract.signatures.{provider,evaluator}` before calling evaluate;
 * enforcing it here is deferred because Contract signing excludes the unsigned
 * `metadata` field (PROTOCOL.md §Contract), which is not yet pinned down.
 */
export async function evaluate(
  contract: Contract,
  submission: Submission,
  evaluatorKeyPair: KeyPair,
  options: EvaluateOptions
): Promise<VerifierClaim> {
  // A claim over an empty predicate set would AND to a vacuous `passed: true`,
  // which a settlement layer could read as "release payment". Refuse it.
  if (contract.predicates.length === 0) {
    throw new Error('evaluate: contract has no predicates — refusing to emit a vacuous passed=true claim');
  }

  // 1. Authenticate the submission. A claim attests predicate results *about a
  //    submission*; if the submission isn't authentic, there's nothing to attest.
  const submissionOk = await verify(
    submission.signature,
    signingPayload(submission),
    contract.parties.provider
  );
  if (!submissionOk) {
    throw new Error('evaluate: submission signature invalid for provider key');
  }
  const submissionRef = bytesToHex(sha256(canonicalizeBytes(submission)));

  // 2. Run each predicate, collecting one result per Contract.predicates entry.
  const predicateResults: PredicateResult[] = [];
  for (let i = 0; i < contract.predicates.length; i++) {
    predicateResults.push(
      await evaluatePredicate(contract.predicates[i], i, submission, submissionRef, options)
    );
  }

  // 3. AND over all results.
  const passed = predicateResults.every((r) => r.passed);

  // 4. Build and sign the claim.
  const unsigned = {
    schemaVersion: CLAIM_SCHEMA_VERSION,
    contractRef: submission.contractRef,
    submissionRef,
    predicateResults,
    passed,
    evaluatedAt: new Date().toISOString(),
  };
  const signature = await sign(signingPayload(unsigned), evaluatorKeyPair.privateKey);
  return { ...unsigned, signature };
}

async function evaluatePredicate(
  predicate: Predicate,
  index: number,
  submission: Submission,
  submissionRef: Hash,
  options: EvaluateOptions
): Promise<PredicateResult> {
  const fail = (detail: string): PredicateResult => ({ predicateIndex: index, passed: false, detail });

  const adapter = ADAPTERS[predicate.predicateType];
  if (!adapter) {
    return fail(`unknown predicateType "${predicate.predicateType}"`);
  }
  if (predicate.kind !== 'revealing') {
    // v0 ships only revealing adapters (schema-validation). Deterministic
    // re-execution adapters arrive in v1 (PROTOCOL.md §Predicate adapters).
    return fail(`predicate kind "${predicate.kind}" not supported in v0`);
  }

  // Resolve which leaves to request, then ask the provider to disclose them.
  const requested = resolveSelector(predicate.reveal.selector, submission.leafCount);
  const reveal = await options.requestReveal(index, requested);

  // Bind the reveal to *this* submission — reject a reveal replayed from another.
  if (reveal.submissionRef !== submissionRef) {
    return fail('reveal.submissionRef does not match the submission under evaluation');
  }

  // The three reveal arrays must be the same length, and that length must match
  // exactly what we requested (no short-returns, no padding).
  if (
    reveal.leaves.length !== requested.length ||
    reveal.leafIndices.length !== requested.length ||
    reveal.proofs.length !== requested.length
  ) {
    return fail(
      `reveal length mismatch: requested ${requested.length}, got leaves=${reveal.leaves.length}, ` +
        `leafIndices=${reveal.leafIndices.length}, proofs=${reveal.proofs.length}`
    );
  }

  // Verify each disclosed leaf against the committed Merkle root before trusting
  // it. Bind the position three ways — requested index == claimed index ==
  // proof's own index — so a verified proof can't be credited to a leaf at a
  // different position. Bound the proof length to the committed tree depth.
  const expectedDepth = merkleDepth(submission.leafCount);
  for (let j = 0; j < requested.length; j++) {
    if (reveal.leafIndices[j] !== requested[j]) {
      return fail(`reveal returned index ${reveal.leafIndices[j]} where ${requested[j]} was requested`);
    }
    if (reveal.proofs[j].leafIndex !== requested[j]) {
      return fail(`proof.leafIndex ${reveal.proofs[j].leafIndex} disagrees with requested index ${requested[j]}`);
    }
    if (reveal.proofs[j].siblings.length !== expectedDepth) {
      return fail(`proof for leaf ${requested[j]} has ${reveal.proofs[j].siblings.length} siblings, expected ${expectedDepth}`);
    }
    if (!verifyMerkleProof(reveal.leaves[j], reveal.proofs[j], submission.merkleRoot)) {
      return fail(`Merkle proof verification failed for revealed leaf ${requested[j]}`);
    }
  }

  // Hand the verified disclosure to the adapter.
  const spec = adapter.parseSpec(predicate.spec);
  const outcome = adapter.evaluate(spec, {
    revealedLeaves: reveal.leaves,
    leafIndices: reveal.leafIndices,
    merkleRoot: hexToBytes(submission.merkleRoot),
  });
  return { predicateIndex: index, ...outcome };
}

/**
 * Depth of the Merkle tree committing `leafCount` leaves, i.e. the number of
 * siblings in any inclusion proof. The tree pads up to the next power of two
 * (see merkle/tree.ts), so depth = ceil(log2(leafCount)), computed with integer
 * math to avoid floating-point edge cases at exact powers of two.
 */
function merkleDepth(leafCount: number): number {
  if (leafCount <= 1) return 0;
  let depth = 0;
  let size = 1;
  while (size < leafCount) {
    size <<= 1;
    depth++;
  }
  return depth;
}

/**
 * Resolve a declarative LeafSelector to concrete leaf indices, bounded by the
 * submission's actual leaf count. Ranges are inclusive of `from`, exclusive of
 * `to`, and `to` is clamped down to `leafCount` (so "all leaves" can be
 * expressed as `to: Number.MAX_SAFE_INTEGER` before the count is known).
 */
function resolveSelector(selector: LeafSelector, leafCount: number): number[] {
  switch (selector.type) {
    case 'range': {
      const from = Math.max(0, selector.from);
      const to = Math.min(selector.to, leafCount);
      const out: number[] = [];
      for (let i = from; i < to; i++) out.push(i);
      return out;
    }
    case 'indices':
      return selector.indices.filter((i) => i >= 0 && i < leafCount);
    case 'jsonpath':
      // JSONPath leaf selection is deferred past v0 (no JSONPath engine yet).
      throw new Error('evaluate: jsonpath leaf selector not supported in v0');
  }
}
