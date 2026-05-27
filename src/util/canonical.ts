// Canonical JSON serialization (RFC 8785 subset).
// See PROTOCOL.md §Signing scheme §Canonical serialization:
//   "JSON with sorted object keys, UTF-8 encoded, no whitespace"
//
// This is sufficient for v0. Pre-v0.1.0 spec freeze: decide whether to mandate
// the full RFC 8785 (JCS) or define our own subset (see PROTOCOL.md §Open spec questions).

export function canonicalize(value: unknown): string {
  return _canon(value);
}

function _canon(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new Error('canonicalize: non-finite number (NaN/Infinity) is not representable in JSON');
    }
    // For v0 simplicity, use ECMAScript's stringify-of-number (Number.prototype.toString).
    // RFC 8785 §3.2.2.3 defines a stricter shortest-round-trip form; deferred to v0.1.0 spec freeze.
    return JSON.stringify(v);
  }

  if (typeof v === 'string') {
    // JSON.stringify already handles UTF-8 string escaping per RFC 8259.
    return JSON.stringify(v);
  }

  if (Array.isArray(v)) {
    return '[' + v.map(_canon).join(',') + ']';
  }

  if (typeof v === 'object') {
    // Plain object: sort keys, recurse
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs: string[] = [];
    for (const k of keys) {
      pairs.push(JSON.stringify(k) + ':' + _canon(obj[k]));
    }
    return '{' + pairs.join(',') + '}';
  }

  throw new Error(`canonicalize: unserializable value of type ${typeof v}`);
}

/**
 * Returns canonical-JSON encoding as a UTF-8 Uint8Array.
 * Useful for hashing or signing — most cryptographic operations take bytes.
 */
export function canonicalizeBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
