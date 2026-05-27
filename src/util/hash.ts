// SHA-256 helper. Thin re-export from @noble/hashes for use across the codebase.
// See PROTOCOL.md §Merkle commitment scheme §Hash.

import { sha256 as nobleSha256 } from '@noble/hashes/sha2';

export function sha256(input: Uint8Array): Uint8Array {
  return nobleSha256(input);
}
