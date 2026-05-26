// agentvouch — Contract types
// See PROTOCOL.md §Types §Contract and §Predicate

import type { PublicKey, Signature } from './crypto.js';

export interface Contract {
  schemaVersion: string;
  taskId: string;
  parties: {
    provider: PublicKey;
    evaluator: PublicKey;
  };
  predicates: Predicate[];
  metadata?: Record<string, unknown>;
  signatures: {
    provider: Signature;
    evaluator: Signature;
  };
}

export type Predicate = RevealingPredicate | DeterministicPredicate;

export interface RevealingPredicate {
  kind: 'revealing';
  predicateType: string;
  spec: unknown;
  reveal: {
    selector: LeafSelector;
  };
}

export interface DeterministicPredicate {
  kind: 'deterministic';
  predicateType: string;
  spec: unknown;
}

export type LeafSelector =
  | { type: 'range'; from: number; to: number }
  | { type: 'indices'; indices: number[] }
  | { type: 'jsonpath'; path: string };
