// Ed25519 signing wrappers.
// See PROTOCOL.md §Signing scheme.
//
// Uses @noble/ed25519 v2.x async API throughout — the async path bundles the
// hash function internally and requires no setup. The sync API (`sign`,
// `verify`, `getPublicKey`) requires explicit hash injection via `ed.etc`;
// async path is simpler for our use case and equally fast on Node 20+.

import * as ed from '@noble/ed25519';

import type { PublicKey, Signature } from '../types/crypto.js';
import { bytesToHex, hexToBytes } from '../util/hex.js';
import { canonicalizeBytes } from '../util/canonical.js';

export interface KeyPair {
  publicKey: PublicKey;     // hex-encoded, 0x-prefixed, 66 chars
  privateKey: Uint8Array;   // 32 raw bytes; KEEP SECRET
}

/**
 * The canonical bytes signed over for any object carrying its own `signature`
 * field (Submission, Reveal, VerifierClaim): canonical-JSON of the object with
 * the `signature` field removed. See PROTOCOL.md §Signing scheme. This is the
 * single source of truth so signers and verifiers can never drift.
 */
export function signingPayload<T extends object>(obj: T): Uint8Array {
  const { signature: _signature, ...rest } = obj as Record<string, unknown>;
  return canonicalizeBytes(rest);
}

/**
 * Generate a fresh Ed25519 keypair using a CSPRNG.
 *
 * Returns the public key as a hex string for wire/JSON use and the private key
 * as raw bytes for in-memory signing operations. CALLER IS RESPONSIBLE FOR
 * KEEPING THE PRIVATE KEY SAFE — agentvouch never persists it.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKey,
    publicKey: bytesToHex(publicKeyBytes),
  };
}

/**
 * Sign `message` with the given private key. Returns a 0x-prefixed hex
 * signature (130 chars: 64 bytes + 2 prefix).
 */
export async function sign(message: Uint8Array, privateKey: Uint8Array): Promise<Signature> {
  const sigBytes = await ed.signAsync(message, privateKey);
  return bytesToHex(sigBytes);
}

/**
 * Verify a signature over `message` for the given public key. Returns true
 * iff the signature is valid AND the inputs are well-formed.
 *
 * Defensive: returns false (not throws) on any format error. Throwing would
 * leak details about WHY a signature failed; the caller doesn't need that.
 */
export async function verify(
  signature: Signature,
  message: Uint8Array,
  publicKey: PublicKey
): Promise<boolean> {
  try {
    const sigBytes = hexToBytes(signature);
    const pubBytes = hexToBytes(publicKey);
    if (sigBytes.length !== 64 || pubBytes.length !== 32) return false;
    return await ed.verifyAsync(sigBytes, message, pubBytes);
  } catch {
    return false;
  }
}
