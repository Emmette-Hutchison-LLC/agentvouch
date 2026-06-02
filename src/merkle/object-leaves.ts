// Object ↔ Merkle-leaf encoding.
// See PROTOCOL.md §Merkle commitment scheme:
//   "leaves are the top-level entries in object-key-sorted order".
//
// v0 leaf encoding: each top-level entry of a JSON object becomes one leaf,
// encoded as the canonical JSON of the 2-tuple [key, value]. Binding the key
// into the leaf makes a revealed leaf self-describing — the evaluator learns
// which property each revealed leaf carries without trusting the provider's
// ordering claims. This pairs with the selective-disclosure flow: revealing a
// subset of leaves reconstructs exactly the corresponding subset of properties.

import { canonicalizeBytes } from '../util/canonical.js';

export interface ObjectLeaves {
  leaves: Uint8Array[];
  keys: string[]; // the sorted keys, parallel to `leaves`
}

/**
 * Encode a plain JSON object into ordered Merkle leaves. Keys are sorted so the
 * leaf order is canonical and reproducible by any party holding the same object.
 */
export function objectToLeaves(obj: Record<string, unknown>): ObjectLeaves {
  const keys = Object.keys(obj).sort();
  const leaves = keys.map((k) => canonicalizeBytes([k, obj[k]]));
  return { leaves, keys };
}

/**
 * Reconstruct a (possibly partial) object from a set of leaves. Each leaf must
 * decode to a `[key, value]` tuple with a string key. Passing only a subset of
 * a commitment's leaves yields exactly the corresponding subset of properties —
 * this is how a revealing predicate adapter rebuilds the disclosed portion of
 * the output.
 */
export function leavesToObject(leaves: Uint8Array[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const leaf of leaves) {
    const decoded = JSON.parse(new TextDecoder().decode(leaf)) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2) {
      throw new Error('leavesToObject: leaf is not a [key, value] tuple');
    }
    const [key, value] = decoded;
    if (typeof key !== 'string') {
      throw new Error('leavesToObject: leaf key is not a string');
    }
    // A leaf survives Merkle verification before reaching here, so it's genuinely
    // committed — but a committed leaf can still carry a prototype-manipulating
    // key. Reject them so reconstruction can't alter the object's prototype.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`leavesToObject: unsafe key "${key}"`);
    }
    out[key] = value;
  }
  return out;
}
