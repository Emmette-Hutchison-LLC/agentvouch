// agentvouch v0 — end-to-end demo.
//
// Runs the full protocol flow described in PROTOCOL.md using only the public
// `agentvouch` API: two parties, a Merkle-committed output, selective
// disclosure, and a signed VerifierClaim that anyone can verify.
//
//   npm run build && node examples/e2e-demo.mjs
//
// (Requires `npm run build` first — this imports the built package entry.)

import {
  generateKeyPair, sign, verify, signingPayload,
  merkleRoot, merkleProof, objectToLeaves,
  schemaPredicate, evaluate,
  canonicalizeBytes, sha256, bytesToHex,
  z,
} from 'agentvouch';

const assert = (cond, msg) => {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exit(1);
  }
};

// --- Two parties hold Ed25519 keypairs ---
const provider = await generateKeyPair();
const evaluator = await generateKeyPair();

// --- 1. Provider does the work and commits the output to a Merkle tree ---
const output = { summary: 'Quarterly report drafted.', wordCount: 3, approved: true };
const { leaves } = objectToLeaves(output);
const root = merkleRoot(leaves);

// --- 2. Contract: a typed property assertion, signed by both parties ---
const schema = z.object({ summary: z.string(), wordCount: z.number(), approved: z.boolean() });
const contractUnsigned = {
  schemaVersion: '0.0.1',
  taskId: 'q3-report',
  parties: { provider: provider.publicKey, evaluator: evaluator.publicKey },
  predicates: [schemaPredicate(schema)],
  metadata: {},
};
const contractBytes = canonicalizeBytes(contractUnsigned);
const contract = {
  ...contractUnsigned,
  signatures: {
    provider: await sign(contractBytes, provider.privateKey),
    evaluator: await sign(contractBytes, evaluator.privateKey),
  },
};
const contractRef = bytesToHex(sha256(canonicalizeBytes(contract)));

// --- 3. Submission: the Merkle commitment + a signed receipt ---
const submissionUnsigned = {
  schemaVersion: '0.0.1',
  contractRef,
  merkleRoot: root,
  leafCount: leaves.length,
  receipt: { timestamp: '2026-06-02T12:00:00.000Z', providerNote: 'done' },
};
const submission = {
  ...submissionUnsigned,
  signature: await sign(signingPayload(submissionUnsigned), provider.privateKey),
};

// --- 4. The evaluator drives the flow; the provider answers reveal requests.
//        In-process here; over A2A/HTTP this callback wraps the network hop. ---
const submissionRef = bytesToHex(sha256(canonicalizeBytes(submission)));
const requestReveal = async (predicateIndex, leafIndices) => ({
  submissionRef,
  predicateIndex,
  leafIndices,
  leaves: leafIndices.map((i) => leaves[i]),
  proofs: leafIndices.map((i) => merkleProof(leaves, i)),
});

const claim = await evaluate(contract, submission, evaluator, { requestReveal });

// --- The claim is a portable, signed attestation anyone can verify ---
assert(claim.passed === true, 'claim should pass for conforming output');
assert(await verify(claim.signature, signingPayload(claim), evaluator.publicKey),
  'claim signature must verify under the evaluator public key');

console.log('✅ Happy path — signed VerifierClaim produced and verified:');
console.log(JSON.stringify(claim, null, 2));

// --- Negative path: non-conforming output is rejected ---
const badOutput = { summary: 'x', wordCount: 'three', approved: true }; // wordCount wrong type
const bad = objectToLeaves(badOutput);
const badSubUnsigned = {
  ...submissionUnsigned,
  merkleRoot: merkleRoot(bad.leaves),
  leafCount: bad.leaves.length,
};
const badSubmission = {
  ...badSubUnsigned,
  signature: await sign(signingPayload(badSubUnsigned), provider.privateKey),
};
const badSubmissionRef = bytesToHex(sha256(canonicalizeBytes(badSubmission)));
const badReveal = async (predicateIndex, leafIndices) => ({
  submissionRef: badSubmissionRef,
  predicateIndex,
  leafIndices,
  leaves: leafIndices.map((i) => bad.leaves[i]),
  proofs: leafIndices.map((i) => merkleProof(bad.leaves, i)),
});

const badClaim = await evaluate(contract, badSubmission, evaluator, { requestReveal: badReveal });
assert(badClaim.passed === false, 'claim should fail for non-conforming output');

console.log('\n✅ Negative path — non-conforming output correctly rejected:');
console.log('   ', badClaim.predicateResults[0].detail);
