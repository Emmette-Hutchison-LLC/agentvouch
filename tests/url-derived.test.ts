// url-derived predicate adapter tests (v0 SKETCH).
// See PROTOCOL.md §Predicate adapters §url-derived: "output property 'this string
// was sourced from URL X with content Y at time T'. Spec contains the URL +
// expected substring. Reveals the relevant leaves and validates against a Reclaim
// Protocol attestation provided alongside."
//
// This is a sketch: the structural checks (substring presence, URL match,
// freshness) are real and tested; the cryptographic Reclaim proof verification is
// an injected boundary (createUrlDerivedAdapter(verifier)) since bundling Reclaim's
// verifier is out of scope for v0.

import { describe, it, expect } from 'vitest';
import {
  urlDerivedPredicate,
  urlDerivedAdapter,
  createUrlDerivedAdapter,
  type ReclaimAttestation,
} from '../src/predicates/url-derived.js';
import { objectToLeaves } from '../src/merkle/object-leaves.js';

const URL = 'https://example.com/price';
const SUBSTR = 'AAPL 187.45';

function makeEvidence(opts: { output: Record<string, unknown>; att: Partial<ReclaimAttestation>; now: number }) {
  const { leaves } = objectToLeaves(opts.output);
  return {
    revealedLeaves: leaves,
    now: opts.now,
    attestation: { url: URL, observedContent: `... ${SUBSTR} ...`, timestamp: opts.now, proof: {}, ...opts.att },
  };
}

// A verifier that accepts every proof — isolates the structural logic under test.
const acceptAll = () => true;
const adapter = createUrlDerivedAdapter(acceptAll);
const spec = adapter.parseSpec(urlDerivedPredicate({ url: URL, expectedSubstring: SUBSTR, maxAgeMs: 60_000 }).spec);

describe('urlDerivedPredicate factory', () => {
  it('builds a revealing url-derived predicate', () => {
    const p = urlDerivedPredicate({ url: URL, expectedSubstring: SUBSTR, maxAgeMs: 60_000 });
    expect(p.kind).toBe('revealing');
    expect(p.predicateType).toBe('url-derived');
  });
});

describe('urlDerivedAdapter.parseSpec', () => {
  it('rejects a spec missing url', () => {
    expect(() => adapter.parseSpec({ expectedSubstring: 'x', maxAgeMs: 1000 })).toThrow(/url/i);
  });
  it('rejects a spec missing expectedSubstring', () => {
    expect(() => adapter.parseSpec({ url: URL, maxAgeMs: 1000 })).toThrow(/substring/i);
  });
  it('rejects a spec missing maxAgeMs (freshness is mandatory per PROTOCOL §Security)', () => {
    expect(() => adapter.parseSpec({ url: URL, expectedSubstring: SUBSTR })).toThrow(/maxAgeMs|fresh/i);
  });
});

describe('urlDerivedAdapter.evaluate (structural checks)', () => {
  it('passes when output + fresh, matching, verified attestation all line up', () => {
    const ev = makeEvidence({ output: { price: `Quote: ${SUBSTR}` }, att: {}, now: 1000 });
    expect(adapter.evaluate(spec, ev).passed).toBe(true);
  });

  it('fails when the expected substring is absent from the revealed output', () => {
    const ev = makeEvidence({ output: { price: 'no quote here' }, att: {}, now: 1000 });
    const r = adapter.evaluate(spec, ev);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/output/i);
  });

  it('fails when the attestation URL does not match the spec URL', () => {
    const ev = makeEvidence({ output: { price: SUBSTR }, att: { url: 'https://evil.test' }, now: 1000 });
    expect(adapter.evaluate(spec, ev).passed).toBe(false);
  });

  it('fails when the attestation is stale (older than maxAgeMs)', () => {
    const ev = makeEvidence({ output: { price: SUBSTR }, att: { timestamp: 1000 }, now: 1000 + 70_000 });
    const r = adapter.evaluate(spec, ev);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/stale|age/i);
  });

  it('fails when the injected proof verifier rejects the attestation', () => {
    const rejectAll = createUrlDerivedAdapter(() => false);
    const ev = makeEvidence({ output: { price: SUBSTR }, att: {}, now: 1000 });
    const r = rejectAll.evaluate(spec, ev);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/proof|attestation/i);
  });

  it('fails closed (does not throw) when the attestation is missing from evidence', () => {
    const ev = { revealedLeaves: [], now: 1000, attestation: undefined as unknown as ReclaimAttestation };
    const r = adapter.evaluate(spec, ev);
    expect(r.passed).toBe(false);
  });
});

describe('default urlDerivedAdapter (no verifier injected)', () => {
  it('refuses to evaluate without a real verifier wired', () => {
    const ev = makeEvidence({ output: { price: SUBSTR }, att: {}, now: 1000 });
    expect(() => urlDerivedAdapter.evaluate(spec, ev)).toThrow(/verifier|inject/i);
  });
});
