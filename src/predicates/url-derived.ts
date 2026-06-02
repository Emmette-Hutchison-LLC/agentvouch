// agentvouch — url-derived predicate adapter (v0 SKETCH)
// See PROTOCOL.md §Predicate adapters §url-derived
//
// Asserts: "a string in the output was sourced from URL X with content Y at time
// T". The provider supplies a Reclaim Protocol attestation alongside the reveal;
// the evaluator checks that (a) the attestation's proof is cryptographically
// valid, (b) it attests the spec's URL, (c) it is fresh, (d) the attested content
// carries the expected substring, and (e) the revealed output carries it too —
// binding the disclosed output to externally-attested content.
//
// SKETCH BOUNDARY: bundling Reclaim's proof verifier (and its dependency weight)
// is out of scope for v0, so proof verification is INJECTED via
// createUrlDerivedAdapter(verifier). The default export refuses to evaluate until
// a real verifier is wired — it never silently treats an unverified proof as
// valid. The structural checks (b)–(e) are fully implemented and tested.

import type { PredicateAdapter, PredicateOutcome } from '../types/predicate.js';
import type { RevealingPredicate } from '../types/contract.js';
import { leavesToObject } from '../merkle/object-leaves.js';
import { collectStrings } from '../util/json-strings.js';

export interface UrlDerivedSpec {
  url: string;
  expectedSubstring: string;
  maxAgeMs?: number; // if set, reject attestations older than this relative to evidence.now
}

/** A Reclaim-shaped attestation (sketch). `proof` is opaque to the structural checks. */
export interface ReclaimAttestation {
  url: string;
  observedContent: string;
  timestamp: number; // epoch ms when the content was observed
  proof: unknown; // verified by the injected AttestationVerifier
}

export interface UrlDerivedEvidence {
  revealedLeaves?: Uint8Array[];
  attestation: ReclaimAttestation;
  now: number; // epoch ms, caller-supplied for deterministic freshness checks
}

/** Cryptographic proof check. A real impl wraps the Reclaim verifier. */
export type AttestationVerifier = (attestation: ReclaimAttestation) => boolean;

const REFUSE_VERIFIER: AttestationVerifier = () => {
  throw new Error('urlDerivedAdapter: no attestation verifier injected — use createUrlDerivedAdapter(verifier)');
};

/**
 * Build a url-derived adapter bound to a specific attestation-proof verifier.
 * Inject a real Reclaim verifier in production; tests inject a fake.
 */
export function createUrlDerivedAdapter(
  verifyAttestation: AttestationVerifier
): PredicateAdapter<UrlDerivedSpec, UrlDerivedEvidence> {
  return {
    predicateType: 'url-derived',
    flavor: 'revealing',

    parseSpec(rawSpec: unknown): UrlDerivedSpec {
      if (typeof rawSpec !== 'object' || rawSpec === null) {
        throw new Error('urlDerivedAdapter.parseSpec: spec must be an object');
      }
      const { url, expectedSubstring, maxAgeMs } = rawSpec as Record<string, unknown>;
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error('urlDerivedAdapter.parseSpec: spec.url must be a non-empty string');
      }
      if (typeof expectedSubstring !== 'string' || expectedSubstring.length === 0) {
        throw new Error('urlDerivedAdapter.parseSpec: spec.expectedSubstring must be a non-empty string');
      }
      if (maxAgeMs !== undefined && (typeof maxAgeMs !== 'number' || maxAgeMs < 0)) {
        throw new Error('urlDerivedAdapter.parseSpec: spec.maxAgeMs must be a non-negative number');
      }
      return { url, expectedSubstring, ...(maxAgeMs !== undefined ? { maxAgeMs } : {}) };
    },

    evaluate(spec: UrlDerivedSpec, evidence: UrlDerivedEvidence): PredicateOutcome {
      const { attestation, now } = evidence;

      // (a) cryptographic proof — injected; throws on the default refuse-verifier.
      if (!verifyAttestation(attestation)) {
        return { passed: false, detail: 'attestation proof failed verification' };
      }
      // (b) the attestation is about the URL the spec names.
      if (attestation.url !== spec.url) {
        return { passed: false, detail: `attestation URL ${attestation.url} does not match spec URL ${spec.url}` };
      }
      // (c) freshness.
      if (spec.maxAgeMs !== undefined) {
        const age = now - attestation.timestamp;
        if (age < 0 || age > spec.maxAgeMs) {
          return { passed: false, detail: `attestation is stale: age ${age}ms exceeds maxAgeMs ${spec.maxAgeMs}` };
        }
      }
      // (d) the attested content carries the expected substring.
      if (!attestation.observedContent.includes(spec.expectedSubstring)) {
        return { passed: false, detail: 'expected substring not present in attested content' };
      }
      // (e) the revealed output carries it too — bind output to attested content.
      const outputStrings = collectStrings(leavesToObject(evidence.revealedLeaves ?? []));
      const inOutput = outputStrings.some(([, s]) => s.includes(spec.expectedSubstring));
      if (!inOutput) {
        return { passed: false, detail: 'expected substring not present in the revealed output' };
      }
      return { passed: true, detail: `output substring attested as sourced from ${spec.url}` };
    },
  };
}

/**
 * Default adapter — refuses to evaluate until a verifier is injected, so an
 * unverified Reclaim proof can never be mistaken for a valid one.
 */
export const urlDerivedAdapter = createUrlDerivedAdapter(REFUSE_VERIFIER);

/**
 * Factory: build a RevealingPredicate using the url-derived adapter. Reveals all
 * committed leaves so the evaluator can locate the attested substring.
 */
export function urlDerivedPredicate(spec: UrlDerivedSpec): RevealingPredicate {
  return {
    kind: 'revealing',
    predicateType: urlDerivedAdapter.predicateType,
    spec: { ...spec } satisfies UrlDerivedSpec,
    reveal: { selector: { type: 'range', from: 0, to: Number.MAX_SAFE_INTEGER } },
  };
}
