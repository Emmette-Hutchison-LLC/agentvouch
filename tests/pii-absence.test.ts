// pii-absence predicate adapter tests.
// See PROTOCOL.md §Predicate adapters §pii-absence: "output must not contain
// PII-shaped strings. Spec contains the regex set + a flag for LLM cross-check.
// Reveals all leaves."

import { describe, it, expect } from 'vitest';
import {
  piiAbsencePredicate,
  piiAbsenceAdapter,
  DEFAULT_PII_PATTERNS,
} from '../src/predicates/pii-absence.js';
import { objectToLeaves } from '../src/merkle/object-leaves.js';

describe('piiAbsencePredicate factory', () => {
  it('builds a revealing pii-absence predicate that reveals all leaves', () => {
    const p = piiAbsencePredicate(DEFAULT_PII_PATTERNS);
    expect(p.kind).toBe('revealing');
    expect(p.predicateType).toBe('pii-absence');
    expect(p.reveal.selector).toMatchObject({ type: 'range', from: 0 });
  });

  it('serializes regex source + flags into the spec', () => {
    const p = piiAbsencePredicate([/\d{3}-\d{2}-\d{4}/]);
    const spec = p.spec as { patterns: Array<{ source: string; flags: string }> };
    expect(spec.patterns).toContainEqual({ source: '\\d{3}-\\d{2}-\\d{4}', flags: '' });
  });

  it('preserves regex flags through serialization (case-insensitive email keeps "i")', () => {
    const spec = piiAbsencePredicate(DEFAULT_PII_PATTERNS).spec as { patterns: Array<{ source: string; flags: string }> };
    expect(spec.patterns.some((e) => e.flags.includes('i'))).toBe(true);
  });
});

describe('piiAbsenceAdapter.parseSpec', () => {
  it('accepts a well-formed spec (object pattern entries)', () => {
    expect(() => piiAbsenceAdapter.parseSpec({ patterns: [{ source: '\\d{3}', flags: '' }] })).not.toThrow();
  });

  it('also accepts bare-string pattern entries (flags default to empty)', () => {
    expect(() => piiAbsenceAdapter.parseSpec({ patterns: ['\\d{3}'] })).not.toThrow();
  });

  it('rejects a spec whose patterns are not an array', () => {
    expect(() => piiAbsenceAdapter.parseSpec({ patterns: 'nope' })).toThrow(/patterns/);
  });

  it('rejects a spec containing an invalid regex', () => {
    expect(() => piiAbsenceAdapter.parseSpec({ patterns: [{ source: '([a-z', flags: '' }] })).toThrow(/regex|invalid/i);
  });

  it('rejects llmCrossCheck=true (not supported in v0, must not silently skip)', () => {
    expect(() => piiAbsenceAdapter.parseSpec({ patterns: ['\\d'], llmCrossCheck: true })).toThrow(/llm|cross/i);
  });
});

describe('piiAbsenceAdapter.evaluate', () => {
  const spec = piiAbsenceAdapter.parseSpec(piiAbsencePredicate(DEFAULT_PII_PATTERNS).spec);

  it('passes when no PII-shaped strings are present', () => {
    const { leaves } = objectToLeaves({ summary: 'all clear', count: 3 });
    expect(piiAbsenceAdapter.evaluate(spec, { revealedLeaves: leaves }).passed).toBe(true);
  });

  it('fails when an email address is present', () => {
    const { leaves } = objectToLeaves({ note: 'contact me at jane@example.com please' });
    const result = piiAbsenceAdapter.evaluate(spec, { revealedLeaves: leaves });
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/note/);
  });

  it('detects PII nested inside arrays and sub-objects', () => {
    const { leaves } = objectToLeaves({ rows: [{ ssn: '123-45-6789' }] });
    expect(piiAbsenceAdapter.evaluate(spec, { revealedLeaves: leaves }).passed).toBe(false);
  });

  it('detects an UPPERCASE email (regex flags are preserved end to end)', () => {
    const { leaves } = objectToLeaves({ note: 'reach me at ALICE@CORP.COM' });
    expect(piiAbsenceAdapter.evaluate(spec, { revealedLeaves: leaves }).passed).toBe(false);
  });

  it('detects a credit-card-shaped value stored as a NUMBER, not a string', () => {
    const { leaves } = objectToLeaves({ card: 4532015112830366 });
    expect(piiAbsenceAdapter.evaluate(spec, { revealedLeaves: leaves }).passed).toBe(false);
  });

  it('fails closed (does not crash) on adversarially deep nesting', () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 600; i++) {
      const next: Record<string, unknown> = {};
      cur.n = next;
      cur = next;
    }
    const { leaves } = objectToLeaves({ data: deep });
    expect(piiAbsenceAdapter.evaluate(spec, { revealedLeaves: leaves }).passed).toBe(false);
  });
});
