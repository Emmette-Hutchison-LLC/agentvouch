// agentvouch — scaffolding sanity tests
//
// W22 baseline test: verify the public API surface exists and types compile.
// Real per-module tests (merkle.test.ts, signing.test.ts, evaluator.test.ts,
// schema-validation.test.ts) land as the corresponding modules get implementations.

import { describe, it, expect } from 'vitest';
import * as agentvouch from '../src/index.js';

describe('agentvouch — scaffolding', () => {
  it('exports a SCHEMA_VERSION constant', () => {
    expect(agentvouch.SCHEMA_VERSION).toBe('0.0.1');
  });

  it('exports the expected public API symbols', () => {
    expect(typeof agentvouch.merkleRoot).toBe('function');
    expect(typeof agentvouch.merkleProof).toBe('function');
    expect(typeof agentvouch.verifyMerkleProof).toBe('function');
    expect(typeof agentvouch.sign).toBe('function');
    expect(typeof agentvouch.verify).toBe('function');
    expect(typeof agentvouch.generateKeyPair).toBe('function');
    expect(typeof agentvouch.evaluate).toBe('function');
    expect(typeof agentvouch.schemaPredicate).toBe('function');
  });

  it('stub functions throw with explanatory messages (W22 scaffolding state)', async () => {
    // This test will be removed/replaced as each module gets implementation.
    expect(() => agentvouch.merkleRoot([])).toThrow(/not implemented yet/);
    await expect(agentvouch.generateKeyPair()).rejects.toThrow(/not implemented yet/);
  });
});
