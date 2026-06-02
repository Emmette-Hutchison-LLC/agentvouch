// End-to-end evaluator tests: Contract → Submission → VerifierClaim.
// This is the W22-gap closer — it exercises the full happy path the protocol
// describes (PROTOCOL.md §Conceptual model + §Wire protocol §Sequence) plus the
// failure modes a real evaluator must handle.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { generateKeyPair, sign, verify, signingPayload } from '../src/signing/ed25519.js';
import { merkleRoot, merkleProof } from '../src/merkle/tree.js';
import { objectToLeaves } from '../src/merkle/object-leaves.js';
import { schemaPredicate } from '../src/predicates/schema-validation.js';
import { evaluate } from '../src/evaluator/evaluate.js';
import { canonicalizeBytes } from '../src/util/canonical.js';
import { sha256 } from '../src/util/hash.js';
import { bytesToHex } from '../src/util/hex.js';
import type { Contract } from '../src/types/contract.js';
import type { Submission, Reveal } from '../src/types/submission.js';

const schema = z.object({ summary: z.string(), wordCount: z.number(), approved: z.boolean() });

/**
 * Stand up a full Contract + signed Submission + provider-side reveal callback
 * for a given output object, exactly as the two parties would in production.
 */
async function buildScenario(
  output: Record<string, unknown>,
  opts: { submissionSchemaVersion?: string } = {}
) {
  const provider = await generateKeyPair();
  const evaluatorKey = await generateKeyPair();

  const { leaves } = objectToLeaves(output);
  const root = merkleRoot(leaves);

  const predicate = schemaPredicate(schema);
  const contractUnsigned = {
    schemaVersion: '0.0.1',
    taskId: 'task-001',
    parties: { provider: provider.publicKey, evaluator: evaluatorKey.publicKey },
    predicates: [predicate],
    metadata: {},
  };
  const contractBytes = canonicalizeBytes(contractUnsigned);
  const contract: Contract = {
    ...contractUnsigned,
    signatures: {
      provider: await sign(contractBytes, provider.privateKey),
      evaluator: await sign(contractBytes, evaluatorKey.privateKey),
    },
  };
  const contractRef = bytesToHex(sha256(canonicalizeBytes(contract)));

  const submissionUnsigned = {
    schemaVersion: opts.submissionSchemaVersion ?? '0.0.1',
    contractRef,
    merkleRoot: root,
    leafCount: leaves.length,
    receipt: { timestamp: '2026-06-02T00:00:00.000Z' },
  };
  const submission: Submission = {
    ...submissionUnsigned,
    signature: await sign(signingPayload(submissionUnsigned), provider.privateKey),
  };
  const submissionRef = bytesToHex(sha256(canonicalizeBytes(submission)));

  const requestReveal = async (predicateIndex: number, leafIndices: number[]): Promise<Reveal> => ({
    submissionRef,
    predicateIndex,
    leafIndices,
    leaves: leafIndices.map((i) => leaves[i]),
    proofs: leafIndices.map((i) => merkleProof(leaves, i)),
  });

  return { provider, evaluatorKey, contract, contractRef, submission, submissionRef, requestReveal };
}

describe('evaluate — happy path', () => {
  it('produces a signed VerifierClaim attesting the predicate passed', async () => {
    const s = await buildScenario({ summary: 'A concise summary.', wordCount: 4, approved: true });

    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, {
      requestReveal: s.requestReveal,
    });

    expect(claim.passed).toBe(true);
    expect(claim.predicateResults).toHaveLength(1);
    expect(claim.predicateResults[0]).toMatchObject({ predicateIndex: 0, passed: true });
  });

  it('references the right contract and submission, and is signed by the evaluator', async () => {
    const s = await buildScenario({ summary: 'A concise summary.', wordCount: 4, approved: true });

    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, {
      requestReveal: s.requestReveal,
    });

    expect(claim.schemaVersion).toBe('0.0.1');
    expect(claim.contractRef).toBe(s.contractRef);
    expect(claim.submissionRef).toBe(s.submissionRef);
    // submissionRef must be a well-formed hash distinct from the contract ref —
    // guards against the function hashing the wrong object entirely.
    expect(claim.submissionRef).toMatch(/^0x[0-9a-f]{64}$/);
    expect(claim.submissionRef).not.toBe(claim.contractRef);
    expect(typeof claim.evaluatedAt).toBe('string');
    expect(await verify(claim.signature, signingPayload(claim), s.evaluatorKey.publicKey)).toBe(true);
  });

  it('binds submissionRef to submission content (different output → different ref)', async () => {
    const a = await buildScenario({ summary: 'one', wordCount: 1, approved: true });
    const b = await buildScenario({ summary: 'two', wordCount: 2, approved: false });
    const claimA = await evaluate(a.contract, a.submission, a.evaluatorKey, { requestReveal: a.requestReveal });
    const claimB = await evaluate(b.contract, b.submission, b.evaluatorKey, { requestReveal: b.requestReveal });
    expect(claimA.submissionRef).not.toBe(claimB.submissionRef);
  });
});

describe('evaluate — hardening against malformed/malicious reveals', () => {
  it('fails the predicate when reveal arrays have mismatched lengths', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });
    const badReveal = async (pi: number, idx: number[]): Promise<Reveal> => {
      const honest = await s.requestReveal(pi, idx);
      honest.proofs = honest.proofs.slice(0, -1); // drop a proof → length mismatch
      return honest;
    };
    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, { requestReveal: badReveal });
    expect(claim.passed).toBe(false);
    expect(claim.predicateResults[0].detail).toMatch(/length|mismatch/i);
  });

  it('fails the predicate when the provider short-returns fewer leaves than requested', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });
    const shortReveal = async (pi: number, idx: number[]): Promise<Reveal> => {
      const honest = await s.requestReveal(pi, idx);
      return {
        ...honest,
        leafIndices: honest.leafIndices.slice(0, 1),
        leaves: honest.leaves.slice(0, 1),
        proofs: honest.proofs.slice(0, 1),
      };
    };
    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, { requestReveal: shortReveal });
    expect(claim.passed).toBe(false);
  });

  it('fails the predicate when reveal.leafIndices do not match the requested indices', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });
    const wrongIndices = async (pi: number, idx: number[]): Promise<Reveal> => {
      const honest = await s.requestReveal(pi, idx);
      honest.leafIndices = honest.leafIndices.map((i) => i + 1); // claim different positions
      return honest;
    };
    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, { requestReveal: wrongIndices });
    expect(claim.passed).toBe(false);
    expect(claim.predicateResults[0].detail).toMatch(/index|indices/i);
  });

  it('fails the predicate when reveal.submissionRef does not match the submission', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });
    const wrongRef = async (pi: number, idx: number[]): Promise<Reveal> => {
      const honest = await s.requestReveal(pi, idx);
      honest.submissionRef = '0x' + '00'.repeat(32); // a different submission
      return honest;
    };
    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, { requestReveal: wrongRef });
    expect(claim.passed).toBe(false);
    expect(claim.predicateResults[0].detail).toMatch(/submissionRef/i);
  });

  it('stamps the claim with the protocol schemaVersion, not the submission-supplied one', async () => {
    const s = await buildScenario(
      { summary: 'hi', wordCount: 4, approved: true },
      { submissionSchemaVersion: '9.9.9' } // provider lies about the version
    );
    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, { requestReveal: s.requestReveal });
    expect(claim.schemaVersion).toBe('0.0.1');
  });

  it('refuses to emit a vacuous passed=true claim for a contract with no predicates', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });
    const emptyContract: Contract = { ...s.contract, predicates: [] };
    await expect(
      evaluate(emptyContract, s.submission, s.evaluatorKey, { requestReveal: s.requestReveal })
    ).rejects.toThrow(/predicate/i);
  });
});

describe('evaluate — predicate failure', () => {
  it('returns a signed claim with passed=false when the output violates the schema', async () => {
    // wordCount is a string, not a number — schema validation must fail.
    const s = await buildScenario({ summary: 'hi', wordCount: 'four', approved: true });

    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, {
      requestReveal: s.requestReveal,
    });

    expect(claim.passed).toBe(false);
    expect(claim.predicateResults[0].passed).toBe(false);
    expect(claim.predicateResults[0].detail).toMatch(/wordCount/);
    // A claim attesting failure is still a valid, signed attestation.
    expect(await verify(claim.signature, signingPayload(claim), s.evaluatorKey.publicKey)).toBe(true);
  });
});

describe('evaluate — integrity checks', () => {
  it('fails the predicate when a revealed leaf does not match its Merkle proof', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });

    const tamperingReveal = async (predicateIndex: number, leafIndices: number[]): Promise<Reveal> => {
      const honest = await s.requestReveal(predicateIndex, leafIndices);
      honest.leaves[0] = new TextEncoder().encode('tampered-leaf'); // proof no longer reconstructs the root
      return honest;
    };

    const claim = await evaluate(s.contract, s.submission, s.evaluatorKey, {
      requestReveal: tamperingReveal,
    });

    expect(claim.passed).toBe(false);
    expect(claim.predicateResults[0].detail).toMatch(/proof|merkle/i);
  });

  it('rejects a submission whose signature does not match its contents', async () => {
    const s = await buildScenario({ summary: 'hi', wordCount: 4, approved: true });
    // Mutate a signed-over field after signing → signature is now invalid.
    const tampered: Submission = { ...s.submission, leafCount: s.submission.leafCount + 1 };

    await expect(
      evaluate(s.contract, tampered, s.evaluatorKey, { requestReveal: s.requestReveal })
    ).rejects.toThrow(/signature/i);
  });
});
