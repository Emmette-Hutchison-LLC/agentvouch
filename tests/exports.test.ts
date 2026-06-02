// Public API surface tests — guard the package entry point (src/index.ts).
// These import from the entry the same way an external consumer would.

import { describe, it, expect } from 'vitest';
import * as av from '../src/index.js';

describe('package entry point', () => {
  it('re-exports z so a schema predicate is buildable from a single import', () => {
    expect(typeof av.z).toBe('object');
    expect(typeof av.z.object).toBe('function');
    const predicate = av.schemaPredicate(av.z.object({ summary: av.z.string() }));
    expect(predicate.predicateType).toBe('schema-validation');
  });

  it('exposes the core flow functions', () => {
    expect(typeof av.evaluate).toBe('function');
    expect(typeof av.objectToLeaves).toBe('function');
    expect(typeof av.merkleRoot).toBe('function');
    expect(typeof av.generateKeyPair).toBe('function');
    expect(typeof av.signingPayload).toBe('function');
  });
});
