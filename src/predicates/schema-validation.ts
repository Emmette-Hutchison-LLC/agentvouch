// agentvouch — Schema validation predicate adapter (v0 first adapter)
// See PROTOCOL.md §Predicate adapters §schema-validation
//
// A revealing predicate that asserts the output JSON validates against a Zod
// schema. The schema travels in the signed Contract serialized to the v0
// JSON-Schema subset (see ./json-schema.ts). At evaluation time the evaluator
// reconstructs the disclosed object from the revealed Merkle leaves and validates
// it against that subset — no Zod reconstruction required on the verifier side.

import { z, type ZodTypeAny } from 'zod';
import type { PredicateAdapter, PredicateEvidence, PredicateOutcome } from '../types/predicate.js';
import type { RevealingPredicate } from '../types/contract.js';
import { zodToJsonSchema, validateJsonSchema, type JsonSchema } from './json-schema.js';
import { leavesToObject } from '../merkle/object-leaves.js';

export interface SchemaValidationSpec {
  // The schema serialized as the v0 JSON-Schema subset, JSON-stringified. This is
  // the field that lives in (and is signed over by) the Contract.
  schemaJSON: string;
}

export const schemaValidationAdapter: PredicateAdapter<SchemaValidationSpec> = {
  predicateType: 'schema-validation',
  flavor: 'revealing',

  parseSpec(rawSpec: unknown): SchemaValidationSpec {
    if (typeof rawSpec !== 'object' || rawSpec === null) {
      throw new Error('schemaValidationAdapter.parseSpec: spec must be an object');
    }
    const { schemaJSON } = rawSpec as { schemaJSON?: unknown };
    if (typeof schemaJSON !== 'string') {
      throw new Error('schemaValidationAdapter.parseSpec: spec.schemaJSON must be a string');
    }
    // Validate it parses now, so a malformed spec fails fast rather than at evaluate.
    JSON.parse(schemaJSON);
    return { schemaJSON };
  },

  evaluate(spec: SchemaValidationSpec, evidence: PredicateEvidence): PredicateOutcome {
    const schema = JSON.parse(spec.schemaJSON) as JsonSchema;
    const reconstructed = leavesToObject(evidence.revealedLeaves ?? []);
    const { valid, errors } = validateJsonSchema(schema, reconstructed);
    return valid
      ? { passed: true, detail: 'output validates against schema' }
      : { passed: false, detail: `schema validation failed: ${errors.join('; ')}` };
  },
};

/**
 * Factory: build a RevealingPredicate that uses the schema-validation adapter
 * with the given Zod schema as its spec. The selector reveals all committed
 * leaves (whole-object validation); the evaluator clamps the range to the
 * submission's actual `leafCount`.
 *
 * Example:
 *   const predicate = schemaPredicate(z.object({ summary: z.string() }));
 */
export function schemaPredicate(schema: ZodTypeAny): RevealingPredicate {
  const jsonSchema = zodToJsonSchema(schema);
  return {
    kind: 'revealing',
    predicateType: schemaValidationAdapter.predicateType,
    spec: { schemaJSON: JSON.stringify(jsonSchema) } satisfies SchemaValidationSpec,
    reveal: {
      // "All leaves": from 0 through the end of the committed tree. The evaluator
      // clamps `to` down to the submission's leafCount.
      selector: { type: 'range', from: 0, to: Number.MAX_SAFE_INTEGER },
    },
  };
}

// Make z available for callers' convenience (so they can `import { z } from 'agentvouch'`)
export { z };
