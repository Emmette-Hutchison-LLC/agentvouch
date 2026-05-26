// agentvouch — Schema validation predicate adapter (v0 first adapter)
// See PROTOCOL.md §Predicate adapters §schema-validation
//
// A revealing predicate that asserts the output JSON validates against a Zod schema.

import { z, type ZodTypeAny } from 'zod';
import type { PredicateAdapter, PredicateEvidence } from '../types/predicate.js';
import type { RevealingPredicate } from '../types/contract.js';

export interface SchemaValidationSpec {
  // Schema serialized as a JSON-compatible representation
  // (Zod doesn't have native JSON serialization; we'll define a stable subset)
  schemaJSON: string;
}

// TODO(v0): implement Zod-to-JSON-Schema-subset serialization + the parseSpec + evaluate.
// For W22 scaffolding pass: stub interface + factory; impl in next session.

export const schemaValidationAdapter: PredicateAdapter<SchemaValidationSpec> = {
  predicateType: 'schema-validation',
  flavor: 'revealing',
  parseSpec(_rawSpec: unknown): SchemaValidationSpec {
    throw new Error('schemaValidationAdapter.parseSpec: not implemented yet');
  },
  evaluate(_spec: SchemaValidationSpec, _evidence: PredicateEvidence) {
    throw new Error('schemaValidationAdapter.evaluate: not implemented yet');
  },
};

/**
 * Factory: build a RevealingPredicate that uses the schema-validation adapter
 * with the given Zod schema as its spec.
 *
 * Example (post-impl):
 *   const predicate = schemaPredicate(z.object({ summary: z.string() }));
 */
export function schemaPredicate(_schema: ZodTypeAny): RevealingPredicate {
  throw new Error('schemaPredicate: not implemented yet (see PROTOCOL.md §Predicate adapters)');
}

// Make z available for callers convenience (so they can `import { z } from 'agentvouch'`)
export { z };
