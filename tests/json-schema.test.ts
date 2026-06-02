// Zod ↔ JSON-Schema-subset bridge tests.
// See PROTOCOL.md §Predicate adapters §schema-validation: the schema travels in
// the signed Contract, so it must serialize to stable JSON. v0 supports a
// bounded subset (object/string/number/boolean/array/optional).

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema, validateJsonSchema } from '../src/predicates/json-schema.js';

describe('zodToJsonSchema', () => {
  it('maps primitives to their JSON-schema types', () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: 'string' });
    expect(zodToJsonSchema(z.number())).toEqual({ type: 'number' });
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('maps an object, marking non-optional fields as required', () => {
    const schema = z.object({ summary: z.string(), wordCount: z.number().optional() });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: { summary: { type: 'string' }, wordCount: { type: 'number' } },
      required: ['summary'],
    });
  });

  it('maps arrays via their element schema', () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('maps nested objects', () => {
    const schema = z.object({ meta: z.object({ score: z.number() }) });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: { meta: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] } },
      required: ['meta'],
    });
  });

  it('throws a clear error on an unsupported type', () => {
    expect(() => zodToJsonSchema(z.union([z.string(), z.number()]))).toThrow(/unsupported|union/i);
  });
});

describe('validateJsonSchema', () => {
  const schema = zodToJsonSchema(
    z.object({ summary: z.string(), wordCount: z.number(), approved: z.boolean() })
  );

  it('accepts a conforming value', () => {
    const result = validateJsonSchema(schema, { summary: 'hi', wordCount: 4, approved: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a value missing a required field', () => {
    const result = validateJsonSchema(schema, { summary: 'hi', approved: true });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/wordCount/);
  });

  it('rejects a value with a wrong field type', () => {
    const result = validateJsonSchema(schema, { summary: 'hi', wordCount: 'four', approved: true });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/wordCount/);
  });

  it('allows unknown extra keys (non-strict, matching Zod default)', () => {
    const result = validateJsonSchema(schema, { summary: 'hi', wordCount: 4, approved: true, extra: 1 });
    expect(result.valid).toBe(true);
  });

  it('validates array element types', () => {
    const arrSchema = zodToJsonSchema(z.object({ tags: z.array(z.string()) }));
    expect(validateJsonSchema(arrSchema, { tags: ['a', 'b'] }).valid).toBe(true);
    expect(validateJsonSchema(arrSchema, { tags: ['a', 2] }).valid).toBe(false);
  });

  it('counts only own properties, not inherited ones', () => {
    // A required field satisfied only via the prototype chain must NOT pass —
    // the value being validated must carry the property itself.
    const objSchema = zodToJsonSchema(z.object({ name: z.string() }));
    const inherited = Object.create({ name: 'from-prototype' }) as Record<string, unknown>;
    expect(validateJsonSchema(objSchema, inherited).valid).toBe(false);
    expect(validateJsonSchema(objSchema, { name: 'own' }).valid).toBe(true);
  });
});
