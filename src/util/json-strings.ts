// Recursively collect scalar values from a JSON value, paired with a JSONPath
// pointing at each. Shared by predicate adapters that scan disclosed output
// (pii-absence, url-derived).
//
// By default only string values are collected. `includeNumbers` also collects
// numeric values (stringified) — needed so e.g. a credit-card-shaped value
// stored as a JS number is not silently skipped. A `maxDepth` guard throws on
// adversarially deep nesting so a malicious committed leaf cannot exhaust the
// call stack; callers scanning untrusted output should fail closed on that throw.

export type StringHit = [path: string, value: string];

export interface CollectOptions {
  includeNumbers?: boolean;
  maxDepth?: number; // default 256
}

export function collectStrings(value: unknown, opts: CollectOptions = {}): StringHit[] {
  const includeNumbers = opts.includeNumbers ?? false;
  const maxDepth = opts.maxDepth ?? 256;
  const out: StringHit[] = [];

  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > maxDepth) {
      throw new Error(`collectStrings: input nesting exceeds maxDepth ${maxDepth}`);
    }
    if (typeof v === 'string') {
      out.push([path, v]);
    } else if (includeNumbers && typeof v === 'number' && Number.isFinite(v)) {
      out.push([path, String(v)]);
    } else if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, `${path}[${i}]`, depth + 1));
    } else if (v !== null && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        walk(val, path === '$' ? `$.${k}` : `${path}.${k}`, depth + 1);
      }
    }
  };

  walk(value, '$', 0);
  return out;
}
