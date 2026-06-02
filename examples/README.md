# Examples

CLI demo + integration examples land here as agentvouch v0 builds out.

## Available

- [`e2e-demo.mjs`](./e2e-demo.mjs) — the full protocol flow (Contract →
  Submission → VerifierClaim) using only the public `agentvouch` API, with both
  a happy path and a rejected non-conforming output. Run it with:

  ```sh
  npm run build && node examples/e2e-demo.mjs
  ```

## Planned for W22-W24:

- `cli-demo/` — end-to-end CLI exercising all 3 v0 predicate adapters (schema validation, PII-absence, URL-derived via Reclaim)
- `erc-8183-integration/` — example wiring agentvouch into ERC-8183's Evaluator slot (Phase 1)
- `x402-payment-gating/` — example using agentvouch's VerifierClaim to gate x402 payment release (Phase 3)
