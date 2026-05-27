// Hex encoding helpers — Uint8Array ↔ "0x..." strings.
// See PROTOCOL.md §Types §crypto: "Representation: hex-encoded with 0x prefix
// at the wire/JSON layer; raw bytes (Uint8Array) at the in-memory layer."

export function bytesToHex(bytes: Uint8Array): string {
  let s = '0x';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (stripped.length % 2 !== 0) {
    throw new Error(`hexToBytes: odd-length hex string (${stripped.length} chars)`);
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(stripped.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`hexToBytes: non-hex characters at offset ${i * 2}`);
    }
    out[i] = byte;
  }
  return out;
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (const a of arrays) totalLen += a.length;
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
