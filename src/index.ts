// agentvouch — public API entry point
//
// See PROTOCOL.md for the canonical specification. This module re-exports the
// types and functions that make up the agentvouch v0 surface.

export type { Contract, Predicate, RevealingPredicate, DeterministicPredicate } from './types/contract.js';
export type { Submission, Reveal } from './types/submission.js';
export type { VerifierClaim, PredicateResult } from './types/claim.js';
export type { PredicateAdapter, PredicateEvidence } from './types/predicate.js';

// Crypto primitives — small, well-tested wrappers
export { merkleRoot, merkleProof, verifyMerkleProof } from './merkle/tree.js';
export { sign, verify, generateKeyPair } from './signing/ed25519.js';

// Evaluator
export { evaluate } from './evaluator/evaluate.js';

// First built-in predicate adapter (more land in v0)
export { schemaPredicate } from './predicates/schema-validation.js';

// Schema version constant — matches PROTOCOL.md version
export const SCHEMA_VERSION = '0.0.1' as const;
