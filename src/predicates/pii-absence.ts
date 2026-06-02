// agentvouch — PII-absence predicate adapter (v0 second adapter)
// See PROTOCOL.md §Predicate adapters §pii-absence
//
// A revealing predicate asserting the output contains no PII-shaped strings. The
// spec carries a set of regular-expression sources; evaluation reconstructs the
// disclosed object and scans every string value (recursively) against them. Any
// match means the predicate FAILS — the property is "no PII present".
//
// PROTOCOL also mentions an optional LLM cross-check flag. v0 has no LLM backend
// wired, so a spec requesting `llmCrossCheck: true` is rejected at parse time
// rather than silently downgraded to regex-only — claiming a check we did not
// perform would be a silent failure.

import type { PredicateAdapter, PredicateEvidence, PredicateOutcome } from '../types/predicate.js';
import type { RevealingPredicate } from '../types/contract.js';
import { leavesToObject } from '../merkle/object-leaves.js';
import { collectStrings } from '../util/json-strings.js';

export interface PiiAbsenceSpec {
  patterns: string[]; // regular-expression sources (RegExp.source), JSON-serializable
  llmCrossCheck?: boolean;
}

/**
 * A conservative default set of PII-shaped patterns: email, US SSN, US phone,
 * and a 13–16 digit credit-card-ish run. Callers can supply their own set.
 */
export const DEFAULT_PII_PATTERNS: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // email
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // US phone
  /\b\d{13,16}\b/, // long digit run (card-number shaped)
];

function compilePatterns(sources: string[]): RegExp[] {
  return sources.map((src) => {
    try {
      return new RegExp(src);
    } catch {
      throw new Error(`piiAbsenceAdapter.parseSpec: invalid regex source ${JSON.stringify(src)}`);
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
    const { patterns, llmCrossCheck } = rawSpec as { patterns?: unknown; llmCrossCheck?: unknown };
    if (!Array.isArray(patterns) || !patterns.every((p) => typeof p === 'string')) {
      throw new Error('piiAbsenceAdapter.parseSpec: spec.patterns must be an array of strings');
    }
    if (llmCrossCheck === true) {
      throw new Error('piiAbsenceAdapter.parseSpec: llmCrossCheck is not supported in v0 (no LLM backend wired)');
    }
    compilePatterns(patterns); // validate they compile, fail fast
    return { patterns: patterns as string[], llmCrossCheck: false };
  },

  evaluate(spec: PiiAbsenceSpec, evidence: PredicateEvidence): PredicateOutcome {
    const patterns = compilePatterns(spec.patterns);
    const reconstructed = leavesToObject(evidence.revealedLeaves ?? []);
    const strings = collectStrings(reconstructed);

    for (const [path, str] of strings) {
      for (const re of patterns) {
        if (re.test(str)) {
          return { passed: false, detail: `PII-shaped match at ${path} (pattern ${re.source})` };
        }
      }
    }
    return { passed: true, detail: 'no PII-shaped strings found' };
  },
};

/**
 * Factory: build a RevealingPredicate using the pii-absence adapter. Reveals all
 * committed leaves (PII-absence requires full content). Accepts RegExp objects
 * or raw source strings.
 */
export function piiAbsencePredicate(patterns: Array<RegExp | string>): RevealingPredicate {
  const sources = patterns.map((p) => (p instanceof RegExp ? p.source : p));
  return {
    kind: 'revealing',
    predicateType: piiAbsenceAdapter.predicateType,
    spec: { patterns: sources, llmCrossCheck: false } satisfies PiiAbsenceSpec,
    reveal: { selector: { type: 'range', from: 0, to: Number.MAX_SAFE_INTEGER } },
  };
}
