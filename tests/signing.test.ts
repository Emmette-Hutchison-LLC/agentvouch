// Ed25519 signing tests
// See PROTOCOL.md §Signing scheme

import { describe, it, expect } from 'vitest';
import { generateKeyPair, sign, verify } from '../src/signing/ed25519.js';
import { hexToBytes, bytesToHex } from '../src/util/hex.js';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('generateKeyPair', () => {
  it('produces a 32-byte private key and a 0x-prefixed 66-char public key', async () => {
    const kp = await generateKeyPair();
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('produces distinct keys on successive calls', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    expect(bytesToHex(a.privateKey)).not.toBe(bytesToHex(b.privateKey));
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('sign + verify', () => {
  it('round-trips: signed messages verify under the matching public key', async () => {
    const kp = await generateKeyPair();
    const msg = utf8('hello world');
    const sig = await sign(msg, kp.privateKey);
    expect(sig).toMatch(/^0x[0-9a-f]{128}$/);
    expect(await verify(sig, msg, kp.publicKey)).toBe(true);
  });

  it('verification fails for the wrong public key', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const msg = utf8('hello');
    const sig = await sign(msg, a.privateKey);
    expect(await verify(sig, msg, b.publicKey)).toBe(false);
  });

  it('verification fails for a tampered message', async () => {
    const kp = await generateKeyPair();
    const sig = await sign(utf8('hello'), kp.privateKey);
    expect(await verify(sig, utf8('hellp'), kp.publicKey)).toBe(false);
  });

  it('verification returns false (does not throw) on malformed signature', async () => {
    const kp = await generateKeyPair();
    expect(await verify('0xabc', utf8('hello'), kp.publicKey)).toBe(false);
    expect(await verify('not-hex', utf8('hello'), kp.publicKey)).toBe(false);
  });

  it('verification returns false on malformed public key', async () => {
    const kp = await generateKeyPair();
    const sig = await sign(utf8('hello'), kp.privateKey);
    expect(await verify(sig, utf8('hello'), '0xabc')).toBe(false);
  });
});

describe('RFC 8032 test vector 1 (empty message)', () => {
  // RFC 8032 §7.1 — Ed25519 test vector 1
  const privateKeyHex = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const expectedPubKey = '0xd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const expectedSig =
    '0xe5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

  it('signs and verifies the canonical empty-message vector', async () => {
    const privateKey = hexToBytes(privateKeyHex);
    const sig = await sign(new Uint8Array(0), privateKey);
    expect(sig).toBe(expectedSig);
    expect(await verify(sig, new Uint8Array(0), expectedPubKey)).toBe(true);
  });
});
