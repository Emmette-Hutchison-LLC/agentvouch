// agentvouch — PII-absence predicate adapter (v0 second adapter)
// See PROTOCOL.md §Predicate adapters §pii-absence
//
// A revealing predicate asserting the output contains no PII-shaped values. The
// spec carries a set of regular-expression patterns (source + flags, so flags
// like case-insensitive `i` survive JSON serialization); evaluation reconstructs
// the disclosed object and scans every string AND numeric value (recursively)
// against them. Any match means the predicate FAILS — the property is "no PII".
//
// PROTOCOL mentions an optional LLM cross-check flag. v0 has no LLM backend, so a
// spec requesting `llmCrossCheck: true` is rejected at parse time rather than
// silently downgraded — claiming a check we did not perform would be a silent
// failure.
//
// TRUST MODEL / ReDoS: `patterns` lives in the Contract, which is signed by BOTH
// parties (PROTOCOL §Contract) — it is not unilaterally attacker-injected. An
// evaluator must still vet patterns before signing, because a pathological
// pattern (catastrophic backtracking) scanned against a long disclosed string
// can hang the event loop. A linear-time engine / per-call timeout is a v1
// hardening; tracked in PROTOCOL.md §Open spec questions.

import type { PredicateAdapter, PredicateEvidence, PredicateOutcome } from '../types/predicate.js';
import type { RevealingPredicate } from '../types/contract.js';
import { leavesToObject } from '../merkle/object-leaves.js';
import { collectStrings } from '../util/json-strings.js';

/** A serializable regex: source + flags, so flags round-trip through the Contract. */
export interface PatternEntry {
  source: string;
  flags: string;
}

export interface PiiAbsenceSpec {
  patterns: PatternEntry[];
  llmCrossCheck?: boolean;
  /** Runtime-only: compiled patterns populated by parseSpec; never serialized. */
  compiled?: RegExp[];
}

/**
 * A conservative default set of PII-shaped patterns: email (case-insensitive),
 * US SSN, US phone, and a 13–16 digit credit-card-shaped run.
 */
export const DEFAULT_PII_PATTERNS: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // email (i: matches UPPERCASE too)
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // US phone
  /\b\d{13,16}\b/, // long digit run (card-number shaped)
];

function normalizeEntries(patterns: unknown): PatternEntry[] {
  if (!Array.isArray(patterns)) {
    throw new Error('piiAbsenceAdapter.parseSpec: spec.patterns must be an array');
  }
  return patterns.map((p) => {
    if (typeof p === 'string') return { source: p, flags: '' };
    if (p !== null && typeof p === 'object') {
      const { source, flags } = p as { source?: unknown; flags?: unknown };
      if (typeof source === 'string' && (flags === undefined || typeof flags === 'string')) {
        return { source, flags: flags ?? '' };
      }
    }
    throw new Error('piiAbsenceAdapter.parseSpec: each pattern must be a string or { source, flags }');
  });
}

function compilePatterns(entries: PatternEntry[]): RegExp[] {
  return entries.map((e) => {
    try {
      return new RegExp(e.source, e.flags);
    } catch {
      throw new Error(`piiAbsenceAdapter.parseSpec: invalid regex ${JSON.stringify(e)}`);
    }
  });
}

export const piiAbsenceAdapter: PredicateAdapter<PiiAbsenceSpec> = {
  predicateType: 'pii-absence',
  flavor: 'revealing',

  parseSpec(rawSpec: unknown): PiiAbsenceSpec {
    if (typeof rawSpec !== 'object' || rawSpec === null) {
      throw new Error('piiAbsenceAdapter.parseSpec: spec must be an object');
    }
    const { llmCrossCheck } = rawSpec as { llmCrossCheck?: unknown };
    if (llmCrossCheck === true) {
      throw new Error('piiAbsenceAdapter.parseSpec: llmCrossCheck is not supported in v0 (no LLM backend wired)');
    }
    const entries = normalizeEntries((rawSpec as { patterns?: unknown }).patterns);
    const compiled = compilePatterns(entries); // compile ONCE; reused by evaluate
    return { patterns: entries, llmCrossCheck: false, compiled };
  },

  evaluate(spec: PiiAbsenceSpec, evidence: PredicateEvidence): PredicateOutcome {
    const patterns = spec.compiled ?? compilePatterns(spec.patterns);
    let strings;
    try {
      const reconstructed = leavesToObject(evidence.revealedLeaves ?? []);
      strings = collectStrings(reconstructed, { includeNumbers: true });
    } catch (err) {
      // Adversarial input (e.g. excessive nesting) — fail closed, never crash.
      return { passed: false, detail: `pii-absence: could not scan output (${(err as Error).message})` };
    }

    for (const [path, str] of strings) {
      for (const re of patterns) {
        // Fresh lastIndex each test — never reuse a stateful global-flagged regex.
        re.lastIndex = 0;
        if (re.test(str)) {
          return { passed: false, detail: `PII-shaped match at ${path} (pattern /${re.source}/${re.flags})` };
        }
      }
    }
    return { passed: true, detail: 'no PII-shaped values found' };
  },
};

/**
 * Factory: build a RevealingPredicate using the pii-absence adapter. Reveals all
 * committed leaves (PII-absence requires full content). Accepts RegExp objects
 * (flags preserved) or raw { source, flags } / source strings.
 */
export function piiAbsencePredicate(patterns: Array<RegExp | string | PatternEntry>): RevealingPredicate {
  const entries: PatternEntry[] = patterns.map((p) => {
    if (p instanceof RegExp) return { source: p.source, flags: p.flags };
    if (typeof p === 'string') return { source: p, flags: '' };
    return { source: p.source, flags: p.flags };
  });
  return {
    kind: 'revealing',
    predicateType: piiAbsenceAdapter.predicateType,
    spec: { patterns: entries, llmCrossCheck: false },
    reveal: { selector: { type: 'range', from: 0, to: Number.MAX_SAFE_INTEGER } },
  };
}
