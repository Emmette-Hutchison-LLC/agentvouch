// agentvouch — Ed25519 signing wrappers
// See PROTOCOL.md §Signing scheme

import type { PublicKey, Signature } from '../types/crypto.js';

export interface KeyPair {
  publicKey: PublicKey;
  privateKey: Uint8Array;
}

// TODO(v0): implement Ed25519 wrappers around @noble/ed25519.
// For W22 scaffolding pass: stubs; impl in next session.

export function generateKeyPair(): Promise<KeyPair> {
  throw new Error('generateKeyPair: not implemented yet (see PROTOCOL.md §Signing)');
}

export function sign(_message: Uint8Array, _privateKey: Uint8Array): Promise<Signature> {
  throw new Error('sign: not implemented yet (see PROTOCOL.md §Signing)');
}

export function verify(
  _signature: Signature,
  _message: Uint8Array,
  _publicKey: PublicKey
): Promise<boolean> {
  throw new Error('verify: not implemented yet (see PROTOCOL.md §Signing)');
}
