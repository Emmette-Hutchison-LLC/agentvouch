# agentvouch

> **Status: WIP — initial scaffolding. Not yet a publishable v0.1.0.**

A typed property-predicate DSL + verifier reference implementation for the agent-native firm. Plugs into [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183)'s Evaluator slot.

## The one-paragraph

Two parties — human or agent — commit to a task with output-property assertions. One submits work, the other verifies the property **without seeing the full output**, settles on verification. agentvouch is the first published primitive in a constellation of post-firm collaboration tools described in the [Agent-Native Firm Substrate](https://github.com/Emmette-Hutchison-LLC/agentvouch/blob/main/PROTOCOL.md) thesis.

## What this is, what this isn't

**It IS**:
- A typed property-predicate language (`Contract`)
- A Merkle commit / selective-reveal protocol (`Submission`)
- A verifier reference implementation that produces signed attestations (`VerifierClaim`)
- A reference Evaluator for ERC-8183 (`Agentic Commerce`, mainnet March 2026)
- ~400-700 lines of MIT-licensed TypeScript when v0 lands

**It IS NOT**:
- A court (use [Kleros](https://kleros.io/))
- A payment rail (use [x402](https://github.com/coinbase/x402) / USDC on Base)
- A commerce envelope (use ERC-8183 itself)
- An identity registry (use [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004))
- A compute-fidelity prover (Gensyn / Bittensor Subnet 2 own that lane)

## Cryptographic ancestry (we owe a debt)

agentvouch's Merkle-commit-plus-selective-reveal protocol is essentially **FairSwap** (Dziembowski, Eckey, Faust, CCS 2018) re-packaged for agent context with a typed property-predicate language on top. The math is 8 years old; the novelty is the packaging.

Cited research-grade primitive for rigor: **Attribute Verifiable Timed Commitments** (IACR ePrint 2022/717).

Adjacent agent-context projects we acknowledge as lineage (none of which compose into the same primitive): [Nobulex](https://github.com/nobulexdev/nobulex), [PACT (jmcentire)](https://github.com/jmcentire/pact), AgenC.

## Why not zkSNARKs (yet)?

v0 ships **commit-reveal + Merkle + Ed25519**. We deliberately skip the heavy zk machinery for v0. The position-statement: "the minimum viable trust primitive is one signature plus one Merkle root, not one Groth16 proof."

Counter-argument we honestly cite alongside the pro-zk wave (zkAgent, NANOZK): **"Tool Receipts, Not Zero-Knowledge Proofs"** (arXiv 2603.10060).

A zk adapter for v2+ is real, not "maybe later" — see [PROTOCOL.md §Predicate Adapters](./PROTOCOL.md#predicate-adapters) and the roadmap below.

## Roadmap

Phased. Sequenced by dependency, not by time.

| Phase | Goal |
|---|---|
| **0** *(in progress)* | Ship the v0 MIT toy — types + Merkle + Ed25519 + 3 predicate demos (schema validation, PII-absence, URL-derived via Reclaim) + CLI |
| 1 | ERC-8183 Evaluator adapter + ERC-8004 Validation Registry adapter + EAS-on-Base settlement |
| 2 | Predicate-adapter waterfront: AWS Nitro Enclaves (re-execution), Reclaim Protocol (URL-derived), TLSNotary proxy (verifiable HTTPS) |
| 3 | x402 payment-gating adapter — closes the value-exchange loop |
| 4 | zk predicate adapter (Noir + Barretenberg, recommended over RISC Zero given Apple Silicon compatibility) — only if real predicates demand it |
| 5 | Hosted Evaluator SaaS — first monetization |
| 6 | Enterprise tier — audit-grade predicates, multi-jurisdiction compliance |

## Documentation

- **[PROTOCOL.md](./PROTOCOL.md)** — language-independent canonical specification. Read this if you want to port the implementation to Rust or write an interop tool.
- Full vision + prior art + constellation thesis: see the [Agent-Native Firm Substrate thesis doc](https://github.com/Emmette-Hutchison-LLC/agentvouch/blob/main/PROTOCOL.md) (will move to the public Substack when the first thesis essay publishes).

## Install (when v0.1.0 ships)

```bash
npm install agentvouch
# or
pnpm add agentvouch
```

(Not yet on npm. Publishing with v0.1.0.)

## Quick example (planned API, not yet implemented)

```typescript
import { Contract, Submission, evaluate, schemaPredicate } from 'agentvouch';
import { z } from 'zod';
import { generateKeyPair } from '@noble/ed25519';

// Define what counts as a valid output
const outputSchema = z.object({
  summary: z.string().min(50),
  citations: z.array(z.string().url()).min(1),
});

// Contract: two parties commit to a task with property predicates
const contract: Contract = {
  taskId: 'summary-task-001',
  parties: { provider: providerPubkey, evaluator: evaluatorPubkey },
  predicates: [schemaPredicate(outputSchema)],
};

// Provider submits Merkle-committed output
const submission: Submission = await Submission.commit(output, providerKeyPair);

// Evaluator verifies the property WITHOUT seeing the full output
// (for schema-validation, the leaves required to check the schema are selectively revealed)
const claim = await evaluate(contract, submission, evaluatorKeyPair);

console.log(claim.passed); // boolean
console.log(claim.signature); // Ed25519 signed attestation
```

## Contributing

Issues + PRs welcome. Style guide: read [PROTOCOL.md](./PROTOCOL.md) first; the protocol spec is the canonical artifact, not the implementation. Behavior changes go to PROTOCOL.md first.

## License

MIT — see [LICENSE](./LICENSE).
