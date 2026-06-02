// Zod ↔ JSON-Schema-subset bridge.
//
// The schema-validation predicate carries its schema inside the signed Contract,
// so the schema must serialize to stable, transport-agnostic JSON. Zod values are
// not JSON-serializable, so we project a Zod schema down to a small JSON-Schema
// subset and validate against that subset directly — no Zod reconstruction needed
// on the evaluator side, and no runtime dependency on Zod internals beyond the
// public class surface.
//
// Supported v0 subset: object, string, number, boolean, array, optional. This is
// deliberately narrow (PROTOCOL.md §Open spec questions flags serialization as
// pre-v0.1.0); unsupported types throw rather than silently degrade.

import { z, type ZodTypeAny } from 'zod';

export type JsonSchema =
  | { type: 'string' }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'array'; items: JsonSchema }
  | { type: 'object'; properties: Record<string, JsonSchema>; required: string[] };

/**
 * Project a Zod schema onto the v0 JSON-Schema subset. Throws on any type outside
 * the subset so a Contract author finds out at build time, not at verification time.
 */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };

  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element as ZodTypeAny) };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const key of Object.keys(shape)) {
      const field = shape[key];
      if (field instanceof z.ZodOptional) {
        properties[key] = zodToJsonSchema(field.unwrap() as ZodTypeAny);
      } else {
        properties[key] = zodToJsonSchema(field);
        required.push(key);
      }
    }
    return { type: 'object', properties, required };
  }

  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName ?? 'unknown';
  throw new Error(`zodToJsonSchema: unsupported Zod type "${typeName}" (v0 subset: object/string/number/boolean/array/optional)`);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a value against a JSON-Schema-subset node. Non-strict on objects:
 * unknown extra keys are allowed (matching Zod's default `.parse` behavior, which
 * strips rather than rejects unknown keys).
 */
export function validateJsonSchema(schema: JsonSchema, value: unknown): ValidationResult {
  const errors: string[] = [];
  walk(schema, value, '$', errors);
  return { valid: errors.length === 0, errors };
}

function walk(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string, got ${typeOf(value)}`);
      return;
    case 'number':
      if (typeof value !== 'number') errors.push(`${path}: expected number, got ${typeOf(value)}`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${typeOf(value)}`);
      return;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeOf(value)}`);
        return;
      }
      value.forEach((item, i) => walk(schema.items, item, `${path}[${i}]`, errors));
      return;
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${typeOf(value)}`);
        return;
      }
      const obj = value as Record<string, unknown>;
      const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);
      for (const key of schema.required) {
        if (!has(key)) errors.push(`${path}.${key}: required property missing`);
      }
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        // Own properties only — an inherited member must not satisfy the schema.
        if (has(key)) walk(subSchema, obj[key], `${path}.${key}`, errors);
      }
      return;
    }
  }
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
