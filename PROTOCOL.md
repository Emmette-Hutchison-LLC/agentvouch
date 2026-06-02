# agentvouch — Protocol Specification (PROTOCOL.md)

> **Canonical artifact.** This file is the language-independent specification for agentvouch. The reference TypeScript implementation in `src/` follows this spec; a Rust implementation for the zk-adapter path will follow the same spec. **Behavior changes go here first; implementation follows.**

> **Version**: 0.0.1-draft (2026-05-26). Pre-release; expect breaking changes until v0.1.0.

## Goals

agentvouch defines a protocol for two parties to exchange work with **verifiable handoff** and **selective state disclosure**:

1. Parties commit to a task with **typed property assertions** about the output.
2. The provider submits work as a **Merkle commitment** plus an Ed25519-signed receipt.
3. The evaluator runs each predicate against the submission. For *revealing* predicates, the provider selectively discloses Merkle leaves; for *deterministic* predicates, the evaluator re-executes the check.
4. The evaluator produces a signed `VerifierClaim` attesting which predicates passed.

This protocol fills the missing **declarative Evaluator** in [ERC-8183 (Agentic Commerce)](https://eips.ethereum.org/EIPS/eip-8183) — the standard reserves the Evaluator role but does not specify how verification logic is expressed.

## Non-goals

- **No payment.** Use [x402](https://github.com/coinbase/x402) / USDC on Base. agentvouch's `VerifierClaim` is the *gate* for payment release, not the payment itself.
- **No identity.** Use ERC-8004 Validation Registry or DIDs. agentvouch *consumes* identity; it does not issue it.
- **No dispute resolution.** Use [Kleros](https://kleros.io/) (or, when shipped, the constellation primitive `agentpanel`). agentvouch's `VerifierClaim` is the *outcome* a dispute layer can verify against.
- **No compute-fidelity proof.** Use AWS Nitro Enclaves, opML, or zkVMs as predicate-adapter backends. agentvouch *composes* with them.

## Conceptual model

```
            ┌───────────────────┐
            │  Contract         │  (declarative spec; signed by both parties)
            │  • taskId         │
            │  • parties        │
            │  • predicates[]   │
            └─────────┬─────────┘
                      │
        (provider does the work)
                      │
            ┌─────────▼─────────┐
            │  Submission       │  (output committed via Merkle tree; signed)
            │  • merkleRoot     │
            │  • receipt        │
            │  • signature      │
            └─────────┬─────────┘
                      │
            (evaluator verifies)
                      │
                      ▼
    For each predicate in Contract.predicates:
      • REVEALING predicate → provider selectively reveals Merkle leaves
      • DETERMINISTIC predicate → evaluator re-executes the check on committed bytes
                      │
                      ▼
            ┌───────────────────┐
            │  VerifierClaim    │  (signed by evaluator)
            │  • contractRef    │
            │  • submissionRef  │
            │  • predicateResults[]    (one per Contract.predicates entry)
            │  • passed         │  (boolean: AND over predicateResults)
            │  • signature      │
            └───────────────────┘
```

## Types

### `Contract`

Declarative spec for a verifiable task. Signed by both parties to be valid.

```text
Contract {
  schemaVersion: "0.0.1"
  taskId: string                  // unique task identifier (UUID v7 or hash)
  parties: {
    provider: PublicKey          // Ed25519 public key
    evaluator: PublicKey         // Ed25519 public key
  }
  predicates: Predicate[]         // typed property assertions; see §Predicate
  metadata: object                // free-form; not signed-over
  signatures: {
    provider: Signature          // signature over canonical-JSON-serialized Contract (minus signatures)
    evaluator: Signature
  }
}
```

### `Predicate`

Each predicate is a typed property assertion. Two flavors:

**Revealing predicate** — the property is checked by selectively revealing leaves of the Merkle tree:
```text
RevealingPredicate {
  kind: "revealing"
  predicateType: string          // e.g., "schema-validation", "pii-absence"
  spec: PredicateSpec             // shape depends on predicateType (typed adapter contracts; see §Predicate adapters)
  reveal: {
    selector: LeafSelector       // declarative: "leaves matching JSONPath X" or "leaves 0..N"
  }
}
```

**Deterministic predicate** — the evaluator re-executes a check against the committed bytes; no selective reveal needed:
```text
DeterministicPredicate {
  kind: "deterministic"
  predicateType: string          // e.g., "output-length-bound", "structural-match"
  spec: PredicateSpec             // shape depends on predicateType
}
```

### `Submission`

Provider's output committed via Merkle tree.

```text
Submission {
  schemaVersion: "0.0.1"
  contractRef: HashOf<Contract>   // SHA-256 of canonical-JSON-serialized signed Contract
  merkleRoot: Hash                // SHA-256 root of the Merkle tree over output leaves
  leafCount: integer              // total number of leaves (for verifier to bound size)
  receipt: {
    timestamp: ISO8601
    providerNote: string?         // optional context
  }
  signature: Signature            // Ed25519 over { merkleRoot, leafCount, receipt }
}
```

Selective disclosure happens *after* `Submission` is committed. The provider responds to evaluator's reveal requests with `Reveal` messages:

```text
Reveal {
  submissionRef: HashOf<Submission>
  predicateIndex: integer         // which predicate in Contract.predicates this is for
  leafIndices: integer[]          // which Merkle leaves are being revealed
  leaves: bytes[]                 // the leaf data (one entry per leafIndex)
  proofs: MerkleProof[]           // Merkle inclusion proofs (one per leaf)
}
```

### `VerifierClaim`

The signed attestation from the evaluator.

```text
VerifierClaim {
  schemaVersion: "0.0.1"
  contractRef: HashOf<Contract>
  submissionRef: HashOf<Submission>
  predicateResults: PredicateResult[]   // one per Contract.predicates entry
  passed: boolean                  // AND over all predicateResults
  evaluatedAt: ISO8601
  signature: Signature             // Ed25519 by evaluator
}

PredicateResult {
  predicateIndex: integer
  passed: boolean
  detail: string?                  // human-readable explanation, optional
  // NEVER includes the underlying revealed leaves — those stay in evaluator's local state
}
```

## Merkle commitment scheme

- **Hash**: SHA-256
- **Tree shape**: binary, with leaves ordered as the canonical serialization order of the output (e.g., for a JSON output, leaves are the top-level entries in object-key-sorted order)
- **Empty leaves**: padded with `0x00...00` (32 bytes of zero) to next power of 2 for proof construction
- **Domain separation**: leaf-hash uses prefix `0x00`; internal-hash uses prefix `0x01` (RFC 6962-style)
- **Proof shape**: `{ leafIndex: integer, siblings: Hash[] }` — siblings ordered from leaf upward to root

A canonical Merkle implementation will be in `src/merkle/`. Test vectors in `tests/merkle/` define expected hashes for known inputs.

## Signing scheme

- **Algorithm**: Ed25519 (RFC 8032)
- **Library**: `@noble/ed25519` (TypeScript reference impl) / `ed25519-dalek` (Rust port)
- **Canonical serialization**: JSON with sorted object keys, UTF-8 encoded, no whitespace
- **Signed-over field**: every `Submission`, `Reveal`, and `VerifierClaim` includes a `signature` field — the canonical-JSON of the object *minus the signature field* is what gets signed
- **Public key format**: 32-byte raw bytes, hex-encoded in JSON contexts, prefixed `0x`

## Predicate adapters

A predicate adapter is a typed module that implements a `PredicateType`. Adapters live in `src/predicates/` (TypeScript reference) or `predicates/` (Rust port). The minimal adapter interface:

```text
interface PredicateAdapter<S> {
  predicateType: string             // unique identifier; e.g., "schema-validation"
  flavor: "revealing" | "deterministic"
  parseSpec(rawSpec): S              // type the predicate's `spec` field
  evaluate(spec: S, evidence): PredicateResult
    // for revealing: evidence includes revealed leaves
    // for deterministic: evidence is the committed root + bounded re-execution context
}
```

### v0 adapters (TypeScript)

1. **`schema-validation`** (revealing): output must validate against a Zod schema. Spec contains the schema (serialized as JSON Schema or Zod-AST). Reveals the leaves required by the schema check.
2. **`pii-absence`** (revealing + heuristic): output must not contain PII-shaped strings. Spec contains the regex set + a flag for LLM cross-check. Reveals all leaves to the evaluator (since PII-absence requires full content); useful for narrow leaf-set outputs.
3. **`url-derived`** (revealing, external attestation): output property "this string was sourced from URL X with content Y at time T". Spec contains the URL + expected substring. Reveals the relevant leaves and validates against a Reclaim Protocol attestation provided alongside.

### v1+ adapters (planned)

- `nitro-enclave-reexec` — deterministic; evaluator re-executes a Nitro Enclave check
- `tlsnotary` — revealing + external attestation; verifies HTTPS-derived payloads
- `output-length-bound` — deterministic; simple bound check
- `structural-match` — deterministic; output is valid JSON matching structural property

### v2+ adapters (zk path)

- `zk-noir` — revealing; provider provides a Noir + Barretenberg proof of property P over the output
- `zk-risc0` — revealing; provider provides a RISC Zero proof of property P (when predicate is naturally a Rust program)

The protocol spec doesn't change for zk adapters — only the adapter implementations change. This is why **the protocol spec is the canonical artifact**.

## Wire protocol (basic interaction sequence)

The protocol is transport-agnostic. Reference implementations use:
- **Local**: direct function call (for in-process use)
- **HTTP**: REST endpoints with JSON bodies (for cross-process use)
- **A2A**: agent-to-agent protocol messages (when both parties speak A2A — the recommended cross-firm transport)

### Sequence

1. **Contract formation** (out of scope for agentvouch — use [agentpact](https://github.com/Emmette-Hutchison-LLC/agentpact) when it ships, or hand-roll for v0)
2. **Provider does work**, produces output
3. **Provider builds Submission** = Merkle commitment + signed receipt
4. **Provider sends Submission to evaluator** (transport-dependent)
5. **For each predicate** in Contract.predicates:
   - If revealing: evaluator requests `Reveal` for specific leaves; provider responds with `Reveal`; evaluator runs the predicate adapter
   - If deterministic: evaluator runs the predicate adapter against bounded re-execution context
6. **Evaluator builds VerifierClaim** = signed attestation of pass/fail per predicate
7. **Evaluator sends VerifierClaim** to provider (and to any settlement layer — e.g., x402, EAS, ERC-8183)

## Composability with the constellation

agentvouch composes with future primitives in the [Agent-Native Firm Substrate](https://github.com/Emmette-Hutchison-LLC/) constellation:

- **agentpact** — Contract formation (negotiates the typed terms before agentvouch verifies)
- **agentfind** — Capability discovery (finds agents with relevant agentvouch claim history)
- **agentchron** — Cross-firm temporal accountability (audits the sequence of agentvouch claims)
- **agentprove** — Selective knowledge exposure (proves standing claims without revealing evidence; extends agentvouch's selective-disclosure pattern from outputs to standing state)
- **agentexec** — Compute attestation (may be a sub-repo within agentvouch; predicate-adapter shaped)
- **agentrep** — Cross-firm reputation portability (aggregates agentvouch outcomes across protocols)
- **agentpanel** — Light-touch dispute escalation (handles subjective-predicate disagreements before Kleros)

Each constellation primitive ships as its own MIT-licensed repo when demand surfaces.

## Versioning

- **`schemaVersion`** field on every signed object — bumped when wire-format changes
- **`agentvouch` library version** — semver; matches the protocol's `schemaVersion` minor digit
- **PROTOCOL.md** carries the authoritative version statement at the top of this file

## Security considerations

- **Replay protection**: include `taskId` and timestamps in signed payloads; verifier must reject duplicate `submissionRef` for the same `contractRef`
- **Time-of-check vs time-of-use**: predicate adapters that fetch external state (Reclaim, URL-derived) must include the attestation timestamp; verifier must reject stale attestations
- **Key compromise**: parties should publish key-revocation events on-chain (ERC-8004 supports this) and verifiers should check against the latest revocation list before signing claims
- **Side channels in selective disclosure**: revealing predicate adapters must select leaves *deterministically* given the spec — random or adversarial leaf selection could leak more than the predicate requires
- **Malicious evaluator**: agentvouch does NOT defend against an evaluator who signs a false claim; that's the dispute layer's job (Kleros / agentpanel). The architecture assumes the evaluator is incentivized correctly via x402 settlement or reputation (ERC-8004 + agentrep)

## References

- ERC-8183 (Agentic Commerce): https://eips.ethereum.org/EIPS/eip-8183
- ERC-8004 (Trustless Agents): https://eips.ethereum.org/EIPS/eip-8004
- x402 (HTTP-402 revival): https://github.com/coinbase/x402
- EAS (Ethereum Attestation Service): https://attest.org/
- Reclaim Protocol: https://reclaimprotocol.org/
- FairSwap (Dziembowski, Eckey, Faust, CCS 2018): the foundational Merkle-commit + Proof-of-Misbehaviour pattern
- Attribute Verifiable Timed Commitments (IACR ePrint 2022/717): research-grade primitive
- RFC 6962 (Certificate Transparency) §2.1: domain-separated Merkle tree hashing
- RFC 8032 (Ed25519): signing scheme

## Open spec questions (pre-v0.1.0)

These are spec-level questions still open before v0.1.0 finalizes:

1. **Canonical JSON serialization**: should we mandate JCS (RFC 8785) or define our own subset? JCS adds dependency weight; custom is simpler but less interop. **Default: JCS** for v0.
2. **Leaf size limits**: should we cap leaf bytes? Large leaves bloat Merkle proofs. **Default: 4 KB per leaf**; spec-level normative.
3. **Predicate composition**: should `Contract.predicates` support `AND`/`OR`/conditional logic, or stay a flat AND-list? **Default: flat AND** for v0; add composition in v0.2 if needed.
4. **Pre-image space for `taskId`**: should `taskId` be required to be a hash (deterministic) or allowed as a UUID (random)? **Default: either** — verifier rejects only on duplicate.
5. **Adapter discovery**: should `predicateType` resolve via a registry (on-chain or off-chain) or via static import in the verifier? **Default: static import** for v0; registry-based in v1.
6. **Predicate-supplied regex safety (ReDoS)**: adapters whose spec carries caller-supplied regular expressions (e.g. `pii-absence`) can be handed a pathological pattern that backtracks catastrophically against a long disclosed string, hanging the evaluator. The pattern lives in the mutually-signed `Contract`, so it is not unilaterally attacker-injected — but an evaluator should not have to manually vet regex complexity before signing. **Default for v0**: trust the signed contract + enforce the §Leaf size limits cap; **v1**: a linear-time engine (RE2) or per-predicate evaluation timeout with worker isolation.

These resolve in v0.1.0 spec freeze. Issues + discussion welcome.
