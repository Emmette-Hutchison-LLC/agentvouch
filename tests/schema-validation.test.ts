// schema-validation predicate adapter tests.
// See PROTOCOL.md §Predicate adapters §schema-validation.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { schemaPredicate, schemaValidationAdapter } from '../src/predicates/schema-validation.js';
import { objectToLeaves } from '../src/merkle/object-leaves.js';

const schema = z.object({ summary: z.string(), wordCount: z.number(), approved: z.boolean() });

describe('schemaPredicate factory', () => {
  it('builds a revealing schema-validation predicate', () => {
    const p = schemaPredicate(schema);
    expect(p.kind).toBe('revealing');
    expect(p.predicateType).toBe('schema-validation');
  });

  it('selects all committed leaves (whole-object validation)', () => {
    const p = schemaPredicate(schema);
    expect(p.reveal.selector).toMatchObject({ type: 'range', from: 0 });
  });

  it('serializes the schema into the spec as parseable JSON Schema', () => {
    const p = schemaPredicate(schema);
    const spec = p.spec as { schemaJSON: string };
    expect(typeof spec.schemaJSON).toBe('string');
    expect(JSON.parse(spec.schemaJSON)).toMatchObject({ type: 'object', required: expect.any(Array) });
  });
});

describe('schemaValidationAdapter.parseSpec', () => {
  it('accepts a well-formed spec', () => {
    const spec = (schemaPredicate(schema).spec) as unknown;
    expect(() => schemaValidationAdapter.parseSpec(spec)).not.toThrow();
  });

  it('rejects a spec missing schemaJSON', () => {
    expect(() => schemaValidationAdapter.parseSpec({})).toThrow(/schemaJSON/);
  });

  it('rejects a spec whose schemaJSON is not valid JSON', () => {
    expect(() => schemaValidationAdapter.parseSpec({ schemaJSON: 'not json' })).toThrow();
  });
});

describe('schemaValidationAdapter.evaluate', () => {
  it('passes when the revealed leaves reconstruct a conforming object', () => {
    const spec = schemaValidationAdapter.parseSpec(schemaPredicate(schema).spec);
    const { leaves } = objectToLeaves({ summary: 'hi', wordCount: 4, approved: true });
    const result = schemaValidationAdapter.evaluate(spec, { revealedLeaves: leaves });
    expect(result.passed).toBe(true);
  });

  it('fails, with detail, when the reconstructed object violates the schema', () => {
    const spec = schemaValidationAdapter.parseSpec(schemaPredicate(schema).spec);
    const { leaves } = objectToLeaves({ summary: 'hi', wordCount: 'four', approved: true });
    const result = schemaValidationAdapter.evaluate(spec, { revealedLeaves: leaves });
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/wordCount/);
  });

  it('fails when no leaves are revealed (required fields absent)', () => {
    const spec = schemaValidationAdapter.parseSpec(schemaPredicate(schema).spec);
    const result = schemaValidationAdapter.evaluate(spec, { revealedLeaves: [] });
    expect(result.passed).toBe(false);
  });
});
