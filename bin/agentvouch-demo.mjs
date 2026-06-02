#!/usr/bin/env node
// agentvouch-demo — a tiny CLI that runs the full protocol flow end to end and
// prints whether each predicate's VerifierClaim passed. Exercises both v0
// registry-wired adapters (schema-validation and pii-absence).
//
//   npm run build && node bin/agentvouch-demo.mjs
//   # or, once installed:  npx agentvouch-demo
//
// Exits 0 if the demo behaves as expected, 1 otherwise.

import {
  generateKeyPair, sign, signingPayload,
  merkleRoot, merkleProof, objectToLeaves,
  schemaPredicate, piiAbsencePredicate, DEFAULT_PII_PATTERNS, evaluate,
  canonicalizeBytes, sha256, bytesToHex, z,
} from 'agentvouch';

// Run one Contract → Submission → VerifierClaim cycle for a single predicate.
async function runCycle(label, output, predicate) {
  const provider = await generateKeyPair();
  const evaluator = await generateKeyPair();
  const { leaves } = objectToLeaves(output);

  const contractUnsigned = {
    schemaVersion: '0.0.1', taskId: label,
    parties: { provider: provider.publicKey, evaluator: evaluator.publicKey },
    predicates: [predicate], metadata: {},
  };
  const cBytes = canonicalizeBytes(contractUnsigned);
  const contract = { ...contractUnsigned, signatures: {
    provider: await sign(cBytes, provider.privateKey),
    evaluator: await sign(cBytes, evaluator.privateKey),
  }};
  const contractRef = bytesToHex(sha256(canonicalizeBytes(contract)));

  const subU = {
    schemaVersion: '0.0.1', contractRef, merkleRoot: merkleRoot(leaves),
    leafCount: leaves.length, receipt: { timestamp: '2026-06-02T12:00:00.000Z' },
  };
  const submission = { ...subU, signature: await sign(signingPayload(subU), provider.privateKey) };
  const submissionRef = bytesToHex(sha256(canonicalizeBytes(submission)));

  const requestReveal = async (predicateIndex, leafIndices) => ({
    submissionRef, predicateIndex, leafIndices,
    leaves: leafIndices.map((i) => leaves[i]),
    proofs: leafIndices.map((i) => merkleProof(leaves, i)),
  });

  const claim = await evaluate(contract, submission, evaluator, { requestReveal });
  const mark = claim.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark}  ${label}`);
  console.log(`        ${claim.predicateResults[0].detail}`);
  return claim.passed;
}

const schema = z.object({ summary: z.string(), wordCount: z.number(), approved: z.boolean() });

console.log('agentvouch demo — Contract → Submission → VerifierClaim\n');
const results = [
  await runCycle('schema-validation / conforming output', { summary: 'ok', wordCount: 1, approved: true }, schemaPredicate(schema)),
  await runCycle('schema-validation / non-conforming output', { summary: 'ok', wordCount: 'one', approved: true }, schemaPredicate(schema)),
  await runCycle('pii-absence / clean output', { note: 'nothing sensitive' }, piiAbsencePredicate(DEFAULT_PII_PATTERNS)),
  await runCycle('pii-absence / leaks an email', { note: 'email me at jane@example.com' }, piiAbsencePredicate(DEFAULT_PII_PATTERNS)),
];

// Expected: pass, fail, pass, fail.
const expected = [true, false, true, false];
const ok = results.every((r, i) => r === expected[i]);
console.log(`\n${ok ? '✅ demo behaved as expected' : '❌ demo produced unexpected results'}`);
process.exit(ok ? 0 : 1);
