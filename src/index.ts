// agentvouch — public API entry point
//
// See PROTOCOL.md for the canonical specification. This module re-exports the
// types and functions that make up the agentvouch v0 surface.

// Types
export type { Contract, Predicate, RevealingPredicate, DeterministicPredicate, LeafSelector } from './types/contract.js';
export type { Submission, Reveal, MerkleProof } from './types/submission.js';
export type { VerifierClaim, PredicateResult } from './types/claim.js';
export type { PredicateAdapter, PredicateEvidence, PredicateOutcome } from './types/predicate.js';
export type { Hash, PublicKey, Signature } from './types/crypto.js';

// Crypto primitives
export { merkleRoot, merkleProof, verifyMerkleProof } from './merkle/tree.js';
export { objectToLeaves, leavesToObject, type ObjectLeaves } from './merkle/object-leaves.js';
export { sign, verify, generateKeyPair, signingPayload, type KeyPair } from './signing/ed25519.js';
export { canonicalize, canonicalizeBytes } from './util/canonical.js';
export { bytesToHex, hexToBytes, concatBytes } from './util/hex.js';
export { sha256 } from './util/hash.js';

// Evaluator
export { evaluate, type EvaluateOptions } from './evaluator/evaluate.js';

// Predicate adapters
export { schemaPredicate, schemaValidationAdapter, type SchemaValidationSpec } from './predicates/schema-validation.js';
export { zodToJsonSchema, validateJsonSchema, type JsonSchema, type ValidationResult } from './predicates/json-schema.js';
export { piiAbsencePredicate, piiAbsenceAdapter, DEFAULT_PII_PATTERNS, type PiiAbsenceSpec } from './predicates/pii-absence.js';
export {
  urlDerivedPredicate,
  urlDerivedAdapter,
  createUrlDerivedAdapter,
  type UrlDerivedSpec,
  type UrlDerivedEvidence,
  type ReclaimAttestation,
  type AttestationVerifier,
} from './predicates/url-derived.js';

// Re-export Zod so `schemaPredicate(z.object(...))` works from a single import.
export { z } from 'zod';

// Schema version constant — matches PROTOCOL.md version
export const SCHEMA_VERSION = '0.0.1' as const;
