// agentvouch — shared cryptographic primitive types
//
// Representation: hex-encoded with `0x` prefix at the wire/JSON layer; raw
// bytes (Uint8Array) at the in-memory layer. Conversion is the boundary.

export type Hash = string;       // hex-encoded SHA-256 with 0x prefix; 66 chars
export type PublicKey = string;  // hex-encoded Ed25519 public key with 0x prefix; 66 chars
export type Signature = string;  // hex-encoded Ed25519 signature with 0x prefix; 130 chars

export const HASH_HEX_LENGTH = 66;          // '0x' + 64 hex chars (32 bytes)
export const PUBKEY_HEX_LENGTH = 66;        // '0x' + 64 hex chars (32 bytes)
export const SIGNATURE_HEX_LENGTH = 130;    // '0x' + 128 hex chars (64 bytes)
